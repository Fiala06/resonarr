import type { Track } from "@resonarr/shared";
import type { SonicService } from "../sonic/cache.ts";
import { getDb } from "../db/database.ts";

/** Default spread of liked tracks to sample; callers can ask for more. */
const DEFAULT_MAX_SEEDS = 20;
const NEIGHBORS_PER_SEED = 25;

export interface LikedNeighbor {
  track: Track;
  /** How many sampled liked seeds surfaced this track (taste-consensus). */
  hits: number;
}

/** A random spread of the user's liked track ids (variety across the corpus). */
function sampledLikedTrackIds(userKey: string, limit: number): string[] {
  const rows = getDb()
    .prepare(
      "SELECT track_id FROM feedback WHERE user_id = ? AND rating = 'up' ORDER BY RANDOM() LIMIT ?",
    )
    .all(userKey, limit) as { track_id: string }[];
  return rows.map((r) => r.track_id);
}

/**
 * The "liked neighborhood" with consensus: for a wide sample of the user's
 * liked tracks, the sonic neighbors keyed by how many liked seeds surfaced each
 * (`hits`). A higher hit count means a track sits closer to the *center* of the
 * user's taste. Used to bias ranking (Discover, Discover Weekly) and to power
 * the Loved surface. Bounded sample; sonic lookups are cached; a failed lookup
 * is skipped rather than fatal.
 */
export async function likedNeighborScores(
  userKey: string,
  sonic: SonicService,
  maxSeeds = DEFAULT_MAX_SEEDS,
): Promise<Map<string, LikedNeighbor>> {
  const seeds = sampledLikedTrackIds(userKey, maxSeeds);
  const out = new Map<string, LikedNeighbor>();
  if (seeds.length === 0) return out;
  const lists = await Promise.all(
    seeds.map((id) => sonic.similar(id, NEIGHBORS_PER_SEED).catch(() => [])),
  );
  for (const list of lists) {
    for (const t of list) {
      const cur = out.get(t.id);
      if (cur) cur.hits += 1;
      else out.set(t.id, { track: t, hits: 1 });
    }
  }
  return out;
}
