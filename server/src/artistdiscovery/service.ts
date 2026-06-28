import type { ArtistCandidate, ArtistDiscoveryResponse } from "@resonarr/shared";
import type { PlexClient } from "../plex/client.ts";
import { services } from "../services.ts";
import { getProvider } from "../llm/index.ts";
import { log } from "../log/service.ts";
import { normalize } from "../matching/match.ts";
import { getFeedbackArtists } from "../feedback/service.ts";

const SEED_COUNT = 25; // most-played artists fed to the LLM
const DEFAULT_COUNT = 12; // candidates returned
const OVERSHOOT = 8; // ask for extra to survive owned/dedupe/lookup drops

/** De-dupe artist names case/space-insensitively, preserving first-seen order. */
function dedupeByNormalized(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const key = normalize(n);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

/** Run `fn`, retrying once on failure (transient network/5xx blips). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

/**
 * Artist-level discovery: "artists like the ones you love that you don't own
 * yet." Seeds from your most-played artists, expands via the LLM, drops anything
 * you already own, and validates every survivor against Lidarr — so the basket
 * fills with real, requestable artists. This is the one thing Plexamp can't do:
 * deliberately grow the collection.
 */
export async function discoverArtists(
  plex: PlexClient,
  userKey: string,
  count = DEFAULT_COUNT,
): Promise<ArtistDiscoveryResponse> {
  const lidarr = services.lidarr;
  if (!lidarr) throw new Error("Lidarr is not configured");
  const provider = getProvider(); // throws a clear error if no key/url

  const want = Math.max(1, Math.min(50, Math.round(count)));
  const section = await plex.getMusicSection();

  // Seed from the artists you explicitly liked first, then the ones you play
  // most; fall back to a library sample on a freshly-imported library.
  const { liked } = getFeedbackArtists(userKey);
  const played = await plex.getTopArtists(section.key, SEED_COUNT);
  let seeds = dedupeByNormalized([...liked, ...played]).slice(0, SEED_COUNT);
  if (seeds.length === 0) seeds = await plex.getArtistNames(section.key, SEED_COUNT);
  if (seeds.length === 0) {
    throw new Error("No artists in your library to learn from yet.");
  }

  // Everything owned is excluded from the candidates.
  const owned = new Set(
    (await plex.getArtistNames(section.key, 2000)).map(normalize),
  );

  log.info("artist-discovery", `Seeding from ${seeds.length} top artists`);

  // The LLM call is the most failure-prone outbound hop (transient network
  // "fetch failed", brief 5xx); retry once before giving up.
  let raw;
  try {
    raw = await withRetry(() => provider.suggestArtists(seeds, want + OVERSHOOT));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error("artist-discovery", `LLM suggestion failed: ${detail}`);
    throw new Error(`Couldn't get suggestions from the LLM: ${detail}`);
  }

  // Drop owned + duplicate suggestions before the (heavier) Lidarr lookups.
  const seen = new Set<string>();
  const fresh = raw.filter((s) => {
    const key = normalize(s.name);
    if (!key || owned.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Validate each candidate against Lidarr — only real MusicBrainz artists
  // survive (the hallucination guard). Lidarr's lookup proxies to MusicBrainz,
  // which is rate-limited to ~1 req/sec, so we go sequentially (a parallel burst
  // gets throttled and most lookups fail). Stop as soon as we have enough.
  const candidates: ArtistCandidate[] = [];
  const seenMbid = new Set<string>();
  let ownedResolved = 0;
  let noMatch = 0;
  let lookupFailed = 0;

  for (const s of fresh) {
    if (candidates.length >= want) break;
    let match;
    try {
      const hits = await lidarr.artistLookup(s.name);
      match = hits[0];
    } catch {
      lookupFailed += 1;
      continue;
    }
    if (!match) {
      noMatch += 1;
      continue;
    }
    // A different resolved name (or alias) might still be one we own.
    if (owned.has(normalize(match.artistName))) {
      ownedResolved += 1;
      continue;
    }
    if (seenMbid.has(match.foreignArtistId)) continue; // two suggestions, one artist
    seenMbid.add(match.foreignArtistId);
    candidates.push({
      artist: match.artistName,
      mbid: match.foreignArtistId,
      disambiguation:
        typeof match.disambiguation === "string" && match.disambiguation
          ? match.disambiguation
          : undefined,
      reason: s.reason,
    });
  }

  log.info(
    "artist-discovery",
    `${candidates.length} candidates from ${fresh.length} fresh / ${raw.length} suggested ` +
      `(owned-on-resolve ${ownedResolved}, no-match ${noMatch}, lookup-failed ${lookupFailed})`,
  );
  return { seeds, candidates };
}
