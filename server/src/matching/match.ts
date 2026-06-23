import type { Suggestion, Track } from "@resonarr/shared";

// Combining diacritical marks (after NFKD decomposition). Built from escapes to
// avoid embedding literal combining characters in source.
const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
const PARENS = /\([^)]*\)|\[[^\]]*\]/g;
const FEAT = /\b(feat|ft|featuring)\.?.*/g;
const NON_ALNUM = /[^a-z0-9]+/g;

/**
 * Normalize for fuzzy comparison: lowercase, strip accents, drop
 * parenthetical/bracketed bits (remasters, live, deluxe), drop "feat." tails,
 * and reduce to alphanumeric words.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(DIACRITICS, "")
    .replace(PARENS, " ")
    .replace(FEAT, " ")
    .replace(NON_ALNUM, " ")
    .trim();
}

/** Does a Plex candidate track satisfy an LLM suggestion? */
export function tracksMatch(suggestion: Suggestion, candidate: Track): boolean {
  const st = normalize(suggestion.title ?? "");
  if (!st) return false;
  const ct = normalize(candidate.title);
  const titleOk = ct === st || ct.includes(st) || st.includes(ct);
  if (!titleOk) return false;

  const sa = normalize(suggestion.artist);
  const ca = normalize(candidate.artist);
  return !sa || ca.includes(sa) || sa.includes(ca);
}
