import type { DiscoverResponse, Track } from "@resonarr/shared";
import type { PlexClient } from "../plex/client.ts";
import { services } from "../services.ts";
import { log } from "../log/service.ts";
import { filterDisliked, getFeedbackSets } from "../feedback/service.ts";
import { likedNeighborIds } from "../feedback/boost.ts";
import { normalize } from "../matching/match.ts";

const MAX_SEEDS = 25; // seeds sampled from the source playlist
const PER_SEED = 15; // neighbors fetched per seed
const DEFAULT_LIMIT = 50; // fresh tracks returned

/**
 * "Fresh picks" from a playlist: sample tracks across the source list, expand
 * each via Plex sonic similarity, drop anything already in the source, and rank
 * the remainder by how many seeds independently surfaced it (a stronger sonic
 * consensus floats to the top). Every result is owned and new to that playlist.
 */
export async function discoverFromPlaylist(
  plex: PlexClient,
  playlistId: string,
  limit = DEFAULT_LIMIT,
  newArtistsOnly = false,
): Promise<DiscoverResponse> {
  const sonic = services.sonic;
  if (!sonic) throw new Error("Plex is not configured");
  // Read the seed playlist from the signed-in user's account; expand over the
  // shared library via the owner client.
  const source = (await plex.getPlaylists()).find((p) => p.id === playlistId);
  if (!source) throw new Error("Playlist not found");

  const sourceTracks = await plex.getPlaylistTracks(playlistId);
  if (sourceTracks.length === 0) {
    throw new Error("That playlist has no tracks to learn from.");
  }

  // Everything already in the playlist is excluded from the picks.
  const ownedIds = new Set(sourceTracks.map((t) => t.id));
  // For "new artists only", also exclude any artist already in the source.
  const sourceArtists = newArtistsOnly
    ? new Set(sourceTracks.map((t) => normalize(t.artist)))
    : null;
  const seeds = sampleEvenly(sourceTracks, MAX_SEEDS);

  // Candidate -> how many distinct seeds pointed at it.
  const score = new Map<string, { track: Track; hits: number }>();
  await Promise.all(
    seeds.map(async (seed) => {
      const neighbors = await sonic.similar(seed.id, PER_SEED);
      for (const n of neighbors) {
        if (ownedIds.has(n.id)) continue;
        if (sourceArtists?.has(normalize(n.artist))) continue;
        const cur = score.get(n.id);
        if (cur) cur.hits += 1;
        else score.set(n.id, { track: n, hits: 1 });
      }
    }),
  );

  // Bias toward your taste: a candidate that's a sonic neighbor of something
  // you liked (or by a liked artist) ranks above one with equal seed consensus.
  const likedNeighbors = await likedNeighborIds(sonic);
  const { likedArtists } = getFeedbackSets();
  const tracks = filterDisliked(
    [...score.values()]
      .map(({ track, hits }) => {
        let weight = hits;
        if (likedNeighbors.has(track.id)) weight += 2;
        if (likedArtists.has(normalize(track.artist))) weight += 1;
        return { track, weight };
      })
      .sort((a, b) => b.weight - a.weight)
      .map((s) => s.track),
  ).slice(0, Math.max(1, Math.min(limit, 100)));

  log.info(
    "discover",
    `"${source.title}": ${tracks.length} fresh picks from ${seeds.length} seeds (${sourceTracks.length} in playlist)`,
  );
  return { source, tracks };
}

/** Pick up to `n` items spread evenly across the array (not just the head). */
function sampleEvenly<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    const item = arr[Math.floor(i * step)];
    if (item !== undefined) out.push(item);
  }
  return out;
}
