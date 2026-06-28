import { getDb } from "../db/database.ts";
import { safeJsonParse } from "../util/json.ts";

/**
 * A tiny SQLite-backed key/value cache with TTLs, sharing the `sonic_cache`
 * table. Used as a read-through cache in front of expensive work — LLM calls
 * (taste profile), Plex fan-out (mixes), and library counts — so navigating
 * back to a page doesn't redo the work every time.
 */

export function cacheGet<T>(key: string): T | null {
  const db = getDb();
  const row = db
    .prepare("SELECT payload, expires_at FROM sonic_cache WHERE cache_key = ?")
    .get(key) as { payload: string; expires_at: number } | undefined;

  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare("DELETE FROM sonic_cache WHERE cache_key = ?").run(key);
    return null;
  }
  const parsed = safeJsonParse<T | null>(row.payload, null);
  if (parsed === null) {
    // Corrupt entry — drop it and treat as a miss so the caller refetches.
    db.prepare("DELETE FROM sonic_cache WHERE cache_key = ?").run(key);
  }
  return parsed;
}

export function cacheSet(key: string, payload: unknown, ttlMs: number): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO sonic_cache (cache_key, payload, expires_at) VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET
       payload = excluded.payload, expires_at = excluded.expires_at`,
  ).run(key, JSON.stringify(payload), Date.now() + ttlMs);
}

export function cacheDelete(key: string): void {
  getDb().prepare("DELETE FROM sonic_cache WHERE cache_key = ?").run(key);
}

/**
 * Read-through cache: return the cached value for `key`, or run `compute`,
 * store its result, and return it. Pass `force` to bypass the read and
 * recompute (e.g. a "Regenerate"/"Refresh" button).
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  compute: () => Promise<T>,
  force = false,
): Promise<T> {
  if (!force) {
    const hit = cacheGet<T>(key);
    if (hit !== null) return hit;
  }
  const value = await compute();
  cacheSet(key, value, ttlMs);
  return value;
}
