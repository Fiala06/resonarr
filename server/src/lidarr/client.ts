import type { LidarrConfig } from "../config/env";

/**
 * Minimal Lidarr v1 API client.
 *
 * Auth is the X-Api-Key header — server-side only. Lookups resolve real
 * MusicBrainz entities, which is how we keep hallucinated suggestions out of
 * the request basket: a suggestion only becomes requestable if Lidarr's own
 * metadata lookup confirms it exists.
 */

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

export interface LidarrArtistLookup {
  artistName: string;
  foreignArtistId: string; // MusicBrainz artist id
  disambiguation?: string;
}

export class LidarrClient {
  constructor(private readonly cfg: LidarrConfig) {}

  private async request<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = new URL(path, this.cfg.url);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Api-Key": this.cfg.apiKey,
      },
    });
    if (!res.ok) {
      throw new Error(
        `Lidarr ${res.status} ${res.statusText} for ${url.pathname}`,
      );
    }
    return (await res.json()) as T;
  }

  systemStatus(): Promise<LidarrSystemStatus> {
    return this.request<LidarrSystemStatus>("/api/v1/system/status");
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
  artistLookup(term: string): Promise<LidarrArtistLookup[]> {
    return this.request<LidarrArtistLookup[]>("/api/v1/artist/lookup", {
      term,
    });
  }
}
