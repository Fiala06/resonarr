import type { SpotifySync, Track } from "@resonarr/shared";
import { PlexClient } from "../plex/client.ts";
import { config } from "../config/env.ts";
import { services } from "../services.ts";
import { log } from "../log/service.ts";
import { findInPlex, spotifyPlaylistTitle } from "./import.ts";
import {
  DAY_MS,
  getSync,
  getSyncOwner,
  listPending,
  listSyncs,
  markSyncRun,
  removePending,
} from "./sync-store.ts";

const BATCH = 8; // concurrent Plex searches, matching the import path
const TICK_MS = 5 * 60 * 1000; // scheduler poll interval
const BOOT_DELAY_MS = 20_000; // first catch-up tick after startup

/** Syncs with a backfill in flight, so manual runs don't pile up or double-add. */
const running = new Set<string>();

/** Whether a backfill for this sync is currently in progress. */
export function isSyncRunning(id: string): boolean {
  return running.has(id);
}

/**
 * Re-check a sync's still-unmatched tracks against the Plex library and add any
 * that have since arrived to its playlist. Never throws — failures are recorded
 * as the sync's last status and surfaced in the log. Re-checking a large pending
 * list hits Plex once per track, so this can take a while; callers that don't
 * need the result should fire it detached.
 */
export async function runSpotifySync(id: string): Promise<SpotifySync> {
  const sync = getSync(id);
  if (!sync) throw new Error("Sync not found");
  if (!config.plex || !services.plex) throw new Error("Plex is not configured");

  // Already running (scheduler + a manual click, or a double-click) — don't
  // scan twice; return the current state.
  if (running.has(id)) return sync;
  running.add(id);

  // Write the playlist as the user who created the sync, so it lands on THEIR
  // Plex account — falling back to the owner token for legacy/single-user rows.
  const owner = getSyncOwner(id);
  const plex = owner?.ownerToken
    ? new PlexClient({ url: config.plex.url, token: owner.ownerToken })
    : services.plex;

  const nextRunAt = Date.now() + sync.intervalDays * DAY_MS;
  try {
    const pending = listPending(id);
    if (pending.length === 0) {
      markSyncRun(id, { lastStatus: "Up to date — all tracks in library", nextRunAt });
      return getSync(id)!;
    }

    // Re-match pending tracks in parallel batches.
    const found: { key: string; track: Track }[] = [];
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      const results = await Promise.all(batch.map((p) => findInPlex(plex, p)));
      for (let j = 0; j < batch.length; j++) {
        const t = results[j];
        if (t) found.push({ key: batch[j]!.trackKey, track: t });
      }
    }

    if (found.length === 0) {
      markSyncRun(id, {
        lastStatus: `No new matches (${pending.length} still pending)`,
        nextRunAt,
      });
      return getSync(id)!;
    }

    // Distinct Plex tracks that are new to the playlist.
    const foundKeys = found.map((f) => f.key);
    let playlistId = sync.plexPlaylistId ?? null;
    let newIds = [...new Set(found.map((f) => f.track.id))];

    if (playlistId) {
      // Drop anything already in the playlist (e.g. two pending tracks resolving
      // to the same Plex item, or a manual re-run).
      let existing: Set<string>;
      try {
        existing = new Set((await plex.getPlaylistTracks(playlistId)).map((t) => t.id));
      } catch {
        playlistId = null; // playlist was deleted in Plex — recreate below
        existing = new Set();
      }
      newIds = newIds.filter((tid) => !existing.has(tid));
      if (playlistId && newIds.length > 0) {
        await plex.addToPlaylist(playlistId, newIds);
      }
    }
    if (!playlistId) {
      // No playlist yet (zero matches at import time) — create it now.
      const created = await plex.createPlaylist(spotifyPlaylistTitle(sync.name), newIds);
      playlistId = created.playlistId;
    }

    removePending(id, foundKeys);
    const remaining = pending.length - foundKeys.length;
    const status =
      `Added ${newIds.length} newly available` +
      (remaining > 0 ? `, ${remaining} still pending` : " — migration complete");
    markSyncRun(id, {
      plexPlaylistId: playlistId,
      lastStatus: status,
      nextRunAt,
      addedMatches: newIds.length,
    });
    log.info("spotify-sync", `${sync.name}: ${status}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Advance the schedule anyway so a persistent failure doesn't hot-loop.
    markSyncRun(id, { lastStatus: `Failed: ${msg}`, nextRunAt });
    log.error("spotify-sync", `${sync.name} failed: ${msg}`);
  } finally {
    running.delete(id);
  }
  return getSync(id)!;
}

// --- Scheduler ---------------------------------------------------------------

let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  if (!services.plex) return;
  const now = Date.now();
  const due = listSyncs().filter((s) => s.enabled && s.nextRunAt <= now);
  for (const s of due) {
    await runSpotifySync(s.id); // sequential; each is self-contained
  }
}

/** Start the in-process Spotify backfill scheduler. Idempotent. */
export function startSpotifySyncScheduler(): void {
  if (timer) return;
  if (!services.plex) {
    log.info("spotify-sync", "Scheduler idle — Plex not configured");
    return;
  }
  timer = setInterval(() => {
    void tick().catch((err) => {
      log.error(
        "spotify-sync",
        `Scheduler tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }, TICK_MS);
  setTimeout(() => void tick(), BOOT_DELAY_MS);
  log.info("spotify-sync", "Scheduler started");
}
