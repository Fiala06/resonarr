import { randomUUID } from "node:crypto";
import type {
  AutoPlaylist,
  AutoPlaylistKind,
  AutoPlaylistMode,
  CreateAutoPlaylistRequest,
  UpdateAutoPlaylistRequest,
} from "@resonarr/shared";
import { getDb } from "../db/database.ts";

interface AutoPlaylistRow {
  id: string;
  name: string;
  kind: string;
  mode: string;
  size: number;
  interval_days: number;
  new_artists_only: number;
  enabled: number;
  plex_playlist_id: string | null;
  last_run_at: number | null;
  next_run_at: number;
  last_status: string | null;
  created_at: string;
  owner_id: string | null;
  owner_token: string | null;
}

/** Who a definition belongs to, and the token to build it with. */
export interface AutoPlaylistOwner {
  /** Plex account id of the creator; null for legacy (server-owner) rows. */
  ownerId: string | null;
  /** Per-server token to act as that user; null = fall back to owner token. */
  ownerToken: string | null;
}

const DEFAULTS = {
  name: "Discover Weekly",
  kind: "discover-weekly" as AutoPlaylistKind,
  mode: "replace" as AutoPlaylistMode,
  size: 30,
  intervalDays: 7,
};

const DAY_MS = 86_400_000;

function rowToItem(r: AutoPlaylistRow): AutoPlaylist {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as AutoPlaylistKind,
    mode: r.mode === "append" ? "append" : "replace",
    size: r.size,
    intervalDays: r.interval_days,
    newArtistsOnly: r.new_artists_only === 1,
    enabled: r.enabled === 1,
    plexPlaylistId: r.plex_playlist_id ?? undefined,
    lastRunAt: r.last_run_at ?? undefined,
    nextRunAt: r.next_run_at,
    lastStatus: r.last_status ?? undefined,
    createdAt: r.created_at,
  };
}

/** Every definition, unscoped — for the scheduler, which runs them all. */
export function listAutoPlaylists(): AutoPlaylist[] {
  const rows = getDb()
    .prepare("SELECT * FROM auto_playlists ORDER BY created_at ASC")
    .all() as unknown as AutoPlaylistRow[];
  return rows.map(rowToItem);
}

/**
 * Definitions visible to one user: their own, plus legacy (NULL-owner) rows when
 * they're the server owner. `viewerId` null means login is off → show all.
 */
export function listAutoPlaylistsForViewer(
  viewerId: string | null,
  isOwner: boolean,
): AutoPlaylist[] {
  if (viewerId === null) return listAutoPlaylists();
  const sql = isOwner
    ? "SELECT * FROM auto_playlists WHERE owner_id = ? OR owner_id IS NULL ORDER BY created_at ASC"
    : "SELECT * FROM auto_playlists WHERE owner_id = ? ORDER BY created_at ASC";
  const rows = getDb().prepare(sql).all(viewerId) as unknown as AutoPlaylistRow[];
  return rows.map(rowToItem);
}

export function getAutoPlaylist(id: string): AutoPlaylist | null {
  const row = getDb()
    .prepare("SELECT * FROM auto_playlists WHERE id = ?")
    .get(id) as unknown as AutoPlaylistRow | undefined;
  return row ? rowToItem(row) : null;
}

/** The owner + build token for a definition (server-internal; never sent out). */
export function getAutoPlaylistOwner(id: string): AutoPlaylistOwner | null {
  const row = getDb()
    .prepare("SELECT owner_id, owner_token FROM auto_playlists WHERE id = ?")
    .get(id) as { owner_id: string | null; owner_token: string | null } | undefined;
  if (!row) return null;
  return { ownerId: row.owner_id, ownerToken: row.owner_token };
}

const clampSize = (n: number) => Math.max(5, Math.min(100, Math.round(n)));
const clampInterval = (n: number) => Math.max(1, Math.min(30, Math.round(n)));

export function createAutoPlaylist(
  input: CreateAutoPlaylistRequest,
  owner: AutoPlaylistOwner = { ownerId: null, ownerToken: null },
): AutoPlaylist {
  const now = Date.now();
  const item: AutoPlaylist = {
    id: randomUUID(),
    name: input.name?.trim() || DEFAULTS.name,
    kind: DEFAULTS.kind,
    mode: input.mode === "append" ? "append" : DEFAULTS.mode,
    size: clampSize(input.size ?? DEFAULTS.size),
    intervalDays: clampInterval(input.intervalDays ?? DEFAULTS.intervalDays),
    newArtistsOnly: input.newArtistsOnly ?? false,
    enabled: true,
    // Due immediately so the first build happens on the next scheduler tick.
    nextRunAt: now,
    createdAt: new Date(now).toISOString(),
  };

  getDb()
    .prepare(
      `INSERT INTO auto_playlists
         (id, name, kind, mode, size, interval_days, new_artists_only, enabled,
          plex_playlist_id, last_run_at, next_run_at, last_status, created_at,
          owner_id, owner_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?, ?)`,
    )
    .run(
      item.id,
      item.name,
      item.kind,
      item.mode,
      item.size,
      item.intervalDays,
      item.newArtistsOnly ? 1 : 0,
      item.enabled ? 1 : 0,
      item.nextRunAt,
      item.createdAt,
      owner.ownerId,
      owner.ownerToken,
    );
  return item;
}

export function updateAutoPlaylist(
  id: string,
  patch: UpdateAutoPlaylistRequest,
): AutoPlaylist | null {
  const cur = getAutoPlaylist(id);
  if (!cur) return null;

  const next: AutoPlaylist = {
    ...cur,
    name: patch.name?.trim() || cur.name,
    mode: patch.mode === "append" || patch.mode === "replace" ? patch.mode : cur.mode,
    size: patch.size !== undefined ? clampSize(patch.size) : cur.size,
    intervalDays:
      patch.intervalDays !== undefined ? clampInterval(patch.intervalDays) : cur.intervalDays,
    newArtistsOnly:
      patch.newArtistsOnly !== undefined ? patch.newArtistsOnly : cur.newArtistsOnly,
    enabled: patch.enabled !== undefined ? patch.enabled : cur.enabled,
  };

  getDb()
    .prepare(
      `UPDATE auto_playlists
         SET name = ?, mode = ?, size = ?, interval_days = ?,
             new_artists_only = ?, enabled = ?
       WHERE id = ?`,
    )
    .run(
      next.name,
      next.mode,
      next.size,
      next.intervalDays,
      next.newArtistsOnly ? 1 : 0,
      next.enabled ? 1 : 0,
      id,
    );
  return getAutoPlaylist(id);
}

export function deleteAutoPlaylist(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM auto_playlists WHERE id = ?").run(id);
  db.prepare("DELETE FROM auto_playlist_history WHERE auto_id = ?").run(id);
}

/** Persist the outcome of a run: playlist id, status, and the next due time. */
export function markRun(
  id: string,
  fields: { plexPlaylistId?: string; lastStatus: string; nextRunAt: number },
): void {
  getDb()
    .prepare(
      `UPDATE auto_playlists
         SET plex_playlist_id = ?, last_run_at = ?, next_run_at = ?, last_status = ?
       WHERE id = ?`,
    )
    .run(
      fields.plexPlaylistId ?? null,
      Date.now(),
      fields.nextRunAt,
      fields.lastStatus,
      id,
    );
}

// --- Per-definition track history (avoid repeating recent picks) -------------

export function recordHistory(autoId: string, trackIds: string[]): void {
  if (trackIds.length === 0) return;
  const db = getDb();
  const now = Date.now();
  const upsert = db.prepare(
    `INSERT INTO auto_playlist_history (auto_id, track_id, used_at)
     VALUES (?, ?, ?)
     ON CONFLICT(auto_id, track_id) DO UPDATE SET used_at = excluded.used_at`,
  );
  for (const tid of trackIds) upsert.run(autoId, tid, now);
}

/** Track ids used by this definition at or after `sinceMs`. */
export function getRecentHistoryIds(autoId: string, sinceMs: number): Set<string> {
  const rows = getDb()
    .prepare(
      "SELECT track_id FROM auto_playlist_history WHERE auto_id = ? AND used_at >= ?",
    )
    .all(autoId, sinceMs) as { track_id: string }[];
  return new Set(rows.map((r) => r.track_id));
}

export function pruneHistory(autoId: string, beforeMs: number): void {
  getDb()
    .prepare("DELETE FROM auto_playlist_history WHERE auto_id = ? AND used_at < ?")
    .run(autoId, beforeMs);
}

export { DAY_MS };
