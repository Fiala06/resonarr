import type { AppSettings } from "@resonarr/shared";
import { DEFAULT_SETTINGS } from "@resonarr/shared";
import { getDb } from "../db/database.ts";
import { config } from "../config/env.ts";

const ALLOWED_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));

/**
 * Effective settings = defaults, with the LLM provider seeded from env on first
 * run, overlaid with anything the user has saved.
 */
export function getSettings(): AppSettings {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];

  const stored: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      stored[r.key] = JSON.parse(r.value);
    } catch {
      stored[r.key] = r.value;
    }
  }

  return {
    ...DEFAULT_SETTINGS,
    llmProvider: config.llm.provider,
    ...stored,
  } as AppSettings;
}

/** Persist a partial update (unknown keys are ignored) and return the result. */
export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );

  for (const [key, value] of Object.entries(patch)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    upsert.run(key, JSON.stringify(value));
  }

  return getSettings();
}
