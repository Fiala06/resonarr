import type { Suggestion } from "@resonarr/shared";
import type { SuggestOptions, SuggestProvider } from "./types.ts";
import { SYSTEM_PROMPT, buildUserPrompt, parseSuggestions } from "./prompt.ts";

const TIMEOUT_MS = 60_000;

export class ClaudeAdapter implements SuggestProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async suggest(prompt: string, opts: SuggestOptions): Promise<Suggestion[]> {
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
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(prompt, opts) }],
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
    const text = (data.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    return parseSuggestions(text);
  }
}
