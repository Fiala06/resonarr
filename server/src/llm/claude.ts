import type { Suggestion } from "@resonarr/shared";
import type { ArtistSuggestion, SuggestOptions, SuggestProvider } from "./types.ts";
import {
  ARTIST_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  buildArtistPrompt,
  buildUserPrompt,
  parseArtistSuggestions,
  parseSuggestions,
} from "./prompt.ts";

const TIMEOUT_MS = 60_000;

export class ClaudeAdapter implements SuggestProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async suggest(prompt: string, opts: SuggestOptions): Promise<Suggestion[]> {
    const text = await this.chat(SYSTEM_PROMPT, buildUserPrompt(prompt, opts));
    return parseSuggestions(text);
  }

  async suggestArtists(seeds: string[], count: number): Promise<ArtistSuggestion[]> {
    const text = await this.chat(ARTIST_SYSTEM_PROMPT, buildArtistPrompt(seeds, count));
    return parseArtistSuggestions(text);
  }

  async chat(system: string, user: string): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 3000,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Claude API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    return (data.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
  }
}
