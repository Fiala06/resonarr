import type { MixResponse, Track } from "@resonarr/shared";
import { services } from "../services.ts";

const SEED_COUNT = 6; // recent tracks used as seeds
const PER_SEED = 15; // sonic neighbors per seed
const MAX_TRACKS = 40; // final mix length

/**
 * Mixes for You: seed from recent listening, expand each seed via sonic
 * similarity, dedupe + shuffle into a single mix.
 */
export async function runMixes(): Promise<MixResponse> {
  const plex = services.plex;
  const sonic = services.sonic;
  if (!plex || !sonic) throw new Error("Plex is not configured");

  const section = await plex.getMusicSection();
  const recent = await plex.getRecentlyPlayed(section.key, 40);
  const seeds = recent.slice(0, SEED_COUNT);
  if (seeds.length === 0) {
    throw new Error("No recent listening history found in Plex.");
  }

  const seedIds = new Set(seeds.map((s) => s.id));
  const pools = await Promise.all(
    seeds.map((s) => sonic.similar(s.id, PER_SEED)),
  );

  const seen = new Set<string>();
  const collected: Track[] = [];
  for (const pool of pools) {
    for (const t of pool) {
      if (seedIds.has(t.id) || seen.has(t.id)) continue;
      seen.add(t.id);
      collected.push(t);
    }
  }

  shuffle(collected);
  return { seeds, tracks: collected.slice(0, MAX_TRACKS) };
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}
