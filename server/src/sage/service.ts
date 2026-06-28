import type { DiscoveryResult, Suggestion, Track } from "@resonarr/shared";
import { services } from "../services.ts";
import { getProvider } from "../llm/index.ts";
import { log } from "../log/service.ts";
import { tracksMatch } from "../matching/match.ts";
import { filterDisliked, getFeedbackArtists } from "../feedback/service.ts";
import type { PlexClient } from "../plex/client.ts";

/**
 * Sonic Sage: natural-language prompt -> LLM suggestions -> match against the
 * Plex library. Owned matches become a playlist; misses are returned for the
 * request basket. Nothing is silently dropped.
 */
export async function runSage(
  prompt: string,
  ownArtistBias: boolean,
  userKey: string,
  count = 25,
): Promise<DiscoveryResult> {
  const suggestionCount = Math.max(5, Math.min(100, Math.round(count)));
  const plex = services.plex;
  if (!plex) throw new Error("Plex is not configured");

  const provider = getProvider(); // throws a clear error if no key/url
  log.info("sage", `Prompt: "${truncate(prompt, 80)}"`, {
    count: suggestionCount,
    ownArtistBias,
  });

  let ownedArtists: string[] | undefined;
  const section = await plex.getMusicSection();
  if (ownArtistBias) {
    ownedArtists = await plex.getArtistNames(section.key, 200);
  }

  const { liked, disliked } = getFeedbackArtists(userKey);

  let suggestions: Suggestion[];
  try {
    suggestions = await provider.suggest(prompt, {
      count: suggestionCount,
      ownedArtists,
      likedArtists: liked,
      dislikedArtists: disliked,
    });
  } catch (err) {
    log.error("sage", "LLM suggestion failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

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

  const keptMatches = filterDisliked(userKey, matches);
  log.info(
    "sage",
    `${keptMatches.length} owned matches, ${misses.length} misses from ${suggestions.length} suggestions`,
  );
  return { matches: keptMatches, misses };
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
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
