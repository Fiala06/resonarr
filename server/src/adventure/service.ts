import type { AdventureResponse, Track } from "@resonarr/shared";
import { services } from "../services.ts";
import type { SonicService } from "../sonic/cache.ts";

/**
 * Sonic Adventure: a path from a start track to a destination track.
 *
 * Plex exposes no path endpoint and no raw sonic vectors over the API, so we
 * walk the sonic-neighbor graph from BOTH ends and meet in the middle:
 *  - forward from `start`, stepping toward the destination's neighborhood;
 *  - backward from `end`, stepping toward the start's neighborhood, then reversed.
 *
 * This makes both endpoints ease in/out smoothly (the destination is reached via
 * its own neighbors, not a hard jump). Any residual discontinuity lands in the
 * middle, where it's far less jarring. Heuristic, not an optimal geodesic.
 */
const NEIGHBORHOOD = 60;
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

  // Neighborhoods (ranked by closeness) for each endpoint.
  const [endNeighbors, startNeighbors] = await Promise.all([
    sonic.similar(endId, NEIGHBORHOOD),
    sonic.similar(startId, NEIGHBORHOOD),
  ]);
  const endRank = new Map(endNeighbors.map((t, i) => [t.id, i]));
  const startRank = new Map(startNeighbors.map((t, i) => [t.id, i]));

  const interior = steps - 2;
  const fwdSteps = Math.ceil(interior / 2);
  const bwdSteps = Math.floor(interior / 2);

  const visited = new Set<string>([startId, endId]);
  // Forward half walks from start toward the destination's neighborhood.
  const forward = await walk(sonic, start, endRank, fwdSteps, visited);
  // Backward half walks from end toward the start's neighborhood, then reverses.
  const backward = await walk(sonic, end, startRank, bwdSteps, visited);
  backward.reverse();

  return { path: [start, ...forward, ...backward, end] };
}

/** Greedily step `steps` times from `from`, preferring the target neighborhood. */
async function walk(
  sonic: SonicService,
  from: Track,
  targetRank: Map<string, number>,
  steps: number,
  visited: Set<string>,
): Promise<Track[]> {
  const chain: Track[] = [];
  let current = from;

  for (let i = 0; i < steps; i++) {
    const neighbors = (await sonic.similar(current.id, STEP_FANOUT)).filter(
      (t) => !visited.has(t.id),
    );
    if (neighbors.length === 0) break;

    const toward = neighbors
      .filter((t) => targetRank.has(t.id))
      .sort((a, b) => targetRank.get(a.id)! - targetRank.get(b.id)!);

    const next = toward[0] ?? neighbors[0]!;
    chain.push(next);
    visited.add(next.id);
    current = next;

    const rank = targetRank.get(next.id);
    if (rank !== undefined && rank < CLOSE_ENOUGH_RANK) break;
  }

  return chain;
}
