import type {
  AddBasketItemRequest,
  AdventureResponse,
  AppSettings,
  AuthLoginStatus,
  AuthStatus,
  BasketItem,
  BulkAddBasketResponse,
  CreatePlaylistResponse,
  DeepCutsMode,
  DeepCutsResponse,
  DiscoverResponse,
  FeedbackItem,
  ImportRatingsResult,
  ListeningStats,
  SetFeedbackRequest,
  DiscoveryResult,
  AddToPlaylistResponse,
  ArtistDiscoveryResponse,
  AutoPlaylist,
  CreateAutoPlaylistRequest,
  UpdateAutoPlaylistRequest,
  HealthResponse,
  LibraryStats,
  LidarrOptions,
  LogEntry,
  LovedResponse,
  MixesResponse,
  OnThisDayResponse,
  PlexPinStart,
  PlaylistSummary,
  RadioResponse,
  SpotifyFileImportRequest,
  SpotifyImportRequest,
  SpotifyImportResult,
  SpotifyPlaylistSummary,
  SpotifyStatus,
  SpotifySync,
  StatsSummary,
  TasteProfile,
  Track,
  YearInReviewResponse,
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

export async function getStatsSummary(): Promise<StatsSummary> {
  return asJson(await fetch("/api/stats/summary"));
}

export async function getListeningStats(): Promise<ListeningStats> {
  return asJson(await fetch("/api/stats/listening"));
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

export async function getMixes(refresh = false): Promise<MixesResponse> {
  return asJson(await fetch(`/api/mixes${refresh ? "?refresh=1" : ""}`));
}

export async function getTasteProfile(refresh = false): Promise<TasteProfile> {
  return asJson(await fetch(`/api/taste-profile${refresh ? "?refresh=1" : ""}`));
}

/** The taste profile only if already cached (never triggers generation). */
export async function getCachedTasteProfile(): Promise<TasteProfile | null> {
  const r = await asJson<{ profile: TasteProfile | null }>(
    await fetch("/api/taste-profile/cached"),
  );
  return r.profile;
}

export async function discoverFromPlaylist(
  playlistId: string,
  limit?: number,
  newArtistsOnly?: boolean,
): Promise<DiscoverResponse> {
  return asJson(
    await fetch("/api/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlistId, limit, newArtistsOnly }),
    }),
  );
}

export async function getDeepCuts(
  mode: DeepCutsMode,
): Promise<DeepCutsResponse> {
  return asJson(await fetch(`/api/deepcuts?mode=${mode}`));
}

export async function discoverArtists(
  count?: number,
): Promise<ArtistDiscoveryResponse> {
  const q = count ? `?count=${count}` : "";
  return asJson(await fetch(`/api/artist-discovery${q}`));
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

// --- Scheduled auto-playlists (Discover Weekly) ------------------------------

export async function getAutoPlaylists(): Promise<AutoPlaylist[]> {
  return asJson(await fetch("/api/auto-playlists"));
}

export async function createAutoPlaylist(
  input: CreateAutoPlaylistRequest,
): Promise<AutoPlaylist> {
  return asJson(
    await fetch("/api/auto-playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateAutoPlaylist(
  id: string,
  patch: UpdateAutoPlaylistRequest,
): Promise<AutoPlaylist> {
  return asJson(
    await fetch(`/api/auto-playlists/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

export async function deleteAutoPlaylist(id: string): Promise<void> {
  await asJson<{ ok: true }>(
    await fetch(`/api/auto-playlists/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  );
}

export async function runAutoPlaylist(id: string): Promise<AutoPlaylist> {
  return asJson(
    await fetch(`/api/auto-playlists/${encodeURIComponent(id)}/run`, {
      method: "POST",
    }),
  );
}

// --- Like/dislike feedback ---------------------------------------------------

export async function getFeedback(): Promise<FeedbackItem[]> {
  return asJson(await fetch("/api/feedback"));
}

export async function putFeedback(
  req: SetFeedbackRequest,
): Promise<FeedbackItem[]> {
  return asJson(
    await fetch("/api/feedback", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }),
  );
}

export async function importPlexRatings(): Promise<ImportRatingsResult> {
  return asJson(await fetch("/api/feedback/import-plex", { method: "POST" }));
}

export async function getLoved(): Promise<LovedResponse> {
  return asJson(await fetch("/api/loved"));
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

export async function refreshBasket(): Promise<BasketItem[]> {
  return asJson(await fetch("/api/basket/refresh", { method: "POST" }));
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

export async function getAuthStatus(): Promise<AuthStatus> {
  const res = await fetch("/api/auth/me");
  if (res.status === 401) return { authRequired: true };
  return asJson(res);
}

export async function startLogin(): Promise<PlexPinStart> {
  return asJson(await fetch("/api/auth/login", { method: "POST" }));
}

export async function pollLogin(pinId: string): Promise<AuthLoginStatus> {
  return asJson(await fetch(`/api/auth/login/${encodeURIComponent(pinId)}`));
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function getLogs(limit = 200): Promise<LogEntry[]> {
  return asJson(await fetch(`/api/logs?limit=${limit}`));
}

export async function clearLogs(): Promise<void> {
  await fetch("/api/logs", { method: "DELETE" });
}

export async function getSageExamples(refresh = false): Promise<string[]> {
  const r = await asJson<{ examples: string[] }>(
    await fetch(`/api/sage/examples${refresh ? "?refresh=1" : ""}`),
  );
  return r.examples;
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

// --- Spotify import ----------------------------------------------------------

export async function getSpotifyStatus(): Promise<SpotifyStatus> {
  return asJson(await fetch("/api/spotify/auth/status"));
}

export async function disconnectSpotify(): Promise<void> {
  await fetch("/api/spotify/auth/logout", { method: "DELETE" });
}

export async function getSpotifyPlaylists(): Promise<SpotifyPlaylistSummary[]> {
  return asJson(await fetch("/api/spotify/playlists"));
}

export async function importSpotify(
  req: SpotifyImportRequest,
): Promise<SpotifyImportResult> {
  return asJson(
    await fetch("/api/spotify/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }),
  );
}

// --- Time machine ------------------------------------------------------------

export async function getOnThisDay(): Promise<OnThisDayResponse> {
  return asJson(await fetch("/api/timemachine/onthisday"));
}

export async function getYearInReview(year: number): Promise<YearInReviewResponse> {
  return asJson(await fetch(`/api/timemachine/year/${year}`));
}

export async function importSpotifyFile(
  req: SpotifyFileImportRequest,
): Promise<SpotifyImportResult> {
  return asJson(
    await fetch("/api/spotify/import/tracks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }),
  );
}

// --- Spotify ongoing syncs ---------------------------------------------------

export async function listSpotifySyncs(): Promise<SpotifySync[]> {
  return asJson(await fetch("/api/spotify/syncs"));
}

export async function runSpotifySync(id: string): Promise<SpotifySync> {
  return asJson(await fetch(`/api/spotify/syncs/${id}/run`, { method: "POST" }));
}

export async function updateSpotifySync(
  id: string,
  patch: { enabled?: boolean; intervalDays?: number },
): Promise<SpotifySync> {
  return asJson(
    await fetch(`/api/spotify/syncs/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

export async function deleteSpotifySync(id: string): Promise<void> {
  await fetch(`/api/spotify/syncs/${id}`, { method: "DELETE" });
}
