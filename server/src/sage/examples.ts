import type { PlexClient } from "../plex/client.ts";
import { getDb } from "../db/database.ts";
import { getProvider } from "../llm/index.ts";
import { extractJsonObject } from "../llm/prompt.ts";
import { log } from "../log/service.ts";

const CACHE_KEY = "sage:examples";
const TTL_MS = 1000 * 60 * 60 * 24 * 3; // 3 days
const COUNT = 10;

// Used before any history exists, or if the LLM call fails — the UI always has
// something to offer.
const FALLBACK = [
  "mellow late-night indie for focus",
  "90s alt-rock deep cuts for a long drive",
  "melancholic, haunting vocals with big choruses",
  "upbeat throwback pop to clean the house to",
  "moody electronic for a rainy afternoon",
  "acoustic singer-songwriter, coffee-shop warmth",
  "high-energy workout anthems",
  "dreamy shoegaze and slowcore to wind down",
];

const SYSTEM_PROMPT = `You write short, vivid example search prompts for a music discovery app, in the user's own voice.
Respond with ONLY a JSON object of exactly this shape and nothing else:
{"examples":["short evocative prompt", ...]}
Each example is a short phrase describing a vibe, mood, activity, or era — like "melancholic, haunting vocals, reminiscent of Evanescence" or "90s alt-rock deep cuts for a late drive". Vary across mood, activity, and era; reference a few of the user's artists by name where natural. No prose, no markdown.`;

/**
 * Personalized "Try one of these" prompts for Sonic Sage, seeded from the
 * user's top artists and cached for a few days. `refresh` forces regeneration.
 */
export async function getSageExamples(
  plex: PlexClient,
  refresh = false,
): Promise<string[]> {
  if (!refresh) {
    const cached = readCache();
    if (cached) return cached;
  }

  let examples: string[];
  try {
    const section = await plex.getMusicSection();
    const top = await plex.getTopArtists(section.key, 20);
    const provider = getProvider();
    const user =
      top.length > 0
        ? `My top artists: ${top.join(", ")}.\nGenerate ${COUNT} example prompts.`
        : `Generate ${COUNT} example prompts for a general listener.`;
    const text = await provider.chat(SYSTEM_PROMPT, user);
    examples = parse(text);
    if (examples.length < 4) examples = FALLBACK;
  } catch (err) {
    log.warn("sage", `Example generation failed: ${err instanceof Error ? err.message : String(err)}`);
    examples = FALLBACK;
  }

  writeCache(examples);
  return examples;
}

function parse(text: string): string[] {
  const obj = extractJsonObject(text);
  const arr = obj && Array.isArray(obj.examples) ? obj.examples : [];
  return arr
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((s) => s.length > 0 && s.length < 120)
    .slice(0, COUNT);
}

function readCache(): string[] | null {
  const row = getDb()
    .prepare("SELECT payload, expires_at FROM sonic_cache WHERE cache_key = ?")
    .get(CACHE_KEY) as { payload: string; expires_at: number } | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  try {
    const arr = JSON.parse(row.payload) as unknown;
    return Array.isArray(arr) ? (arr as string[]) : null;
  } catch {
    return null;
  }
}

function writeCache(examples: string[]): void {
  getDb()
    .prepare(
      `INSERT INTO sonic_cache (cache_key, payload, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         payload = excluded.payload, expires_at = excluded.expires_at`,
    )
    .run(CACHE_KEY, JSON.stringify(examples), Date.now() + TTL_MS);
}
