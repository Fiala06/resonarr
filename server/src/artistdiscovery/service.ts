import type { ArtistCandidate, ArtistDiscoveryResponse } from "@resonarr/shared";
import type { PlexClient } from "../plex/client.ts";
import { services } from "../services.ts";
import { getProvider } from "../llm/index.ts";
import { log } from "../log/service.ts";
import { normalize } from "../matching/match.ts";

const SEED_COUNT = 25; // most-played artists fed to the LLM
const DEFAULT_COUNT = 12; // candidates returned
const OVERSHOOT = 8; // ask for extra to survive owned/dedupe/lookup drops

/**
 * Artist-level discovery: "artists like the ones you love that you don't own
 * yet." Seeds from your most-played artists, expands via the LLM, drops anything
 * you already own, and validates every survivor against Lidarr — so the basket
 * fills with real, requestable artists. This is the one thing Plexamp can't do:
 * deliberately grow the collection.
 */
export async function discoverArtists(
  plex: PlexClient,
  count = DEFAULT_COUNT,
): Promise<ArtistDiscoveryResponse> {
  const lidarr = services.lidarr;
  if (!lidarr) throw new Error("Lidarr is not configured");
  const provider = getProvider(); // throws a clear error if no key/url

  const want = Math.max(1, Math.min(50, Math.round(count)));
  const section = await plex.getMusicSection();

  // Seed from artists you actually play; fall back to a library sample on a
  // freshly-imported (never-played) library.
  let seeds = await plex.getTopArtists(section.key, SEED_COUNT);
  if (seeds.length === 0) seeds = await plex.getArtistNames(section.key, SEED_COUNT);
  if (seeds.length === 0) {
    throw new Error("No artists in your library to learn from yet.");
  }

  // Everything owned is excluded from the candidates.
  const owned = new Set(
    (await plex.getArtistNames(section.key, 2000)).map(normalize),
  );

  log.info("artist-discovery", `Seeding from ${seeds.length} top artists`);
  const raw = await provider.suggestArtists(seeds, want + OVERSHOOT);

  // Drop owned + duplicate suggestions before the (heavier) Lidarr lookups.
  const seen = new Set<string>();
  const fresh = raw.filter((s) => {
    const key = normalize(s.name);
    if (!key || owned.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Validate each candidate against Lidarr in parallel — only real MusicBrainz
  // artists survive (the hallucination guard).
  const validated = await Promise.all(
    fresh.map(async (s): Promise<ArtistCandidate | null> => {
      try {
        const hits = await lidarr.artistLookup(s.name);
        const match = hits[0];
        if (!match) return null;
        // A different resolved name might still be one we own.
        if (owned.has(normalize(match.artistName))) return null;
        return {
          artist: match.artistName,
          mbid: match.foreignArtistId,
          disambiguation:
            typeof match.disambiguation === "string" && match.disambiguation
              ? match.disambiguation
              : undefined,
          reason: s.reason,
        };
      } catch {
        return null; // lookup hiccup — skip rather than fail the whole run
      }
    }),
  );

  // Dedupe on resolved mbid (two suggestions can resolve to one artist).
  const byMbid = new Map<string, ArtistCandidate>();
  for (const c of validated) {
    if (c && !byMbid.has(c.mbid)) byMbid.set(c.mbid, c);
  }
  const candidates = [...byMbid.values()].slice(0, want);

  log.info(
    "artist-discovery",
    `${candidates.length} validated candidates from ${raw.length} suggestions`,
  );
  return { seeds, candidates };
}
