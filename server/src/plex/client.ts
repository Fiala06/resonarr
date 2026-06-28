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

interface PlexPart {
  key?: string; // streamable file path, e.g. /library/parts/123/.../file.mp3
  container?: string; // "mp3", "flac", …
}

interface PlexMedia {
  container?: string;
  Part?: PlexPart[];
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
  userRating?: number; // this account's star rating, 0-10 (5★ = 10)
  type?: string;
  Media?: PlexMedia[]; // file/parts, used to stream a preview
  viewedAt?: number; // epoch seconds of a play event (history entries)
  accountID?: number; // which Plex account played it (history entries)
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
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
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
    // Some endpoints (DELETE, item edits) return an empty body — don't choke.
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /**
   * Set this account's star rating for a track (Plex `userRating`, 0–10; 0
   * clears it). Plex returns an empty body on success.
   */
  async rateTrack(ratingKey: string, rating: number): Promise<void> {
    await this.request(
      "/:/rate",
      { key: ratingKey, rating, identifier: "com.plexapp.plugins.library" },
      "PUT",
    );
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
    const ranked = await this.getTopArtistsWithPlays(sectionKey, limit);
    return ranked.map((r) => r.artist);
  }

  /** Like {@link getTopArtists} but keeps the aggregated play counts. */
  async getTopArtistsWithPlays(
    sectionKey: string,
    limit = 25,
  ): Promise<{ artist: string; plays: number }[]> {
    const tracks = await this.getTracks(sectionKey, "viewCount:desc", 400);
    const plays = new Map<string, number>();
    for (const t of tracks) {
      const n = t.viewCount ?? 0;
      if (n <= 0 || !t.artist || isNonArtist(t.artist)) continue;
      plays.set(t.artist, (plays.get(t.artist) ?? 0) + n);
    }
    return [...plays.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([artist, p]) => ({ artist, plays: p }));
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
   * Tracks this account has rated, paired with the star rating (0-10). Sorted
   * by rating desc, so we can stop at the first unrated track. Used to import
   * Plex stars into Resonarr feedback.
   */
  async getRatedTracks(
    sectionKey: string,
    max = 5000,
  ): Promise<{ track: Track; userRating: number }[]> {
    const data = await this.request<PlexContainer<PlexMetadata>>(
      `/library/sections/${sectionKey}/all`,
      { type: TRACK_TYPE, sort: "userRating:desc", limit: max },
    );
    const out: { track: Track; userRating: number }[] = [];
    for (const m of data.MediaContainer.Metadata ?? []) {
      const r = m.userRating ?? 0;
      if (r <= 0) break; // sorted desc — the rest are unrated
      out.push({ track: toTrack(m), userRating: r });
    }
    return out;
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
   * Tracks whose `lastViewedAt` falls within [fromEpoch, toEpoch] (epoch
   * seconds). Plex's `>>` / `<<` filter operators are percent-encoded by
   * URLSearchParams; Plex URL-decodes them server-side before parsing.
   */
  async getTracksViewedBetween(
    sectionKey: string,
    fromEpoch: number,
    toEpoch: number,
    limit = 50,
  ): Promise<Track[]> {
    const data = await this.request<PlexContainer<PlexMetadata>>(
      `/library/sections/${sectionKey}/all`,
      {
        type: TRACK_TYPE,
        sort: "viewCount:desc",
        limit,
        "lastViewedAt>>": fromEpoch,
        "lastViewedAt<<": toEpoch,
      },
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
  /**
   * Recent music play-history events, most recent first. Plex persists this, so
   * we read it on demand rather than tracking plays ourselves. Each entry knows
   * which account played it (so callers can scope to one user on a shared
   * server) and when (`viewedAt`, epoch seconds).
   */
  async getMusicPlayHistory(
    sectionKey: string,
    max = 2000,
  ): Promise<
    { ratingKey: string; title: string; artist?: string; viewedAt: number; accountID?: number }[]
  > {
    const data = await this.request<PlexContainer<PlexMetadata>>(
      "/status/sessions/history/all",
      {
        librarySectionID: sectionKey,
        sort: "viewedAt:desc",
        "X-Plex-Container-Start": 0,
        "X-Plex-Container-Size": max,
      },
    );
    return (data.MediaContainer.Metadata ?? [])
      .filter((m) => typeof m.viewedAt === "number")
      .map((m) => ({
        ratingKey: m.ratingKey,
        title: m.title,
        artist: m.grandparentTitle,
        viewedAt: m.viewedAt as number,
        accountID: m.accountID,
      }));
  }

  /** Resolve the streamable file part for a track (first media, first part). */
  private async getTrackPartKey(ratingKey: string): Promise<string> {
    const data = await this.request<PlexContainer<PlexMetadata>>(
      `/library/metadata/${ratingKey}`,
    );
    const key = data.MediaContainer.Metadata?.[0]?.Media?.[0]?.Part?.[0]?.key;
    if (!key) throw new Error(`No playable file for track ${ratingKey}`);
    return key;
  }

  /**
   * Stream a track's audio file straight from Plex, forwarding an optional HTTP
   * Range header so the browser can seek. Returns the upstream fetch Response so
   * the caller can pipe its body and status through. The Plex token stays here.
   */
  async streamTrack(ratingKey: string, range?: string): Promise<Response> {
    const key = await this.getTrackPartKey(ratingKey);
    const url = new URL(key, this.cfg.url);
    const res = await fetch(url, {
      headers: {
        "X-Plex-Token": this.cfg.token,
        ...(range ? { Range: range } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`Plex stream ${res.status} for track ${ratingKey}`);
    }
    return res;
  }

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

  /**
   * A deep link that opens a playlist in the Plex web/desktop app. Needs the
   * server's machine identifier; callers should treat it as best-effort.
   */
  async playlistWebUrl(playlistId: string): Promise<string> {
    const machineId = await this.getMachineIdentifier();
    const key = encodeURIComponent(`/playlists/${playlistId}`);
    return `https://app.plex.tv/desktop/#!/server/${machineId}/playlist?key=${key}`;
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

  /** Delete a playlist (used when an auto-playlist rebuilds in "replace" mode). */
  async deletePlaylist(playlistId: string): Promise<void> {
    await this.request(`/playlists/${playlistId}`, {}, "DELETE");
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

// Compilation / placeholder "artists" that pollute most-played aggregates and
// make useless discovery seeds.
const NON_ARTISTS = new Set([
  "various artists",
  "various",
  "va",
  "unknown artist",
  "[unknown artist]",
  "soundtrack",
]);

function isNonArtist(name: string): boolean {
  return NON_ARTISTS.has(name.trim().toLowerCase());
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
