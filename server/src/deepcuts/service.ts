import type { DeepCutsMode, DeepCutsResponse, Track } from "@resonarr/shared";
import type { PlexClient } from "../plex/client.ts";
import { log } from "../log/service.ts";
import { filterDisliked } from "../feedback/service.ts";

// "Never played" is a random sample so each visit surfaces different buried
// treasure; we over-fetch then keep the unplayed ones.
const NEVER_OVERFETCH = 400;
// "Faded favorites" works off your most-played tracks, then keeps the ones you
// haven't returned to lately.
const FADED_OVERFETCH = 300;
const FADED_MIN_PLAYS = 2; // "a favorite" — played more than once
const FADED_STALE_DAYS = 60; // not heard in this long = drifted from
const DEFAULT_LIMIT = 40;
const PER_ARTIST_CAP = 2; // keep the list spread across your shelf

/**
 * Surface owned tracks you rarely or never play — the half of a big library
 * that discovery tools (Plexamp included) tend to ignore. Pure play-history:
 * Plex already exposes `viewCount` and `lastViewedAt`, so no extra analysis.
 */
export async function getDeepCuts(
  plex: PlexClient,
  userKey: string,
  mode: DeepCutsMode,
  limit = DEFAULT_LIMIT,
): Promise<DeepCutsResponse> {
  const section = await plex.getMusicSection();
  const cap = Math.max(1, Math.min(limit, 100));

  let picks: Track[];
  if (mode === "never") {
    const sample = await plex.getTracks(section.key, "random", NEVER_OVERFETCH);
    picks = capPerArtist(
      filterDisliked(userKey, sample.filter((t) => (t.viewCount ?? 0) === 0)),
      PER_ARTIST_CAP,
    ).slice(0, cap);
  } else {
    // Most-played first, then drop anything heard recently and order by how
    // long it's been — the longest-forgotten favorite floats to the top.
    const top = await plex.getTracks(
      section.key,
      "viewCount:desc",
      FADED_OVERFETCH,
    );
    const cutoff = nowSeconds() - FADED_STALE_DAYS * 86_400;
    picks = capPerArtist(
      filterDisliked(userKey, top)
        .filter(
          (t) =>
            (t.viewCount ?? 0) >= FADED_MIN_PLAYS &&
            (t.lastPlayedAt ?? 0) > 0 &&
            (t.lastPlayedAt ?? 0) < cutoff,
        )
        .sort((a, b) => (a.lastPlayedAt ?? 0) - (b.lastPlayedAt ?? 0)),
      PER_ARTIST_CAP,
    ).slice(0, cap);
  }

  log.info("deepcuts", `${mode}: ${picks.length} tracks surfaced`);
  return { mode, tracks: picks };
}

/** Keep at most `cap` tracks per artist, preserving order. */
function capPerArtist(tracks: Track[], cap: number): Track[] {
  const seen = new Map<string, number>();
  const out: Track[] = [];
  for (const t of tracks) {
    const key = t.artist.toLowerCase();
    const n = seen.get(key) ?? 0;
    if (n >= cap) continue;
    seen.set(key, n + 1);
    out.push(t);
  }
  return out;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
