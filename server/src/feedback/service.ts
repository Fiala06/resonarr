import type { FastifyRequest } from "fastify";
import type {
  FeedbackItem,
  FeedbackRating,
  ImportRatingsResult,
  SetFeedbackRequest,
  Track,
} from "@resonarr/shared";
import { getDb } from "../db/database.ts";
import { normalize } from "../matching/match.ts";
import { currentUserId, ownerAccountId } from "../auth/service.ts";

interface FeedbackRow {
  user_id: string;
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

// --- Per-user keying ---------------------------------------------------------
//
// Feedback is scoped to the rater's Plex account id. The empty string is the
// single-user / owner-legacy bucket: when login is off everyone shares it, and
// pre-scoping rows landed there in migration v11. The first time the owner is
// identified we reassign that legacy bucket to them so their history follows.

let ownerLegacyClaimed = false;

async function claimLegacyForOwner(userId: string): Promise<void> {
  if (ownerLegacyClaimed) return;
  if (userId !== (await ownerAccountId())) return;
  getDb()
    .prepare("UPDATE feedback SET user_id = ? WHERE user_id = ''")
    .run(userId);
  ownerLegacyClaimed = true;
}

/** The feedback bucket for a request: the signed-in user's id, or '' if login is off. */
export async function feedbackKeyForRequest(
  req: FastifyRequest,
): Promise<string> {
  const id = await currentUserId(req);
  if (!id) return "";
  await claimLegacyForOwner(id);
  return id;
}

/** The feedback bucket for a background owner id (e.g. the auto-playlist runner). */
export async function feedbackKeyForOwner(
  ownerId: string | null,
): Promise<string> {
  if (!ownerId) return "";
  await claimLegacyForOwner(ownerId);
  return ownerId;
}

// --- Reads / writes (all scoped to a user key) -------------------------------

export function listFeedback(userKey: string): FeedbackItem[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM feedback WHERE user_id = ? ORDER BY created_at DESC",
    )
    .all(userKey) as unknown as FeedbackRow[];
  return rows.map(rowToItem);
}

/** Set or clear one track's rating for a user. Returns their full list to resync. */
export function setFeedback(
  userKey: string,
  req: SetFeedbackRequest,
): FeedbackItem[] {
  const db = getDb();
  if (req.rating === null) {
    db.prepare(
      "DELETE FROM feedback WHERE user_id = ? AND track_id = ?",
    ).run(userKey, req.trackId);
  } else {
    db.prepare(
      `INSERT INTO feedback (user_id, track_id, artist, title, rating, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, track_id) DO UPDATE SET
         rating = excluded.rating, artist = excluded.artist, title = excluded.title`,
    ).run(
      userKey,
      req.trackId,
      req.artist,
      req.title ?? null,
      req.rating,
      new Date().toISOString(),
    );
  }
  return listFeedback(userKey);
}

interface FeedbackSets {
  dislikedTracks: Set<string>;
  dislikedArtists: Set<string>; // normalized
  likedArtists: Set<string>; // normalized
}

/** One user's feedback collapsed into lookup sets for filtering/biasing. */
export function getFeedbackSets(userKey: string): FeedbackSets {
  const rows = getDb()
    .prepare("SELECT track_id, artist, rating FROM feedback WHERE user_id = ?")
    .all(userKey) as { track_id: string; artist: string; rating: string }[];

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
 * Drop tracks this user has thumbed down — by track id, and by artist (so a
 * disliked artist stops surfacing entirely). Used by every sonic-discovery
 * feature so feedback shapes what comes back.
 */
export function filterDisliked(userKey: string, tracks: Track[]): Track[] {
  const { dislikedTracks, dislikedArtists } = getFeedbackSets(userKey);
  if (dislikedTracks.size === 0 && dislikedArtists.size === 0) return tracks;
  return tracks.filter(
    (t) => !dislikedTracks.has(t.id) && !dislikedArtists.has(normalize(t.artist)),
  );
}

/** A user's liked / disliked artist names (original casing) for LLM prompt hints. */
export function getFeedbackArtists(userKey: string): {
  liked: string[];
  disliked: string[];
} {
  const rows = getDb()
    .prepare(
      "SELECT DISTINCT artist, rating FROM feedback WHERE user_id = ?",
    )
    .all(userKey) as { artist: string; rating: string }[];
  const liked: string[] = [];
  const disliked: string[] = [];
  for (const r of rows) {
    (r.rating === "down" ? disliked : liked).push(r.artist);
  }
  return { liked, disliked };
}

/**
 * Bulk-import a user's Plex star ratings into their feedback. 4–5★ → 👍,
 * 1–2★ → 👎, ~3★ left neutral. Existing rows are overwritten (upsert).
 */
export function importRatings(
  userKey: string,
  rated: { track: Track; userRating: number }[],
): ImportRatingsResult {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO feedback (user_id, track_id, artist, title, rating, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, track_id) DO UPDATE SET
       rating = excluded.rating, artist = excluded.artist, title = excluded.title`,
  );
  const now = new Date().toISOString();
  let up = 0;
  let down = 0;
  let skipped = 0;

  db.exec("BEGIN");
  try {
    for (const { track, userRating } of rated) {
      // userRating is 0-10; 7+ ≈ 3.5★+, 4- ≈ 2★-. The middle is left neutral.
      const rating: FeedbackRating | null =
        userRating >= 7 ? "up" : userRating <= 4 ? "down" : null;
      if (!rating) {
        skipped += 1;
        continue;
      }
      stmt.run(userKey, track.id, track.artist, track.title ?? null, rating, now);
      if (rating === "up") up += 1;
      else down += 1;
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { imported: up + down, up, down, skipped };
}

export type { FeedbackRating };
