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
  parentThumb?: string; // album art
  grandparentThumb?: string; // artist art
  leafCount?: number; // playlist track count
  viewCount?: number; // lifetime play count
  lastViewedAt?: number; // epoch seconds of last play
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
    method: "GET" | "POST" | "PUT" = "GET",
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

  /** Total track / album / artist counts for a section. */
  async getLibraryStats(
    sectionKey: string,
  ): Promise<{ tracks: number; albums: number; artists: number }> {
    const count = async (type: number): Promise<number> => {
      const data = await this.request<{
        MediaContainer: { totalSize?: number; size?: number };
      }>(`/library/sections/${sectionKey}/all`, {
        type,
        "X-Plex-Container-Size": 0,
        "X-Plex-Container-Start": 0,
      });
      return data.MediaContainer.totalSize ?? data.MediaContainer.size ?? 0;
    };
    const [tracks, albums, artists] = await Promise.all([
      count(TRACK_TYPE),
      count(9), // album
      count(8), // artist
    ]);
    return { tracks, albums, artists };
  }

  /** Artist names in a section (type 8) — used to bias LLM suggestions. */
  async getArtistNames(sectionKey: string, limit = 200): Promise<string[]> {
    const data = await this.request<PlexContainer<PlexMetadata>>(
      `/library/sections/${sectionKey}/all`,
      { type: 8, limit },
    );
    return (data.MediaContainer.Metadata ?? [])
      .map((m) => m.title)
      .filter((t): t is string => Boolean(t));
  }

  /**
   * Artists you actually listen to, most-played first — derived from track play
   * counts (Plex doesn't aggregate viewCount reliably at the artist level).
   * Returns an empty array when nothing has been played yet.
   */
  async getTopArtists(sectionKey: string, limit = 25): Promise<string[]> {
    const tracks = await this.getTracks(sectionKey, "viewCount:desc", 400);
    const plays = new Map<string, number>();
    for (const t of tracks) {
      const n = t.viewCount ?? 0;
      if (n <= 0 || !t.artist) continue;
      plays.set(t.artist, (plays.get(t.artist) ?? 0) + n);
    }
    return [...plays.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name]) => name);
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
   * A page of section tracks under a given Plex sort (e.g. `random`,
   * `viewCount:desc`, `lastViewedAt:asc`). Returned tracks carry viewCount /
   * lastPlayedAt for play-history features (Deep cuts).
   */
  async getTracks(
    sectionKey: string,
    sort: string,
    limit = 100,
  ): Promise<Track[]> {
    const data = await this.request<PlexContainer<PlexMetadata>>(
      `/library/sections/${sectionKey}/all`,
      { type: TRACK_TYPE, sort, limit },
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

  /** Recently played tracks from a section's play history (de-duplicated). */
  async getRecentlyPlayed(sectionKey: string, limit = 40): Promise<Track[]> {
    const data = await this.request<PlexContainer<PlexMetadata>>(
      "/status/sessions/history/all",
      { librarySectionID: sectionKey, sort: "viewedAt:desc", limit },
    );
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const m of data.MediaContainer.Metadata ?? []) {
      if (!m.ratingKey || seen.has(m.ratingKey)) continue;
      seen.add(m.ratingKey);
      out.push(toTrack(m));
    }
    return out;
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

  /** Fetch raw image bytes for a Plex art path (proxied to the browser). */
  async fetchArt(path: string): Promise<{ contentType: string; body: Buffer }> {
    const url = new URL(path, this.cfg.url);
    const res = await fetch(url, {
      headers: { "X-Plex-Token": this.cfg.token },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Plex art ${res.status} for ${url.pathname}`);
    return {
      contentType: res.headers.get("content-type") ?? "image/jpeg",
      body: Buffer.from(await res.arrayBuffer()),
    };
  }

  /** Fetch a single track by ratingKey. */
  async getTrack(ratingKey: string): Promise<Track> {
    const data = await this.request<PlexContainer<PlexMetadata>>(
      `/library/metadata/${ratingKey}`,
    );
    const m = data.MediaContainer.Metadata?.[0];
    if (!m) throw new Error(`Track ${ratingKey} not found`);
    return toTrack(m);
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

  /** List audio playlists. */
  async getPlaylists(): Promise<
    { id: string; title: string; trackCount: number }[]
  > {
    const data = await this.request<PlexContainer<PlexMetadata>>("/playlists", {
      playlistType: "audio",
    });
    return (data.MediaContainer.Metadata ?? []).map((m) => ({
      id: m.ratingKey,
      title: m.title,
      trackCount: m.leafCount ?? 0,
    }));
  }

  /** Tracks contained in a playlist (used as discovery seeds). */
  async getPlaylistTracks(playlistId: string, limit = 600): Promise<Track[]> {
    const data = await this.request<PlexContainer<PlexMetadata>>(
      `/playlists/${playlistId}/items`,
      { limit },
    );
    return (data.MediaContainer.Metadata ?? []).map(toTrack);
  }

  /** Append tracks to an existing playlist. */
  async addToPlaylist(
    playlistId: string,
    trackIds: string[],
  ): Promise<number> {
    if (trackIds.length === 0) throw new Error("No tracks to add");
    const machineId = await this.getMachineIdentifier();
    const uri = `server://${machineId}/com.plexapp.plugins.library/library/metadata/${trackIds.join(",")}`;
    await this.request(`/playlists/${playlistId}/items`, { uri }, "PUT");
    return trackIds.length;
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
    thumb: m.thumb ?? m.parentThumb ?? m.grandparentThumb,
    viewCount: m.viewCount,
    lastPlayedAt: m.lastViewedAt,
  };
}
