import { config } from "../config/env.ts";
import { getSettings } from "../settings/service.ts";
import { ClaudeAdapter } from "./claude.ts";
import { OpenAIAdapter } from "./openai.ts";
import { OllamaAdapter } from "./ollama.ts";
import type { SuggestProvider } from "./types.ts";

const DEFAULT_MODEL = {
  claude: "claude-sonnet-4-6",
  openai: "gpt-4o-mini",
  ollama: "llama3.1",
} as const;

/**
 * Build the active LLM provider from settings + env keys. Throws a clear,
 * user-facing error when the selected provider isn't configured.
 */
export function getProvider(): SuggestProvider {
  const s = getSettings();
  const model = s.llmModel.trim();

  switch (s.llmProvider) {
    case "claude":
      if (!config.llm.anthropicApiKey) {
        throw new Error(
          "Claude is selected but ANTHROPIC_API_KEY is not set on the server.",
        );
      }
      return new ClaudeAdapter(
        config.llm.anthropicApiKey,
        model || DEFAULT_MODEL.claude,
      );

    case "openai":
      if (!config.llm.openaiApiKey) {
        throw new Error(
          "OpenAI is selected but OPENAI_API_KEY is not set on the server.",
        );
      }
      return new OpenAIAdapter(
        config.llm.openaiApiKey,
        model || DEFAULT_MODEL.openai,
      );

    case "ollama":
      if (!config.llm.ollamaUrl) {
        throw new Error(
          "Ollama is selected but OLLAMA_URL is not set on the server.",
        );
      }
      return new OllamaAdapter(config.llm.ollamaUrl, model || DEFAULT_MODEL.ollama);
  }
}
