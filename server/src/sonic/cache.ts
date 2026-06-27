import type { Track } from "@resonarr/shared";
import { getDb } from "../db/database.ts";
import type { PlexClient } from "../plex/client.ts";
import { safeJsonParse } from "../util/json.ts";

/** Sonic neighbor lists change rarely; cache them for a day. */
const SONIC_TTL_MS = 1000 * 60 * 60 * 24;

function cacheGet<T>(key: string): T | null {
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

function cacheSet(key: string, payload: unknown, ttlMs: number): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO sonic_cache (cache_key, payload, expires_at) VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET
       payload = excluded.payload, expires_at = excluded.expires_at`,
  ).run(key, JSON.stringify(payload), Date.now() + ttlMs);
}

/**
 * Plex sonic similarity with a SQLite-backed cache in front, so repeated
 * `nearest` queries (Radio, Mixes, Adventure) don't hammer the Plex server.
 */
export class SonicService {
  constructor(private readonly plex: PlexClient) {}

  async similar(
    ratingKey: string,
    limit = 25,
    maxDistance?: number,
  ): Promise<Track[]> {
    const key = `nearest:${ratingKey}:${limit}:${maxDistance ?? "-"}`;
    const cached = cacheGet<Track[]>(key);
    if (cached) return cached;

    const tracks = await this.plex.sonicallySimilar(ratingKey, limit, maxDistance);
    cacheSet(key, tracks, SONIC_TTL_MS);
    return tracks;
  }
}
