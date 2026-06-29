import type { PlexClient } from "../plex/client.ts";
import { getDb } from "../db/database.ts";
import { services } from "../services.ts";
import { log } from "../log/service.ts";

/**
 * Unified play history: a persisted archive (imported from Tautulli) merged with
 * Plex's own live history at read time.
 *
 * The merge rule is a deterministic time boundary, so there is no fuzzy
 * timestamp matching and no double-counting:
 *
 *   boundary = newest play we've imported (MAX viewed_at in play_history)
 *   • Plex live  supplies everything *newer* than the boundary (fresh plays)
 *   • the archive supplies everything *at or before* the boundary (years deep)
 *
 * If Tautulli hasn't been imported recently the boundary is just older, and
 * Plex's live tail covers the gap (as long as Plex still retains it). When you
 * re-import, the boundary slides forward automatically.
 */

/** A single play event in resonarr's vocabulary (matches Plex history rows). */
export interface PlayEvent {
  ratingKey: string;
  title: string;
  artist?: string;
  viewedAt: number; // epoch seconds
  accountID?: number;
}

interface PlayHistoryRow {
  track_id: string;
  title: string | null;
  artist: string;
  viewed_at: number;
  account_id: number | null;
}

/** Newest imported play (epoch seconds), or 0 when the archive is empty. */
export function archiveBoundary(): number {
  const row = getDb()
    .prepare("SELECT MAX(viewed_at) AS m FROM play_history")
    .get() as { m: number | null };
  return row.m ?? 0;
}

/** Status for the Settings UI: row count, depth, and last import time. */
export function archiveStatus(): {
  total: number;
  oldest: number | null;
  newest: number | null;
  lastImport: number | null;
} {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              MIN(viewed_at) AS oldest,
              MAX(viewed_at) AS newest,
              MAX(imported_at) AS lastImport
         FROM play_history`,
    )
    .get() as {
    total: number;
    oldest: number | null;
    newest: number | null;
    lastImport: number | null;
  };
  return {
    total: row.total ?? 0,
    oldest: row.oldest,
    newest: row.newest,
    lastImport: row.lastImport,
  };
}

function rowToEvent(r: PlayHistoryRow): PlayEvent {
  return {
    ratingKey: r.track_id,
    title: r.title ?? "",
    artist: r.artist || undefined,
    viewedAt: r.viewed_at,
    accountID: r.account_id ?? undefined,
  };
}

/**
 * Merged play events with `viewedAt >= since`, newest first. Falls back to
 * Plex-only when the archive is empty (Tautulli not imported / not configured).
 *
 * `accountId` (the requesting user's Plex account id, or null when login is off)
 * scopes the archive to that user. The live Plex tail's `accountID` is a
 * server-local id that won't match a plex.tv account id, so we only narrow it
 * when the filter actually hits something — never dropping the user's own
 * brand-new plays. Resolve `accountId` through resolveAccountScope first.
 */
export async function getMergedHistory(
  plex: PlexClient,
  sectionKey: string,
  since: number,
  accountId: number | null,
  plexMax = 5000,
): Promise<PlayEvent[]> {
  const toEvent = (p: {
    ratingKey: string;
    title: string;
    artist?: string;
    viewedAt: number;
    accountID?: number;
  }): PlayEvent => ({
    ratingKey: p.ratingKey,
    title: p.title,
    artist: p.artist,
    viewedAt: p.viewedAt,
    accountID: p.accountID,
  });

  const account = resolveAccountScope(accountId);

  const live = (await plex.getMusicPlayHistory(sectionKey, plexMax)).filter(
    (p) => p.viewedAt >= since,
  );

  const boundary = archiveBoundary();
  if (boundary === 0) return live.map(toEvent);

  let liveTail = live.filter((p) => p.viewedAt > boundary);
  if (account != null) {
    const narrowed = liveTail.filter((p) => p.accountID === account);
    if (narrowed.length > 0) liveTail = narrowed;
  }

  const archive = archiveEventsBetween(since, boundary, account);

  return [...liveTail.map(toEvent), ...archive].sort(
    (a, b) => b.viewedAt - a.viewedAt,
  );
}

/**
 * Resolve a session account id to one we can actually scope by. Tautulli's
 * `user_id` shares the Plex account namespace, so a logged-in user's id normally
 * matches archive rows directly. But if it doesn't (an unexpected id mismatch),
 * scoping every query to it would show an empty app — so we fall back to null
 * ("don't scope") only in that case, after confirming the user has no archive
 * rows at all. Returns null unchanged when login is off.
 */
export function resolveAccountScope(accountId: number | null): number | null {
  if (accountId == null) return null;
  const hit = getDb()
    .prepare("SELECT 1 FROM play_history WHERE account_id = ? LIMIT 1")
    .get(accountId);
  return hit ? accountId : null;
}

/** Archive events in [from, to] (newest first), scoped to `account` if set. */
function archiveEventsBetween(
  from: number,
  to: number,
  account: number | null,
): PlayEvent[] {
  const where =
    account != null
      ? "viewed_at >= ? AND viewed_at <= ? AND account_id = ?"
      : "viewed_at >= ? AND viewed_at <= ?";
  const params = account != null ? [from, to, account] : [from, to];
  return (
    getDb()
      .prepare(
        `SELECT track_id, title, artist, viewed_at, account_id
           FROM play_history
          WHERE ${where}
          ORDER BY viewed_at DESC`,
      )
      .all(...params) as unknown as PlayHistoryRow[]
  ).map(rowToEvent);
}

/**
 * Distinct tracks played in [from, to], ranked by play count (desc), scoped to
 * `account` when set. Used by the Time Machine to surface the most-listened
 * tracks from a past window — the thing Plex's pruned, last-play-only history
 * can't answer. Pass an id already run through resolveAccountScope.
 */
export function archiveTopTracksBetween(
  from: number,
  to: number,
  limit: number,
  account: number | null = null,
): { trackId: string; plays: number }[] {
  const where =
    account != null
      ? "viewed_at >= ? AND viewed_at <= ? AND account_id = ?"
      : "viewed_at >= ? AND viewed_at <= ?";
  const params =
    account != null ? [from, to, account, limit] : [from, to, limit];
  return getDb()
    .prepare(
      `SELECT track_id AS trackId, COUNT(*) AS plays
         FROM play_history
        WHERE ${where}
        GROUP BY track_id
        ORDER BY plays DESC, MAX(viewed_at) DESC
        LIMIT ?`,
    )
    .all(...params) as unknown as { trackId: string; plays: number }[];
}

/**
 * Import play history from Tautulli into the archive. Incremental by default:
 * only pulls plays newer than what we already have. Returns how many new events
 * were stored. Idempotent — re-running imports nothing new.
 */
export async function importFromTautulli(): Promise<{
  imported: number;
  total: number;
}> {
  const tautulli = services.tautulli;
  if (!tautulli) throw new Error("Tautulli is not configured");

  const boundary = archiveBoundary();
  log.info(
    "tautulli",
    boundary === 0
      ? "Starting full Tautulli history import…"
      : `Starting incremental Tautulli import (since ${new Date(
          boundary * 1000,
        ).toISOString()})…`,
  );

  const plays = await tautulli.getMusicHistory({
    after: boundary,
    onProgress: (count) => {
      if (count % 5000 === 0) log.info("tautulli", `Fetched ${count} plays…`);
    },
  });

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const insert = db.prepare(
    `INSERT INTO play_history
       (source, track_id, artist, title, viewed_at, account_id, imported_at)
     VALUES ('tautulli', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source, track_id, viewed_at) DO NOTHING`,
  );

  let imported = 0;
  db.exec("BEGIN");
  try {
    for (const p of plays) {
      const res = insert.run(
        p.trackId,
        p.artist,
        p.title || null,
        p.viewedAt,
        p.accountId ?? null,
        now,
      );
      imported += Number(res.changes);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  const total = archiveStatus().total;
  log.info(
    "tautulli",
    `Tautulli import done: ${imported} new plays (${total} total in archive).`,
  );
  return { imported, total };
}
