import type { DiscoveryResult, Suggestion, Track } from "@resonarr/shared";
import { services } from "../services.ts";
import { getProvider } from "../llm/index.ts";
import { tracksMatch } from "../matching/match.ts";
import type { PlexClient } from "../plex/client.ts";

const SUGGESTION_COUNT = 25;

/**
 * Sonic Sage: natural-language prompt -> LLM suggestions -> match against the
 * Plex library. Owned matches become a playlist; misses are returned for the
 * request basket. Nothing is silently dropped.
 */
export async function runSage(
  prompt: string,
  ownArtistBias: boolean,
): Promise<DiscoveryResult> {
  const plex = services.plex;
  if (!plex) throw new Error("Plex is not configured");

  const provider = getProvider(); // throws a clear error if no key/url

  let ownedArtists: string[] | undefined;
  const section = await plex.getMusicSection();
  if (ownArtistBias) {
    ownedArtists = await plex.getArtistNames(section.key, 200);
  }

  const suggestions = await provider.suggest(prompt, {
    count: SUGGESTION_COUNT,
    ownedArtists,
  });

  // Match each suggestion against Plex in parallel.
  const matched = await Promise.all(
    suggestions.map(async (s) => ({ s, track: await matchOne(plex, s) })),
  );

  const matches: Track[] = [];
  const misses: Suggestion[] = [];
  const seen = new Set<string>();

  for (const { s, track } of matched) {
    if (track) {
      if (!seen.has(track.id)) {
        seen.add(track.id);
        matches.push(track);
      }
    } else {
      misses.push(s);
    }
  }

  return { matches, misses };
}

async function matchOne(
  plex: PlexClient,
  suggestion: Suggestion,
): Promise<Track | null> {
  if (!suggestion.title) return null;
  const results = await plex.searchTracks(
    `${suggestion.artist} ${suggestion.title}`,
    10,
  );
  return results.find((r) => tracksMatch(suggestion, r)) ?? null;
}
