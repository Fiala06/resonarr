import type { TasteProfile, TopArtistPlays } from "@resonarr/shared";
import type { PlexClient } from "../plex/client.ts";
import { getProvider } from "../llm/index.ts";
import { extractJsonObject } from "../llm/prompt.ts";
import { cached } from "../cache/store.ts";
import { log } from "../log/service.ts";

const TOP_ARTISTS = 30;

/** A profile is a snapshot of slow-moving listening; cache it for a day. */
const TASTE_TTL_MS = 1000 * 60 * 60 * 24;

const SYSTEM_PROMPT = `You are a sharp, warm music critic writing a personal listening profile.
You are given someone's most-played artists (with play counts) and their library size.
Infer their taste and respond with ONLY a JSON object of exactly this shape, nothing else:
{"soundline":"one vivid sentence capturing their sound","summary":"2-3 sentence plain-language paragraph","genres":["genre",...],"eras":["1990s",...],"vibes":["mood word",...]}
No prose, no markdown, no code fences. 3-6 genres, 1-4 eras, 3-6 vibes. Be specific and human, not generic.`;

/**
 * Build (or return a cached) taste profile for a user. The LLM call makes this
 * the slowest discovery endpoint, so we cache per user for a day; the
 * "Regenerate" button passes `force` to bypass the cache.
 */
export async function buildTasteProfile(
  plex: PlexClient,
  userKey: string,
  force = false,
): Promise<TasteProfile> {
  return cached(
    `taste-profile:${userKey}`,
    TASTE_TTL_MS,
    () => computeTasteProfile(plex),
    force,
  );
}

/**
 * Build a "Resonarr Wrapped" taste profile: pull the user's most-played artists
 * from Plex and have the LLM turn them into a plain-language portrait. The model
 * infers genres/eras/vibes from the artist names (it knows them), so we don't
 * need Plex's genre tags.
 */
async function computeTasteProfile(plex: PlexClient): Promise<TasteProfile> {
  const provider = getProvider(); // throws a clear error if no key/url
  const section = await plex.getMusicSection();

  const [topArtists, stats] = await Promise.all([
    plex.getTopArtistsWithPlays(section.key, TOP_ARTISTS),
    plex.getLibraryStats(section.key),
  ]);
  if (topArtists.length === 0) {
    throw new Error("No play history yet — listen to some music in Plex first.");
  }

  const text = await provider.chat(SYSTEM_PROMPT, buildPrompt(topArtists, stats.tracks));
  const obj = extractJsonObject(text) ?? {};

  const profile: TasteProfile = {
    soundline: str(obj.soundline) || "A taste all your own.",
    summary: str(obj.summary),
    genres: strArray(obj.genres),
    eras: strArray(obj.eras),
    vibes: strArray(obj.vibes),
    topArtists,
    stats,
  };

  log.info(
    "taste",
    `Profile built from ${topArtists.length} top artists: "${profile.soundline}"`,
  );
  return profile;
}

function buildPrompt(top: TopArtistPlays[], trackCount: number): string {
  const list = top.map((a) => `${a.artist} (${a.plays})`).join(", ");
  return (
    `My library has ${trackCount.toLocaleString()} tracks. ` +
    `My most-played artists, with play counts, are: ${list}.\n\n` +
    `Write my listening profile.`
  );
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((s) => s.length > 0)
    .slice(0, 8);
}
