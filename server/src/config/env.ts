import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load the repo-root .env regardless of the cwd the script was launched from
// (npm runs workspace scripts with cwd = the workspace dir).
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../");
loadEnv({ path: resolve(repoRoot, ".env") });

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export interface PlexConfig {
  url: string;
  token: string;
}

export interface LidarrConfig {
  url: string;
  apiKey: string;
}

export const config = {
  port: Number(optional("PORT") ?? "8080"),

  /** Present only when both URL and token are configured. */
  plex: ((): PlexConfig | undefined => {
    const url = optional("PLEX_URL");
    const token = optional("PLEX_TOKEN");
    return url && token ? { url, token } : undefined;
  })(),

  /** Present only when both URL and API key are configured. */
  lidarr: ((): LidarrConfig | undefined => {
    const url = optional("LIDARR_URL");
    const apiKey = optional("LIDARR_API_KEY");
    return url && apiKey ? { url, apiKey } : undefined;
  })(),

  llm: {
    provider: (optional("LLM_PROVIDER") ?? "claude") as
      | "claude"
      | "openai"
      | "ollama",
    anthropicApiKey: optional("ANTHROPIC_API_KEY"),
    openaiApiKey: optional("OPENAI_API_KEY"),
    ollamaUrl: optional("OLLAMA_URL"),
  },
} as const;

/** Throw a clear error if a required service is not configured. */
export function requirePlex(): PlexConfig {
  if (!config.plex) {
    throw new Error(
      "Plex is not configured. Set PLEX_URL and PLEX_TOKEN in .env",
    );
  }
  return config.plex;
}

export function requireLidarr(): LidarrConfig {
  if (!config.lidarr) {
    throw new Error(
      "Lidarr is not configured. Set LIDARR_URL and LIDARR_API_KEY in .env",
    );
  }
  return config.lidarr;
}
