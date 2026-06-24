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

// Local models can be slow; give them longer.
const TIMEOUT_MS = 120_000;

export class OllamaAdapter implements SuggestProvider {
  constructor(
    private readonly baseUrl: string,
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

  private async chat(system: string, user: string): Promise<string> {
    const res = await fetch(new URL("/api/chat", this.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        stream: false,
        format: "json",
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ollama ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? "";
  }
}
