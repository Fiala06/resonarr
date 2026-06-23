import type {
  AppSettings,
  BasketItem,
  CreatePlaylistResponse,
  HealthResponse,
  LidarrOptions,
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

export async function getRadio(seedTrackId: string): Promise<RadioResponse> {
  return asJson(
    await fetch("/api/radio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seedTrackId }),
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
