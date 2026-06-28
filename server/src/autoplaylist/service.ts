import type { AutoPlaylist, Track } from "@resonarr/shared";
import { PlexClient } from "../plex/client.ts";
import { config } from "../config/env.ts";
import { services } from "../services.ts";
import { getSettings } from "../settings/service.ts";
import { log } from "../log/service.ts";
import {
  feedbackKeyForOwner,
  filterDisliked,
  getFeedbackSets,
} from "../feedback/service.ts";
import { likedNeighborIds } from "../feedback/boost.ts";
import { normalize } from "../matching/match.ts";
import {
  DAY_MS,
  getAutoPlaylist,
  getAutoPlaylistOwner,
  getRecentHistoryIds,
  listAutoPlaylists,
  markRun,
  pruneHistory,
  recordHistory,
} from "./store.ts";

const SEED_LIMIT = 12; // distinct recent artists to seed from
const PER_SEED = 25; // sonic neighbors per seed
const RECENT_ADDED = 150; // newly-added pool size for the new-music bias
const HISTORY_CYCLES = 4; // exclude tracks used within the last N intervals
const TICK_MS = 5 * 60 * 1000; // scheduler poll interval
const BOOT_DELAY_MS = 15_000; // first catch-up tick after startup

/** Full Plex playlist title, applying the user's configured prefix. */
function playlistTitle(name: string): string {
  const prefix = getSettings().playlistPrefix.trim();
  return prefix ? `${prefix} · ${name}` : name;
}

/**
 * Build the track list for a Discover-Weekly-style run: seed from recent
 * listening, expand by sonic similarity, bias toward newly-added and
 * not-recently-played tracks, and drop anything played lately or already used
 * by a recent run of this definition.
 */
async function buildDiscoverWeekly(
  plex: PlexClient,
  ap: AutoPlaylist,
  userKey: string,
): Promise<string[]> {
  const sonic = services.sonic;
  if (!sonic) throw new Error("Plex is not configured");

  const section = await plex.getMusicSection();
  const recent = await plex.getRecentlyPlayed(section.key, 60);

  // One seed per distinct recently-played artist.
  const seeds: Track[] = [];
  const seenArtist = new Set<string>();
  for (const t of recent) {
    const key = t.artist.toLowerCase();
    if (key && seenArtist.has(key)) continue;
    if (key) seenArtist.add(key);
    seeds.push(t);
    if (seeds.length >= SEED_LIMIT) break;
  }
  if (seeds.length === 0) {
    throw new Error("No recent listening history in Plex to seed from.");
  }

  // Newly-added pool — a sonic neighbor that's also new to Plex gets a boost.
  const recentlyAdded = filterDisliked(
    userKey,
    await plex.getTracks(section.key, "addedAt:desc", RECENT_ADDED),
  );
  const addedIds = new Set(recentlyAdded.map((t) => t.id));

  // Exclusions: tracks played very recently (the seeds/history we just pulled)
  // and tracks used by a recent run of this definition.
  const recentIds = new Set(recent.map((t) => t.id));
  const sinceMs = Date.now() - ap.intervalDays * HISTORY_CYCLES * DAY_MS;
  const usedRecently = getRecentHistoryIds(ap.id, sinceMs);
  // "New artists only": exclude anything by an artist you've recently played.
  const recentArtists = ap.newArtistsOnly
    ? new Set(recent.map((t) => normalize(t.artist)))
    : null;

  // Candidate consensus: how many seeds independently surfaced each neighbor.
  const score = new Map<string, { track: Track; hits: number }>();
  await Promise.all(
    seeds.map(async (seed) => {
      const neighbors = filterDisliked(userKey, await sonic.similar(seed.id, PER_SEED));
      for (const n of neighbors) {
        if (recentIds.has(n.id) || usedRecently.has(n.id)) continue;
        if (recentArtists?.has(normalize(n.artist))) continue;
        const cur = score.get(n.id);
        if (cur) cur.hits += 1;
        else score.set(n.id, { track: n, hits: 1 });
      }
    }),
  );

  // Taste bias from the feedback loop: float tracks near your likes (and by
  // liked artists) above equally-surfaced candidates.
  const likedNeighbors = await likedNeighborIds(userKey, sonic);
  const { likedArtists } = getFeedbackSets(userKey);
  const ranked = [...score.values()]
    .map(({ track, hits }) => {
      let weight = hits;
      if (addedIds.has(track.id)) weight += 2; // new-to-Plex bias
      if ((track.viewCount ?? 0) === 0) weight += 1; // haven't-played-it bias
      if (likedNeighbors.has(track.id)) weight += 2; // near something you liked
      if (likedArtists.has(normalize(track.artist))) weight += 1; // liked artist
      return { track, weight };
    })
    .sort((a, b) => b.weight - a.weight);

  const picks = ranked.slice(0, ap.size).map((r) => r.track);

  // Backfill from newly-added tracks if sonic consensus came up short.
  if (picks.length < ap.size) {
    const have = new Set(picks.map((t) => t.id));
    for (const t of recentlyAdded) {
      if (picks.length >= ap.size) break;
      if (have.has(t.id) || recentIds.has(t.id) || usedRecently.has(t.id)) continue;
      have.add(t.id);
      picks.push(t);
    }
  }

  return picks.map((t) => t.id);
}

/** Write the built track list to Plex per the definition's refresh mode. */
async function writePlaylist(
  plex: PlexClient,
  ap: AutoPlaylist,
  trackIds: string[],
): Promise<{ plexPlaylistId: string; status: string }> {
  const title = playlistTitle(ap.name);

  if (ap.mode === "replace") {
    // Fresh list each run: drop the old playlist, build a new one.
    if (ap.plexPlaylistId) {
      await plex.deletePlaylist(ap.plexPlaylistId).catch(() => {});
    }
    const created = await plex.createPlaylist(title, trackIds);
    return {
      plexPlaylistId: created.playlistId,
      status: `Rebuilt with ${trackIds.length} tracks`,
    };
  }

  // append: keep growing one playlist, adding only what isn't already in it.
  if (ap.plexPlaylistId) {
    let existing: Set<string> | null = null;
    try {
      existing = new Set((await plex.getPlaylistTracks(ap.plexPlaylistId)).map((t) => t.id));
    } catch {
      existing = null; // playlist was deleted in Plex — fall through to recreate
    }
    if (existing) {
      const fresh = trackIds.filter((id) => !existing.has(id));
      if (fresh.length > 0) await plex.addToPlaylist(ap.plexPlaylistId, fresh);
      return {
        plexPlaylistId: ap.plexPlaylistId,
        status: `Added ${fresh.length} new (${trackIds.length} candidates)`,
      };
    }
  }
  const created = await plex.createPlaylist(title, trackIds);
  return {
    plexPlaylistId: created.playlistId,
    status: `Created with ${trackIds.length} tracks`,
  };
}

/**
 * Run one auto-playlist definition now: build the tracks, write them to Plex,
 * record history, and schedule the next run. Never throws — failures are
 * recorded as the definition's last status and surfaced in the log.
 */
export async function runAutoPlaylist(id: string): Promise<AutoPlaylist> {
  const ap = getAutoPlaylist(id);
  if (!ap) throw new Error("Auto-playlist not found");
  if (!config.plex || !services.plex) throw new Error("Plex is not configured");

  // Build (and write the playlist) as the user who created it, so it lands on
  // THEIR Plex account and is seeded from THEIR listening — falling back to the
  // owner token for legacy rows with no stored per-user token.
  const owner = getAutoPlaylistOwner(id);
  const plex = owner?.ownerToken
    ? new PlexClient({ url: config.plex.url, token: owner.ownerToken })
    : services.plex;

  // Shape the build with the creator's feedback (their likes/dislikes).
  const userKey = await feedbackKeyForOwner(owner?.ownerId ?? null);

  const nextRunAt = Date.now() + ap.intervalDays * DAY_MS;
  try {
    const trackIds = await buildDiscoverWeekly(plex, ap, userKey);
    if (trackIds.length === 0) {
      throw new Error("No fresh tracks found for this run.");
    }
    const { plexPlaylistId, status } = await writePlaylist(plex, ap, trackIds);

    recordHistory(ap.id, trackIds);
    // Keep history a little longer than the exclusion window, then prune.
    pruneHistory(ap.id, Date.now() - ap.intervalDays * (HISTORY_CYCLES + 2) * DAY_MS);

    markRun(ap.id, { plexPlaylistId, lastStatus: status, nextRunAt });
    log.info("auto-playlist", `${ap.name}: ${status}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Advance the schedule anyway so a persistent failure doesn't hot-loop.
    markRun(ap.id, {
      plexPlaylistId: ap.plexPlaylistId,
      lastStatus: `Failed: ${msg}`,
      nextRunAt,
    });
    log.error("auto-playlist", `${ap.name} failed: ${msg}`);
  }
  return getAutoPlaylist(id)!;
}

// --- Scheduler ---------------------------------------------------------------

let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  if (!services.plex) return;
  const now = Date.now();
  const due = listAutoPlaylists().filter((a) => a.enabled && a.nextRunAt <= now);
  for (const a of due) {
    await runAutoPlaylist(a.id); // sequential; each is self-contained
  }
}

/** Start the in-process scheduler. Idempotent. */
export function startScheduler(): void {
  if (timer) return;
  if (!services.plex) {
    log.info("auto-playlist", "Scheduler idle — Plex not configured");
    return;
  }
  timer = setInterval(() => {
    void tick().catch((err) => {
      log.error(
        "auto-playlist",
        `Scheduler tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }, TICK_MS);
  // A catch-up run shortly after boot handles anything overdue while we were down.
  setTimeout(() => void tick(), BOOT_DELAY_MS);
  log.info("auto-playlist", "Scheduler started");
}
