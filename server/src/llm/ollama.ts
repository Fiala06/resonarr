import type { Suggestion } from "@resonarr/shared";
import type { SuggestOptions, SuggestProvider } from "./types.ts";
import { SYSTEM_PROMPT, buildUserPrompt, parseSuggestions } from "./prompt.ts";

// Local models can be slow; give them longer.
const TIMEOUT_MS = 120_000;

export class OllamaAdapter implements SuggestProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async suggest(prompt: string, opts: SuggestOptions): Promise<Suggestion[]> {
    const res = await fetch(new URL("/api/chat", this.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(prompt, opts) },
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
    return parseSuggestions(data.message?.content ?? "");
  }
}
