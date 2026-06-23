import type { Suggestion } from "@resonarr/shared";
import type { SuggestOptions, SuggestProvider } from "./types.ts";
import { SYSTEM_PROMPT, buildUserPrompt, parseSuggestions } from "./prompt.ts";

const TIMEOUT_MS = 60_000;

export class OpenAIAdapter implements SuggestProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async suggest(prompt: string, opts: SuggestOptions): Promise<Suggestion[]> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(prompt, opts) },
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
    return parseSuggestions(data.choices?.[0]?.message?.content ?? "");
  }
}
