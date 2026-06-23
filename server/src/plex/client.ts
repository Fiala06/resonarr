import type { Track } from "@resonarr/shared";
import type { PlexConfig } from "../config/env.ts";

/**
 * Minimal Plex client over the HTTP API.
 *
 * Plex returns XML by default but emits JSON when asked via the Accept header.
 * Auth is the X-Plex-Token header — it never leaves the server.
 *
 * The sonic-similarity endpoint (`/library/metadata/{id}/nearest`) is the same
 * one Plexamp uses and python-plexapi wraps as `Track.sonicallySimilar()`. It
 * requires that Plex Pass Sonic Analysis has been run on the library.
 */

// --- Raw Plex JSON shapes (only the fields we read) ---------------------------

interface PlexDirectory {
  key: string;
  title: string;
  type: string; // "artist" for a music section
}

interface PlexMetadata {
  ratingKey: string;
  title: string;
  // Track-level fields
  grandparentTitle?: string; // artist
  parentTitle?: string; // album
  duration?: number;
  thumb?: string;
  type?: string;
}

interface PlexContainer<T> {
  MediaContainer: {
    size?: number;
    Directory?: T[];
    Metadata?: T[];
  };
}

const TRACK_TYPE = 10; // Plex library "type" value for tracks
const REQUEST_TIMEOUT_MS = 10_000;

export class PlexClient {
  constructor(private readonly cfg: PlexConfig) {}

  private async request<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    method: "GET" | "POST" = "GET",
  ): Promise<T> {
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
          "X-Plex-Token": this.cfg.token,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error(`Plex request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }
      throw new Error(
        `Plex request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!res.ok) {
      throw new Error(
        `Plex ${res.status} ${res.statusText} for ${url.pathname}`,
      );
    }
    return (await res.json()) as T;
  }

  /** Find the first music (artist-type) library section. */
  async getMusicSection(): Promise<{ key: string; title: string }> {
    const data = await this.request<PlexContainer<PlexDirectory>>(
      "/library/sections",
    );
    const dirs = data.MediaContainer.Directory ?? [];
    const music = dirs.find((d) => d.type === "artist");
    if (!music) {
      throw new Error(
        "No music (artist) library section found on this Plex server.",
      );
    }
    return { key: music.key, title: music.title };
  }

  /** Fetch a handful of tracks from a section — useful as sonic seeds. */
  async getSampleTracks(sectionKey: string, limit = 5): Promise<Track[]> {
    const data = await this.request<PlexContainer<PlexMetadata>>(
      `/library/sections/${sectionKey}/all`,
      { type: TRACK_TYPE, limit },
    );
    return (data.MediaContainer.Metadata ?? []).map(toTrack);
  }

  /**
   * Sonically similar tracks for a seed (Plex's `nearest` endpoint).
   * @param maxDistance optional sonic-distance ceiling (smaller = closer).
   */
  async sonicallySimilar(
    ratingKey: string,
    limit = 25,
    maxDistance?: number,
  ): Promise<Track[]> {
    const data = await this.request<PlexContainer<PlexMetadata>>(
      `/library/metadata/${ratingKey}/nearest`,
      { limit, maxDistance },
    );
    return (data.MediaContainer.Metadata ?? []).map(toTrack);
  }

  /**
   * Full-text track search via Plex's hub search (the `/all?query=` param is
   * silently ignored, so we use `/hubs/search` and pull the track hub).
   */
  async searchTracks(query: string, limit = 30): Promise<Track[]> {
    const data = await this.request<{
      MediaContainer: {
        Hub?: { type: string; Metadata?: PlexMetadata[] }[];
      };
    }>("/hubs/search", { query, limit });

    const trackHub = (data.MediaContainer.Hub ?? []).find(
      (h) => h.type === "track",
    );
    return (trackHub?.Metadata ?? []).map(toTrack);
  }

  /** The Plex server's machine identifier — required to build playlist URIs. */
  async getMachineIdentifier(): Promise<string> {
    const data = await this.request<{
      MediaContainer: { machineIdentifier?: string };
    }>("/identity");
    const id = data.MediaContainer.machineIdentifier;
    if (!id) throw new Error("Plex machineIdentifier not found");
    return id;
  }

  /** Create an audio playlist from a list of track ratingKeys. */
  async createPlaylist(
    title: string,
    trackIds: string[],
  ): Promise<{ playlistId: string; title: string; trackCount: number }> {
    if (trackIds.length === 0) {
      throw new Error("Cannot create an empty playlist");
    }
    const machineId = await this.getMachineIdentifier();
    const uri = `server://${machineId}/com.plexapp.plugins.library/library/metadata/${trackIds.join(",")}`;

    const data = await this.request<PlexContainer<PlexMetadata>>(
      "/playlists",
      { type: "audio", title, smart: 0, uri },
      "POST",
    );
    const created = data.MediaContainer.Metadata?.[0];
    if (!created) {
      throw new Error("Plex did not return the created playlist");
    }
    return {
      playlistId: created.ratingKey,
      title: created.title,
      trackCount: trackIds.length,
    };
  }
}

function toTrack(m: PlexMetadata): Track {
  return {
    id: m.ratingKey,
    title: m.title,
    artist: m.grandparentTitle ?? "",
    album: m.parentTitle ?? "",
    durationMs: m.duration,
    thumb: m.thumb,
  };
}
