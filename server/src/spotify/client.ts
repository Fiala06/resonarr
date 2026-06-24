import type { SpotifyToken } from "./auth.ts";
import type { SpotifyPlaylistSummary } from "@resonarr/shared";

export interface SpotifyTrackItem {
  title: string;
  artist: string;
  album: string;
  isrc?: string;
}

interface RawTrack {
  name: string;
  artists: { name: string }[];
  album: { name: string };
  external_ids?: { isrc?: string };
}

export class SpotifyClient {
  constructor(private readonly token: SpotifyToken) {}

  private async get<T>(
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<T> {
    const url = new URL(`https://api.spotify.com/v1${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token.accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Spotify ${res.status} for ${path}: ${body}`);
    }
    return (await res.json()) as T;
  }

  async getPlaylists(): Promise<SpotifyPlaylistSummary[]> {
    const out: SpotifyPlaylistSummary[] = [];
    let offset = 0;
    const limit = 50;

    while (true) {
      const page = await this.get<{
        items: {
          id: string;
          name: string;
          tracks: { total: number };
          owner: { display_name?: string; id: string };
        }[];
        next: string | null;
      }>("/me/playlists", { limit, offset });

      for (const p of page.items) {
        if (!p) continue;
        out.push({
          id: p.id,
          name: p.name,
          trackCount: p.tracks.total,
          owner: p.owner.display_name ?? p.owner.id,
        });
      }

      if (!page.next || out.length >= 500) break;
      offset += limit;
    }

    return out;
  }

  async getLikedTracks(cap = 500): Promise<SpotifyTrackItem[]> {
    return this.paginate<{ track: RawTrack | null }>(
      "/me/tracks",
      (item) => item.track,
      cap,
    );
  }

  async getPlaylistTracks(
    playlistId: string,
    cap = 500,
  ): Promise<SpotifyTrackItem[]> {
    return this.paginate<{ track: RawTrack | null }>(
      `/playlists/${playlistId}/tracks`,
      (item) => item.track,
      cap,
    );
  }

  private async paginate<Item>(
    path: string,
    extractor: (item: Item) => RawTrack | null,
    cap: number,
  ): Promise<SpotifyTrackItem[]> {
    const out: SpotifyTrackItem[] = [];
    let offset = 0;
    const limit = 50;

    while (out.length < cap) {
      const page = await this.get<{ items: Item[]; next: string | null }>(path, {
        limit,
        offset,
      });

      for (const item of page.items) {
        const track = extractor(item);
        if (!track || !track.name || !track.artists?.length) continue;
        out.push({
          title: track.name,
          artist: track.artists[0].name ?? "",
          album: track.album?.name ?? "",
          isrc: track.external_ids?.isrc,
        });
      }

      if (!page.next || out.length >= cap) break;
      offset += limit;
    }

    return out;
  }
}
