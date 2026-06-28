import type { Track } from "@resonarr/shared";
import type { PlexClient } from "../plex/client.ts";
import { cacheGet, cacheSet } from "../cache/store.ts";

/** Sonic neighbor lists change rarely; cache them for a day. */
const SONIC_TTL_MS = 1000 * 60 * 60 * 24;

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
