import { randomUUID } from "node:crypto";
import type { SpotifySync, SpotifyTrack } from "@resonarr/shared";
import { getDb } from "../db/database.ts";
import { normalize } from "../matching/match.ts";

export const DAY_MS = 86_400_000;

interface SyncRow {
  id: string;
  name: string;
  source: string;
  plex_playlist_id: string | null;
  enabled: number;
  interval_days: number;
  last_run_at: number | null;
  next_run_at: number;
  last_status: string | null;
  matched_count: number;
  created_at: string;
  owner_id: string | null;
  owner_token: string | null;
}

/** Who a sync belongs to, and the Plex token to write its playlist with. */
export interface SyncOwner {
  ownerId: string | null;
  ownerToken: string | null;
}

/** One Spotify track still waiting to appear in the Plex library. */
export interface PendingTrack {
  trackKey: string;
  title: string;
  artist: string;
  album: string;
}

/** Stable key for a track, so the same song isn't stored twice. */
export function trackKey(artist: string, title: string): string {
  return `${normalize(artist)}|${normalize(title)}`;
}

function rowToItem(r: SyncRow, pendingCount: number): SpotifySync {
  return {
    id: r.id,
    name: r.name,
    source: r.source,
    plexPlaylistId: r.plex_playlist_id ?? undefined,
    enabled: r.enabled === 1,
    intervalDays: r.interval_days,
    lastRunAt: r.last_run_at ?? undefined,
    nextRunAt: r.next_run_at,
    lastStatus: r.last_status ?? undefined,
    pendingCount,
    matchedCount: r.matched_count,
    createdAt: r.created_at,
  };
}

function countPending(syncId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM spotify_sync_pending WHERE sync_id = ?")
    .get(syncId) as { n: number };
  return row.n;
}

const clampInterval = (n: number) => Math.max(1, Math.min(30, Math.round(n)));

export interface CreateSyncInput {
  name: string;
  source: string;
  plexPlaylistId?: string;
  matchedCount: number;
  pending: SpotifyTrack[];
  intervalDays?: number;
}

/** Create a sync and seed its pending list. Due immediately for a first backfill. */
export function createSync(
  input: CreateSyncInput,
  owner: SyncOwner = { ownerId: null, ownerToken: null },
): SpotifySync {
  const now = Date.now();
  const id = randomUUID();
  const db = getDb();
  db.prepare(
    `INSERT INTO spotify_syncs
       (id, name, source, plex_playlist_id, enabled, interval_days, last_run_at,
        next_run_at, last_status, matched_count, created_at, owner_id, owner_token)
     VALUES (?, ?, ?, ?, 1, ?, NULL, ?, NULL, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    input.source,
    input.plexPlaylistId ?? null,
    clampInterval(input.intervalDays ?? 1),
    now,
    input.matchedCount,
    new Date(now).toISOString(),
    owner.ownerId,
    owner.ownerToken,
  );
  addPending(id, input.pending);
  return getSync(id)!;
}

/** Add tracks to a sync's pending list, ignoring ones already tracked. */
export function addPending(syncId: string, tracks: SpotifyTrack[]): void {
  if (tracks.length === 0) return;
  const now = Date.now();
  const insert = getDb().prepare(
    `INSERT INTO spotify_sync_pending (sync_id, track_key, title, artist, album, added_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(sync_id, track_key) DO NOTHING`,
  );
  for (const t of tracks) {
    if (!t.title || !t.artist) continue;
    insert.run(syncId, trackKey(t.artist, t.title), t.title, t.artist, t.album ?? "", now);
  }
}

export function listPending(syncId: string): PendingTrack[] {
  const rows = getDb()
    .prepare(
      "SELECT track_key, title, artist, album FROM spotify_sync_pending WHERE sync_id = ?",
    )
    .all(syncId) as { track_key: string; title: string; artist: string; album: string | null }[];
  return rows.map((r) => ({
    trackKey: r.track_key,
    title: r.title,
    artist: r.artist,
    album: r.album ?? "",
  }));
}

export function removePending(syncId: string, keys: string[]): void {
  if (keys.length === 0) return;
  const del = getDb().prepare(
    "DELETE FROM spotify_sync_pending WHERE sync_id = ? AND track_key = ?",
  );
  for (const k of keys) del.run(syncId, k);
}

export function getSync(id: string): SpotifySync | null {
  const row = getDb()
    .prepare("SELECT * FROM spotify_syncs WHERE id = ?")
    .get(id) as unknown as SyncRow | undefined;
  return row ? rowToItem(row, countPending(id)) : null;
}

export function getSyncOwner(id: string): SyncOwner | null {
  const row = getDb()
    .prepare("SELECT owner_id, owner_token FROM spotify_syncs WHERE id = ?")
    .get(id) as { owner_id: string | null; owner_token: string | null } | undefined;
  if (!row) return null;
  return { ownerId: row.owner_id, ownerToken: row.owner_token };
}

/** Every sync, unscoped — for the scheduler, which runs them all. */
export function listSyncs(): SpotifySync[] {
  const rows = getDb()
    .prepare("SELECT * FROM spotify_syncs ORDER BY created_at DESC")
    .all() as unknown as SyncRow[];
  return rows.map((r) => rowToItem(r, countPending(r.id)));
}

/**
 * Syncs visible to one user: their own, plus legacy (NULL-owner) rows when they
 * are the server owner. `viewerId` null means login is off → show all.
 */
export function listSyncsForViewer(
  viewerId: string | null,
  isOwner: boolean,
): SpotifySync[] {
  if (viewerId === null) return listSyncs();
  const sql = isOwner
    ? "SELECT * FROM spotify_syncs WHERE owner_id = ? OR owner_id IS NULL ORDER BY created_at DESC"
    : "SELECT * FROM spotify_syncs WHERE owner_id = ? ORDER BY created_at DESC";
  const rows = getDb().prepare(sql).all(viewerId) as unknown as SyncRow[];
  return rows.map((r) => rowToItem(r, countPending(r.id)));
}

/** Enable/disable a sync and/or change its re-check cadence. */
export function updateSync(
  id: string,
  patch: { enabled?: boolean; intervalDays?: number },
): SpotifySync | null {
  const cur = getSync(id);
  if (!cur) return null;

  const enabled = patch.enabled ?? cur.enabled;
  const intervalDays =
    patch.intervalDays !== undefined ? clampInterval(patch.intervalDays) : cur.intervalDays;

  // When the cadence changes and the sync has run before, re-anchor the next run
  // to the new interval so it takes effect immediately rather than after one more
  // run at the old cadence.
  let nextRunAt = cur.nextRunAt;
  if (patch.intervalDays !== undefined && cur.lastRunAt) {
    nextRunAt = cur.lastRunAt + intervalDays * DAY_MS;
  }

  getDb()
    .prepare(
      "UPDATE spotify_syncs SET enabled = ?, interval_days = ?, next_run_at = ? WHERE id = ?",
    )
    .run(enabled ? 1 : 0, intervalDays, nextRunAt, id);
  return getSync(id);
}

export function deleteSync(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM spotify_syncs WHERE id = ?").run(id);
  db.prepare("DELETE FROM spotify_sync_pending WHERE sync_id = ?").run(id);
}

/** Persist the outcome of a backfill run. */
export function markSyncRun(
  id: string,
  fields: {
    plexPlaylistId?: string | null;
    lastStatus: string;
    nextRunAt: number;
    addedMatches?: number;
  },
): void {
  getDb()
    .prepare(
      `UPDATE spotify_syncs
         SET plex_playlist_id = COALESCE(?, plex_playlist_id),
             last_run_at = ?, next_run_at = ?, last_status = ?,
             matched_count = matched_count + ?
       WHERE id = ?`,
    )
    .run(
      fields.plexPlaylistId ?? null,
      Date.now(),
      fields.nextRunAt,
      fields.lastStatus,
      fields.addedMatches ?? 0,
      id,
    );
}
