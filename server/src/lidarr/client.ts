import type { LidarrConfig } from "../config/env.ts";

/**
 * Minimal Lidarr v1 API client.
 *
 * Auth is the X-Api-Key header — server-side only. Lookups resolve real
 * MusicBrainz entities, which is how we keep hallucinated suggestions out of
 * the request basket: a suggestion only becomes requestable if Lidarr's own
 * metadata lookup confirms it exists.
 */

const REQUEST_TIMEOUT_MS = 15_000;

export interface LidarrSystemStatus {
  version: string;
  appName?: string;
}

export interface LidarrRootFolder {
  id: number;
  path: string;
  freeSpace?: number;
}

export interface LidarrProfile {
  id: number;
  name: string;
}

/**
 * A Lidarr artist lookup result. Carries the known fields we read plus the rest
 * of the object (index signature) so it can be POSTed back verbatim to add the
 * artist — Lidarr expects the full lookup object plus a few extra fields.
 */
export interface LidarrArtistResult {
  artistName: string;
  foreignArtistId: string; // MusicBrainz artist id
  disambiguation?: string;
  [key: string]: unknown;
}

export interface LidarrStatistics {
  trackFileCount?: number;
  totalTrackCount?: number;
  /** 0–100; share of tracks that have files. */
  percentOfTracks?: number;
}

export interface LidarrImage {
  coverType?: string; // "poster", "fanart", "banner", …
  url?: string; // Lidarr-relative (needs api key) — not browser-loadable
  remoteUrl?: string; // public metadata URL — safe to load directly
}

export interface LidarrArtist {
  id: number;
  foreignArtistId: string;
  artistName: string;
  statistics?: LidarrStatistics;
  images?: LidarrImage[];
}

export interface LidarrAlbum {
  id: number;
  title: string;
  foreignAlbumId: string;
  statistics?: LidarrStatistics;
}

export interface AddArtistOptions {
  rootFolderPath: string;
  qualityProfileId: number;
  metadataProfileId: number;
  monitored: boolean;
  searchForMissingAlbums: boolean;
  /** Lidarr monitor mode for albums: "all" | "none" | "future" | ... */
  monitor?: string;
}

interface RequestOptions {
  params?: Record<string, string | number | undefined>;
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
}

export class LidarrClient {
  constructor(private readonly cfg: LidarrConfig) {}

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const { params = {}, method = "GET", body } = opts;
    const url = new URL(path, this.cfg.url);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          "X-Api-Key": this.cfg.apiKey,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error(`Lidarr request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }
      throw new Error(
        `Lidarr request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 300);
      } catch {
        /* ignore */
      }
      throw new Error(
        `Lidarr ${res.status} ${res.statusText} for ${url.pathname}${detail ? ` — ${detail}` : ""}`,
      );
    }
    // Some endpoints (commands) may return empty bodies.
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  systemStatus(): Promise<LidarrSystemStatus> {
    return this.request<LidarrSystemStatus>("/api/v1/system/status");
  }

  /**
   * Fetch a Lidarr image (e.g. a `/MediaCover/...` artist poster) with the API
   * key, so the browser can show it without ever seeing the key. Mirrors the
   * Plex art proxy.
   */
  async fetchImage(path: string): Promise<{ contentType: string; body: Buffer }> {
    const url = new URL(path, this.cfg.url);
    const res = await fetch(url, {
      headers: { "X-Api-Key": this.cfg.apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Lidarr image ${res.status} for ${url.pathname}`);
    return {
      contentType: res.headers.get("content-type") ?? "image/jpeg",
      body: Buffer.from(await res.arrayBuffer()),
    };
  }

  rootFolders(): Promise<LidarrRootFolder[]> {
    return this.request<LidarrRootFolder[]>("/api/v1/rootfolder");
  }

  qualityProfiles(): Promise<LidarrProfile[]> {
    return this.request<LidarrProfile[]>("/api/v1/qualityprofile");
  }

  metadataProfiles(): Promise<LidarrProfile[]> {
    return this.request<LidarrProfile[]>("/api/v1/metadataprofile");
  }

  /** Resolve a search term to real MusicBrainz artists. */
  artistLookup(term: string): Promise<LidarrArtistResult[]> {
    return this.request<LidarrArtistResult[]>("/api/v1/artist/lookup", {
      params: { term },
    });
  }

  /** Artists already in Lidarr (used to avoid double-adding). Includes
   *  download statistics so callers can tell what has landed on disk. */
  getArtists(): Promise<LidarrArtist[]> {
    return this.request<LidarrArtist[]>("/api/v1/artist");
  }

  /** Albums for an artist, with per-album download statistics. */
  getAlbums(artistId: number): Promise<LidarrAlbum[]> {
    return this.request<LidarrAlbum[]>("/api/v1/album", {
      params: { artistId },
    });
  }

  /** Add an artist from a lookup result with the given target + profiles. */
  addArtist(
    artist: LidarrArtistResult,
    opts: AddArtistOptions,
  ): Promise<LidarrArtist> {
    const body = {
      ...artist,
      qualityProfileId: opts.qualityProfileId,
      metadataProfileId: opts.metadataProfileId,
      rootFolderPath: opts.rootFolderPath,
      monitored: opts.monitored,
      addOptions: {
        monitor: opts.monitor ?? "all",
        searchForMissingAlbums: opts.searchForMissingAlbums,
      },
    };
    return this.request<LidarrArtist>("/api/v1/artist", {
      method: "POST",
      body,
    });
  }

  /** Trigger a search across an artist's monitored albums. */
  async searchArtist(artistId: number): Promise<void> {
    await this.request("/api/v1/command", {
      method: "POST",
      body: { name: "ArtistSearch", artistId },
    });
  }
}
