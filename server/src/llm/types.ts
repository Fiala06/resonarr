import type { Suggestion } from "@resonarr/shared";

export interface SuggestOptions {
  /** How many track suggestions to ask for. */
  count: number;
  /** When set, the model is asked to favor these owned artists. */
  ownedArtists?: string[];
}

/** A pluggable LLM provider that turns a prompt into track suggestions. */
export interface SuggestProvider {
  suggest(prompt: string, opts: SuggestOptions): Promise<Suggestion[]>;
}
