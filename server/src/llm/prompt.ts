import type { Suggestion } from "@resonarr/shared";
import type { ArtistSuggestion, SuggestOptions } from "./types.ts";

/** Shared across all providers so suggestions are uniform + parseable. */
export const SYSTEM_PROMPT = `You are a music recommendation engine for a personal music library.
Given a request, suggest real, specific, existing songs (never invented).
Respond with ONLY a JSON object of exactly this shape and nothing else:
{"suggestions":[{"artist":"Artist Name","title":"Track Title","album":"Album Name"}]}
No prose, no markdown, no code fences. "album" may be omitted if unknown.`;

export function buildUserPrompt(prompt: string, opts: SuggestOptions): string {
  let p = `Suggest ${opts.count} songs for this request:\n"${prompt}"`;
  if (opts.ownedArtists && opts.ownedArtists.length > 0) {
    const sample = opts.ownedArtists.slice(0, 200).join(", ");
    p += `\n\nWhen they genuinely fit the request, prefer songs by artists I already own: ${sample}.`;
  }
  p += `\n\nReturn specific tracks: exact artist and title, plus album when known.`;
  return p;
}

export function parseSuggestions(text: string): Suggestion[] {
  const obj = extractJsonObject(text);
  const arr = obj && Array.isArray(obj.suggestions) ? obj.suggestions : [];
  const out: Suggestion[] = [];
  for (const x of arr) {
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (typeof o.artist === "string" && o.artist.trim()) {
        out.push({
          artist: o.artist.trim(),
          title: typeof o.title === "string" ? o.title.trim() : undefined,
          album: typeof o.album === "string" ? o.album.trim() : undefined,
        });
      }
    }
  }
  return out;
}

// --- Artist-level discovery --------------------------------------------------

export const ARTIST_SYSTEM_PROMPT = `You are a music discovery engine for a collector growing their library.
Given artists someone already loves, suggest other real, existing artists or bands they'd likely enjoy but probably don't own yet.
Respond with ONLY a JSON object of exactly this shape and nothing else:
{"artists":[{"name":"Artist Name","reason":"one short sentence"}]}
No prose, no markdown, no code fences. Never invent artists that don't exist.`;

export function buildArtistPrompt(seeds: string[], count: number): string {
  const list = seeds.slice(0, 30).join(", ");
  return (
    `I love these artists: ${list}.\n\n` +
    `Suggest ${count} other real, existing artists or bands I would likely enjoy ` +
    `but that are NOT in that list — adjacent in sound, scene, or era.\n\n` +
    `I already own a very large, mainstream collection, so skip the most obvious ` +
    `household-name neighbors I almost certainly already have. Lean toward deeper ` +
    `cuts: lesser-known, underrated, cult-favorite, or influential-but-overlooked ` +
    `artists a devoted fan would discover next. For each, give a one-sentence ` +
    `reason tied to which of my artists it resembles. Do not repeat any artist I listed.`
  );
}

export function parseArtistSuggestions(text: string): ArtistSuggestion[] {
  const obj = extractJsonObject(text);
  const arr = obj && Array.isArray(obj.artists) ? obj.artists : [];
  const out: ArtistSuggestion[] = [];
  for (const x of arr) {
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name.trim() : "";
      if (name) {
        out.push({
          name,
          reason: typeof o.reason === "string" ? o.reason.trim() : undefined,
        });
      }
    }
  }
  return out;
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v: unknown = JSON.parse(s);
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(text);
  if (direct) return direct;

  // Models sometimes wrap JSON in prose/fences — grab the outermost braces.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return tryParse(text.slice(start, end + 1));
  return null;
}
