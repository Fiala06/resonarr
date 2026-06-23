/**
 * Shared DTOs used by both the server API and the web client.
 * One source of truth for the shapes that cross the /api boundary.
 */

// ---------------------------------------------------------------------------
// Music primitives
// ---------------------------------------------------------------------------

/** A track that exists in the Plex library. */
export interface Track {
  /** Plex ratingKey — the stable id for the track. */
  id: string;
  title: string;
  artist: string;
  album: string;
  /** Duration in milliseconds, when known. */
  durationMs?: number;
  /** Relative Plex art path, proxied through the server when displayed. */
  thumb?: string;
}

/** An LLM suggestion before it has been matched against the library. */
export interface Suggestion {
  artist: string;
  title?: string;
  album?: string;
}

// ---------------------------------------------------------------------------
// Discovery features
// ---------------------------------------------------------------------------

export interface RadioRequest {
  seedTrackId: string;
  limit?: number;
}

export interface RadioResponse {
  tracks: Track[];
}

export interface AdventureRequest {
  startTrackId: string;
  endTrackId: string;
  /** Desired number of steps in the path. */
  length?: number;
}

export interface AdventureResponse {
  /** Ordered path from start to destination, inclusive. */
  path: Track[];
}

export interface MixCard {
  /** Stable id (the seed track's id). */
  id: string;
  title: string;
  seed: Track;
  tracks: Track[];
}

export interface MixesResponse {
  mixes: MixCard[];
}

export interface LibraryStats {
  tracks: number;
  albums: number;
  artists: number;
}

/** Discover fresh, owned tracks sonically similar to a chosen playlist. */
export interface DiscoverRequest {
  /** Plex playlist to learn from (e.g. a "Loved" / "Liked Songs" list). */
  playlistId: string;
  /** Max fresh tracks to return (clamped server-side). */
  limit?: number;
}

export interface DiscoverResponse {
  /** The playlist the picks were seeded from. */
  source: PlaylistSummary;
  /** Owned tracks similar to the source but not already in it. */
  tracks: Track[];
}

export interface SageRequest {
  prompt: string;
  /** Bias recommendations toward artists already owned. */
  ownArtistBias?: boolean;
  /** How many tracks to ask the LLM for (clamped server-side). */
  count?: number;
}

/** Result of any discovery run: owned matches plus unowned misses. */
export interface DiscoveryResult {
  /** Owned tracks — these can form a playlist. */
  matches: Track[];
  /** Suggested-but-unowned items destined for the request basket. */
  misses: Suggestion[];
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

export type LogLevel = "info" | "warn" | "error";

/** A recorded app event, surfaced in the Logs view and mirrored to stdout. */
export interface LogEntry {
  id: number;
  /** ISO 8601 timestamp. */
  ts: string;
  level: LogLevel;
  /** Originating feature/subsystem, e.g. "sage", "discover", "basket". */
  source: string;
  message: string;
  /** Optional structured context (already JSON-stringified). */
  detail?: string;
}

// ---------------------------------------------------------------------------
// Request basket / Lidarr
// ---------------------------------------------------------------------------

export type BasketItemType = "artist" | "album";
/**
 * pending  — added, not yet sent to Lidarr
 * requested — submitted to Lidarr, searching/downloading
 * done     — Lidarr now has the files (confirmed via statistics)
 * failed   — submission errored
 */
export type BasketItemStatus = "pending" | "requested" | "done" | "failed";

export type BasketItemSource = "sonic-sage" | "manual";

export interface BasketItem {
  id: string;
  type: BasketItemType;
  artist: string;
  album?: string;
  /** MusicBrainz id resolved via Lidarr lookup (proves it is real). */
  mbid?: string;
  source: BasketItemSource;
  status: BasketItemStatus;
  createdAt: string;
}

export interface AddBasketItemRequest {
  artist: string;
  album?: string;
  source?: BasketItemSource;
}

export interface RequestBasketRequest {
  /** Specific basket item ids to submit; omitted/empty = all pending. */
  ids?: string[];
}

export interface BulkAddBasketRequest {
  items: AddBasketItemRequest[];
}

export interface BulkAddBasketResponse {
  added: BasketItem[];
  failed: { artist: string; error: string }[];
}

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------

export interface CreatePlaylistRequest {
  name: string;
  trackIds: string[];
}

export interface CreatePlaylistResponse {
  playlistId: string;
  name: string;
  trackCount: number;
}

export interface PlaylistSummary {
  id: string;
  title: string;
  trackCount: number;
}

export interface AddToPlaylistResponse {
  playlistId: string;
  added: number;
}

// ---------------------------------------------------------------------------
// Settings (persisted server-side; non-secret prefs only)
// ---------------------------------------------------------------------------

export type LlmProvider = "claude" | "openai" | "ollama";

export interface AppSettings {
  /** Active LLM provider for Sonic Sage. */
  llmProvider: LlmProvider;
  /** Model id for the active provider ("" = adapter default). */
  llmModel: string;
  /** Default state of the "bias toward owned artists" toggle. */
  ownArtistBias: boolean;
  /** Lidarr target for new requests. */
  lidarrRootFolderPath: string;
  lidarrQualityProfileId: number | null;
  lidarrMetadataProfileId: number | null;
  /** Prefix applied to playlists Resonarr creates in Plex. */
  playlistPrefix: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  llmProvider: "claude",
  llmModel: "",
  ownArtistBias: false,
  lidarrRootFolderPath: "",
  lidarrQualityProfileId: null,
  lidarrMetadataProfileId: null,
  playlistPrefix: "Resonarr",
};

/** Lidarr targets offered in the Settings UI dropdowns. */
export interface LidarrOptions {
  rootFolders: { id: number; path: string }[];
  qualityProfiles: { id: number; name: string }[];
  metadataProfiles: { id: number; name: string }[];
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export type ServiceStatus =
  | { configured: false }
  | { configured: true; ok: true; detail?: string }
  | { configured: true; ok: false; error: string };

export interface HealthResponse {
  app: "ok";
  plex: ServiceStatus;
  lidarr: ServiceStatus;
}
