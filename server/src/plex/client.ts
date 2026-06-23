import type { Track } from "@resonarr/shared";
import type { PlexConfig } from "../config/env";

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

export class PlexClient {
  constructor(private readonly cfg: PlexConfig) {}

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
        "X-Plex-Token": this.cfg.token,
      },
    });
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
