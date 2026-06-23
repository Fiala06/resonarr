import type { AdventureResponse, Track } from "@resonarr/shared";
import { services } from "../services.ts";

/**
 * Sonic Adventure: a path from a start track to a destination track.
 *
 * Plex exposes no path endpoint, so we walk the sonic-neighbor graph greedily:
 * precompute the destination's neighborhood, then at each step step toward any
 * neighbor that lands in that neighborhood (closest-to-end first), otherwise
 * follow the most-similar neighbor. The destination is always the final track.
 *
 * Without raw sonic vectors this is a heuristic, not an optimal geodesic — good
 * enough for a pleasant gradient; tunable later.
 */
const END_NEIGHBORHOOD = 60;
const STEP_FANOUT = 25;
const CLOSE_ENOUGH_RANK = 5;

export async function runAdventure(
  startId: string,
  endId: string,
  length = 10,
): Promise<AdventureResponse> {
  const plex = services.plex;
  const sonic = services.sonic;
  if (!plex || !sonic) throw new Error("Plex is not configured");
  if (startId === endId) throw new Error("Pick two different tracks");

  const steps = Math.max(4, Math.min(length, 20));
  const [start, end] = await Promise.all([
    plex.getTrack(startId),
    plex.getTrack(endId),
  ]);

  // Ordered by closeness to the destination.
  const endNeighbors = await sonic.similar(endId, END_NEIGHBORHOOD);
  const endRank = new Map(endNeighbors.map((t, i) => [t.id, i]));

  const path: Track[] = [start];
  const visited = new Set<string>([startId, endId]);
  let current = start;

  for (let i = 1; i < steps - 1; i++) {
    const neighbors = (await sonic.similar(current.id, STEP_FANOUT)).filter(
      (t) => !visited.has(t.id),
    );
    if (neighbors.length === 0) break;

    // Prefer neighbors that sit in the destination's neighborhood.
    const towardEnd = neighbors
      .filter((t) => endRank.has(t.id))
      .sort((a, b) => endRank.get(a.id)! - endRank.get(b.id)!);

    const next = towardEnd[0] ?? neighbors[0]!;
    path.push(next);
    visited.add(next.id);
    current = next;

    const rank = endRank.get(next.id);
    if (rank !== undefined && rank < CLOSE_ENOUGH_RANK) break;
  }

  path.push(end);
  return { path };
}
