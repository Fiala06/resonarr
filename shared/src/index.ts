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
  /** Lifetime play count from Plex (when the feature needs it). */
  viewCount?: number;
  /** Epoch seconds of the last play, from Plex `lastViewedAt` (when known). */
  lastPlayedAt?: number;
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

/**
 * Deep cuts & rediscovery: owned tracks you rarely or never play.
 *  - "never" — buried treasure you've never pressed play on.
 *  - "faded" — proven favorites you played a lot but have drifted from.
 */
export type DeepCutsMode = "never" | "faded";

export interface DeepCutsResponse {
  mode: DeepCutsMode;
  /** Tracks carry viewCount / lastPlayedAt so the UI can explain each pick. */
  tracks: Track[];
}

/**
 * Artist-level discovery: "artists like the ones you love that you don't own
 * yet." Seeded from your most-played artists, expanded by the LLM, and every
 * candidate validated against Lidarr so only real, requestable artists show up.
 */
export interface ArtistCandidate {
  /** Artist name as resolved by Lidarr's MusicBrainz lookup. */
  artist: string;
  /** MusicBrainz artist id (proves it is real and requestable). */
  mbid: string;
  /** Lidarr disambiguation, when present (e.g. "US indie band"). */
  disambiguation?: string;
  /** One-line LLM rationale tying it back to your taste. */
  reason?: string;
}

export interface ArtistDiscoveryResponse {
  /** The most-played owned artists the suggestions were seeded from. */
  seeds: string[];
  candidates: ArtistCandidate[];
}

/**
 * Scheduled auto-playlists — a "Discover Weekly" equivalent that refreshes on a
 * cadence. v1 has one kind (discover-weekly): seeds from recent listening,
 * expands by sonic similarity, biases toward newly-added + not-recently-played
 * tracks, and avoids repeats from recent runs.
 */
export type AutoPlaylistKind = "discover-weekly";

/** replace = fresh set each run (like Discover Weekly); append = keep growing one list. */
export type AutoPlaylistMode = "replace" | "append";

export interface AutoPlaylist {
  id: string;
  name: string;
  kind: AutoPlaylistKind;
  mode: AutoPlaylistMode;
  /** Target track count. */
  size: number;
  /** Refresh cadence in days. */
  intervalDays: number;
  enabled: boolean;
  /** Plex playlist id, once it has been built at least once. */
  plexPlaylistId?: string;
  /** Epoch ms of the last run, if any. */
  lastRunAt?: number;
  /** Epoch ms the next scheduled run is due. */
  nextRunAt: number;
  /** Short human-readable result of the last run. */
  lastStatus?: string;
  createdAt: string;
}

export interface CreateAutoPlaylistRequest {
  name?: string;
  mode?: AutoPlaylistMode;
  size?: number;
  intervalDays?: number;
}

export interface UpdateAutoPlaylistRequest {
  name?: string;
  mode?: AutoPlaylistMode;
  size?: number;
  intervalDays?: number;
  enabled?: boolean;
}

/**
 * Taste profile ("Resonarr Wrapped"): the LLM reads your most-played artists +
 * library shape and writes a plain-language portrait of your sound.
 */
export interface TopArtistPlays {
  artist: string;
  plays: number;
}

export interface TasteProfile {
  /** One-line "your sound" headline. */
  soundline: string;
  /** A short plain-language paragraph. */
  summary: string;
  /** Dominant genres, most-defining first. */
  genres: string[];
  /** Eras/decades that define the taste (e.g. "1990s"). */
  eras: string[];
  /** Mood/vibe words (e.g. "nostalgic", "anthemic"). */
  vibes: string[];
  /** The top artists (with play counts) the profile was built from. */
  topArtists: TopArtistPlays[];
  /** Library size, for flavor. */
  stats: LibraryStats;
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
// Auth (Plex login)
// ---------------------------------------------------------------------------

/** Start of a Plex PIN login: open authUrl, then poll with pinId. */
export interface PlexPinStart {
  pinId: string;
  authUrl: string;
}

/** The signed-in user, if any. */
export interface AuthUser {
  name: string;
}

/** Whether login is enforced, and who (if anyone) is currently signed in. */
export interface AuthStatus {
  authRequired: boolean;
  user?: AuthUser;
}

/** Poll result for a login PIN. */
export interface AuthLoginStatus {
  pending: boolean;
  user?: AuthUser;
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

export type BasketItemSource = "sonic-sage" | "artist-discovery" | "manual";

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
