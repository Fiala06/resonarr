import type { FeedbackItem, FeedbackRating, SetFeedbackRequest, Track } from "@resonarr/shared";
import { getDb } from "../db/database.ts";
import { normalize } from "../matching/match.ts";

interface FeedbackRow {
  track_id: string;
  artist: string;
  title: string | null;
  rating: string;
  created_at: string;
}

function rowToItem(r: FeedbackRow): FeedbackItem {
  return {
    trackId: r.track_id,
    artist: r.artist,
    title: r.title ?? undefined,
    rating: r.rating === "up" ? "up" : "down",
  };
}

export function listFeedback(): FeedbackItem[] {
  const rows = getDb()
    .prepare("SELECT * FROM feedback ORDER BY created_at DESC")
    .all() as unknown as FeedbackRow[];
  return rows.map(rowToItem);
}

/** Set or clear a track's rating. Returns the full list for the client to resync. */
export function setFeedback(req: SetFeedbackRequest): FeedbackItem[] {
  const db = getDb();
  if (req.rating === null) {
    db.prepare("DELETE FROM feedback WHERE track_id = ?").run(req.trackId);
  } else {
    db.prepare(
      `INSERT INTO feedback (track_id, artist, title, rating, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(track_id) DO UPDATE SET
         rating = excluded.rating, artist = excluded.artist, title = excluded.title`,
    ).run(
      req.trackId,
      req.artist,
      req.title ?? null,
      req.rating,
      new Date().toISOString(),
    );
  }
  return listFeedback();
}

interface FeedbackSets {
  dislikedTracks: Set<string>;
  dislikedArtists: Set<string>; // normalized
  likedArtists: Set<string>; // normalized
}

/** Current feedback collapsed into lookup sets for filtering/biasing. */
export function getFeedbackSets(): FeedbackSets {
  const rows = getDb()
    .prepare("SELECT track_id, artist, rating FROM feedback")
    .all() as { track_id: string; artist: string; rating: string }[];

  const sets: FeedbackSets = {
    dislikedTracks: new Set(),
    dislikedArtists: new Set(),
    likedArtists: new Set(),
  };
  for (const r of rows) {
    if (r.rating === "down") {
      sets.dislikedTracks.add(r.track_id);
      sets.dislikedArtists.add(normalize(r.artist));
    } else {
      sets.likedArtists.add(normalize(r.artist));
    }
  }
  return sets;
}

/**
 * Drop tracks the user has thumbed down — by track id, and by artist (so a
 * disliked artist stops surfacing entirely). Used by every sonic-discovery
 * feature so feedback shapes what comes back.
 */
export function filterDisliked(tracks: Track[]): Track[] {
  const { dislikedTracks, dislikedArtists } = getFeedbackSets();
  if (dislikedTracks.size === 0 && dislikedArtists.size === 0) return tracks;
  return tracks.filter(
    (t) => !dislikedTracks.has(t.id) && !dislikedArtists.has(normalize(t.artist)),
  );
}

/** Liked / disliked artist names (original casing) for LLM prompt hints. */
export function getFeedbackArtists(): { liked: string[]; disliked: string[] } {
  const rows = getDb()
    .prepare("SELECT DISTINCT artist, rating FROM feedback")
    .all() as { artist: string; rating: string }[];
  const liked: string[] = [];
  const disliked: string[] = [];
  for (const r of rows) {
    (r.rating === "down" ? disliked : liked).push(r.artist);
  }
  return { liked, disliked };
}

export type { FeedbackRating };
