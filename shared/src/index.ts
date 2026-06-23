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

export interface AdventureRequest {
  startTrackId: string;
  endTrackId: string;
  /** Desired number of steps in the path. */
  length?: number;
}

export interface SageRequest {
  prompt: string;
  /** Bias recommendations toward artists already owned. */
  ownArtistBias?: boolean;
}

/** Result of any discovery run: owned matches plus unowned misses. */
export interface DiscoveryResult {
  /** Owned tracks — these can form a playlist. */
  matches: Track[];
  /** Suggested-but-unowned items destined for the request basket. */
  misses: Suggestion[];
}

// ---------------------------------------------------------------------------
// Request basket / Lidarr
// ---------------------------------------------------------------------------

export type BasketItemType = "artist" | "album";
export type BasketItemStatus = "pending" | "requested" | "failed";

export interface BasketItem {
  id: string;
  type: BasketItemType;
  artist: string;
  album?: string;
  /** MusicBrainz id resolved via Lidarr lookup (proves it is real). */
  mbid?: string;
  source: "sonic-sage" | "manual";
  status: BasketItemStatus;
  createdAt: string;
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
