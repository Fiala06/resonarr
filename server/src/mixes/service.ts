import type { MixCard, MixesResponse, Track } from "@resonarr/shared";
import { services } from "../services.ts";

const MIX_COUNT = 6; // how many mixes to generate
const PER_MIX = 30; // tracks per mix

/**
 * Mixes for You: several mixes, each seeded from a distinct recently-played
 * artist and expanded via sonic similarity. All tracks are owned.
 */
export async function runMixes(): Promise<MixesResponse> {
  const plex = services.plex;
  const sonic = services.sonic;
  if (!plex || !sonic) throw new Error("Plex is not configured");

  const section = await plex.getMusicSection();
  const recent = await plex.getRecentlyPlayed(section.key, 60);

  // One seed per distinct recent artist, up to MIX_COUNT.
  const seeds: Track[] = [];
  const seenArtists = new Set<string>();
  for (const t of recent) {
    const key = t.artist.toLowerCase();
    if (key && seenArtists.has(key)) continue;
    seenArtists.add(key);
    seeds.push(t);
    if (seeds.length >= MIX_COUNT) break;
  }
  if (seeds.length === 0) {
    throw new Error("No recent listening history found in Plex.");
  }

  const mixes: MixCard[] = await Promise.all(
    seeds.map(async (seed) => {
      const neighbors = await sonic.similar(seed.id, PER_MIX);
      // Play-history entries often omit art; backfill from full metadata so the
      // seed (first row / card cover) isn't a blank tile.
      const hydratedSeed = seed.thumb
        ? seed
        : await plex.getTrack(seed.id).catch(() => seed);
      const tracks = [hydratedSeed, ...neighbors.filter((t) => t.id !== seed.id)];
      return {
        id: hydratedSeed.id,
        title: `Like ${hydratedSeed.title}`,
        seed: hydratedSeed,
        tracks,
      };
    }),
  );

  return { mixes };
}
