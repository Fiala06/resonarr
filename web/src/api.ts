import type {
  AddBasketItemRequest,
  AdventureResponse,
  AppSettings,
  BasketItem,
  BulkAddBasketResponse,
  CreatePlaylistResponse,
  DiscoverResponse,
  DiscoveryResult,
  AddToPlaylistResponse,
  HealthResponse,
  LibraryStats,
  LidarrOptions,
  LogEntry,
  MixesResponse,
  PlaylistSummary,
  RadioResponse,
  Track,
} from "@resonarr/shared";

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) detail = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export async function getHealth(): Promise<HealthResponse> {
  return asJson(await fetch("/api/health"));
}

export async function getLibraryStats(): Promise<LibraryStats> {
  return asJson(await fetch("/api/library/stats"));
}

export async function getSettings(): Promise<AppSettings> {
  return asJson(await fetch("/api/settings"));
}

export async function putSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  return asJson(
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

export async function getLidarrOptions(): Promise<LidarrOptions> {
  return asJson(await fetch("/api/lidarr/options"));
}

export async function searchTracks(q: string): Promise<Track[]> {
  return asJson(await fetch(`/api/search/tracks?q=${encodeURIComponent(q)}`));
}

export async function getRadio(
  seedTrackId: string,
  limit?: number,
): Promise<RadioResponse> {
  return asJson(
    await fetch("/api/radio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seedTrackId, limit }),
    }),
  );
}

export async function getMixes(): Promise<MixesResponse> {
  return asJson(await fetch("/api/mixes"));
}

export async function discoverFromPlaylist(
  playlistId: string,
  limit?: number,
): Promise<DiscoverResponse> {
  return asJson(
    await fetch("/api/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlistId, limit }),
    }),
  );
}

export async function getAdventure(
  startTrackId: string,
  endTrackId: string,
  length?: number,
): Promise<AdventureResponse> {
  return asJson(
    await fetch("/api/adventure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startTrackId, endTrackId, length }),
    }),
  );
}

export async function createPlaylist(
  name: string,
  trackIds: string[],
): Promise<CreatePlaylistResponse> {
  return asJson(
    await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, trackIds }),
    }),
  );
}

export async function getPlaylists(): Promise<PlaylistSummary[]> {
  return asJson(await fetch("/api/playlists"));
}

export async function addToPlaylist(
  id: string,
  trackIds: string[],
): Promise<AddToPlaylistResponse> {
  return asJson(
    await fetch(`/api/playlists/${encodeURIComponent(id)}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackIds }),
    }),
  );
}

export async function getBasket(): Promise<BasketItem[]> {
  return asJson(await fetch("/api/basket"));
}

export async function addToBasket(
  artist: string,
  album?: string,
): Promise<BasketItem> {
  return asJson(
    await fetch("/api/basket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artist, album }),
    }),
  );
}

export async function removeFromBasket(id: string): Promise<void> {
  await fetch(`/api/basket/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function requestBasket(ids?: string[]): Promise<BasketItem[]> {
  return asJson(
    await fetch("/api/basket/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }),
  );
}

export async function bulkAddBasket(
  items: AddBasketItemRequest[],
): Promise<BulkAddBasketResponse> {
  return asJson(
    await fetch("/api/basket/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    }),
  );
}

export async function getLogs(limit = 200): Promise<LogEntry[]> {
  return asJson(await fetch(`/api/logs?limit=${limit}`));
}

export async function clearLogs(): Promise<void> {
  await fetch("/api/logs", { method: "DELETE" });
}

export async function runSage(
  prompt: string,
  ownArtistBias: boolean,
  count: number,
): Promise<DiscoveryResult> {
  return asJson(
    await fetch("/api/sage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, ownArtistBias, count }),
    }),
  );
}
