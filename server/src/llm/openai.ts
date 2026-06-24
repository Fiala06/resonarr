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

export class OpenAIAdapter implements SuggestProvider {
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

  private async chat(system: string, user: string): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? "";
  }
}
