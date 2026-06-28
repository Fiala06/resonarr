import type { SonicService } from "../sonic/cache.ts";
import { getDb } from "../db/database.ts";

/** A few recent likes is enough to bias ranking without flooding sonic queries. */
const MAX_LIKED_SEEDS = 6;
const NEIGHBORS_PER_SEED = 25;

/** Track ids this user most recently thumbed up. */
function recentLikedTrackIds(userKey: string, limit: number): string[] {
  const rows = getDb()
    .prepare(
      "SELECT track_id FROM feedback WHERE user_id = ? AND rating = 'up' ORDER BY created_at DESC LIMIT ?",
    )
    .all(userKey, limit) as { track_id: string }[];
  return rows.map((r) => r.track_id);
}

/**
 * The "liked neighborhood": ids of tracks that sit sonically close to the
 * user's recently liked tracks. Discovery ranking gives candidates in this set
 * a boost, so a thumbs-up actively pulls in *more of what you love* — not just
 * filtering out dislikes. Bounded to a few seeds; sonic lookups are cached, and
 * a failed lookup is skipped rather than fatal.
 */
export async function likedNeighborIds(
  userKey: string,
  sonic: SonicService,
): Promise<Set<string>> {
  const seeds = recentLikedTrackIds(userKey, MAX_LIKED_SEEDS);
  if (seeds.length === 0) return new Set();
  const lists = await Promise.all(
    seeds.map((id) => sonic.similar(id, NEIGHBORS_PER_SEED).catch(() => [])),
  );
  const ids = new Set<string>();
  for (const list of lists) for (const t of list) ids.add(t.id);
  return ids;
}
