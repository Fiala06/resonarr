import type { Track } from "@resonarr/shared";
import type { SpotifyTrackItem } from "./client.ts";
import { tracksMatch } from "../matching/match.ts";
import { services } from "../services.ts";
import { addManyToBasket } from "../basket/service.ts";
import { log } from "../log/service.ts";
import type { SpotifyMiss } from "@resonarr/shared";

export interface ImportResult {
  spotifyTotal: number;
  matched: Track[];
  misses: SpotifyMiss[];
  basketedArtists: string[];
}

const BATCH = 8; // concurrent Plex searches

async function findInPlex(item: SpotifyTrackItem): Promise<Track | null> {
  const plex = services.plex;
  if (!plex) return null;
  try {
    const query = `${item.artist} ${item.title}`.slice(0, 120);
    const candidates = await plex.searchTracks(query, 10);
    const suggestion = { artist: item.artist, title: item.title };
    return candidates.find((c) => tracksMatch(suggestion, c)) ?? null;
  } catch {
    return null;
  }
}

export async function runImport(
  tracks: SpotifyTrackItem[],
  playlistName: string,
): Promise<ImportResult> {
  if (!services.plex) throw new Error("Plex is not configured");

  const matched: Track[] = [];
  const misses: SpotifyMiss[] = [];
  const seenIds = new Set<string>();

  // Process in parallel batches to keep Plex request rate reasonable.
  for (let i = 0; i < tracks.length; i += BATCH) {
    const batch = tracks.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(findInPlex));

    for (let j = 0; j < batch.length; j++) {
      const found = results[j];
      if (found && !seenIds.has(found.id)) {
        seenIds.add(found.id);
        matched.push(found);
      } else if (!found) {
        misses.push({
          title: batch[j].title,
          artist: batch[j].artist,
          album: batch[j].album,
        });
      }
    }
  }

  // Add unmatched artists to the basket (one entry per unique artist, skipping
  // generic placeholders). The hallucination guard in addToBasket validates each
  // via Lidarr before persisting.
  const uniqueArtists = [
    ...new Set(
      misses
        .map((m) => m.artist)
        .filter(
          (a) =>
            a.trim() &&
            !["various artists", "various", "unknown artist"].includes(
              a.toLowerCase(),
            ),
        ),
    ),
  ];

  const { added, failed } = services.lidarr
    ? await addManyToBasket(
        uniqueArtists.map((artist) => ({ artist, source: "spotify-import" })),
      )
    : { added: [], failed: [] as { artist: string; error: string }[] };

  const basketedArtists = added.map((b) => b.artist);

  log.info(
    "spotify",
    `Import "${playlistName}": ${matched.length}/${tracks.length} matched, ` +
      `${misses.length} misses, ${basketedArtists.length} basketed` +
      (failed.length ? `, ${failed.length} basket errors` : ""),
  );

  return { spotifyTotal: tracks.length, matched, misses, basketedArtists };
}
