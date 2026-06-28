import type { LovedResponse } from "@resonarr/shared";
import { services } from "../services.ts";
import { getDb } from "../db/database.ts";
import { log } from "../log/service.ts";
import { filterDisliked } from "../feedback/service.ts";
import { likedNeighborScores } from "../feedback/boost.ts";

const DEFAULT_LIMIT = 50;
const SEEDS = 40; // sample more of the corpus for a stronger consensus

/**
 * "Loved": recommendations from the centre of your taste. Sample across your
 * liked tracks, expand each via sonic similarity, and rank by how many of your
 * likes point at each candidate (consensus). Excludes tracks you've already
 * liked and anything thumbed down. Owned tracks only (Plex `nearest` stays in
 * the library), so the result is saveable as a playlist.
 */
export async function discoverFromLikes(
  userKey: string,
  limit = DEFAULT_LIMIT,
): Promise<LovedResponse> {
  const sonic = services.sonic;
  if (!sonic) throw new Error("Plex is not configured");

  const likedIds = new Set(
    (
      getDb()
        .prepare(
          "SELECT track_id FROM feedback WHERE user_id = ? AND rating = 'up'",
        )
        .all(userKey) as { track_id: string }[]
    ).map((r) => r.track_id),
  );
  if (likedIds.size === 0) return { tracks: [] };

  const scored = await likedNeighborScores(userKey, sonic, SEEDS);
  const tracks = filterDisliked(
    userKey,
    [...scored.values()]
      .filter(({ track }) => !likedIds.has(track.id)) // surface NEW tracks
      .sort((a, b) => b.hits - a.hits)
      .map((s) => s.track),
  ).slice(0, Math.max(1, Math.min(limit, 100)));

  log.info("loved", `${tracks.length} tracks from the centre of your taste`);
  return { tracks };
}
