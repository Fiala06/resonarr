import type { Suggestion } from "@resonarr/shared";

export interface SuggestOptions {
  /** How many track suggestions to ask for. */
  count: number;
  /** When set, the model is asked to favor these owned artists. */
  ownedArtists?: string[];
}

/** A single adjacent-artist suggestion (before Lidarr validation). */
export interface ArtistSuggestion {
  name: string;
  /** Short rationale tying it to the seed artists. */
  reason?: string;
}

/** A pluggable LLM provider that turns a prompt into music suggestions. */
export interface SuggestProvider {
  /** Track suggestions for a natural-language prompt (Sonic Sage). */
  suggest(prompt: string, opts: SuggestOptions): Promise<Suggestion[]>;
  /** Adjacent artists for a set of seed (loved) artists (Artist discovery). */
  suggestArtists(seeds: string[], count: number): Promise<ArtistSuggestion[]>;
}
