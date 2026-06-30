import { randomUUID } from "node:crypto";
import type {
  SpotifyImportJob,
  SpotifyImportJobDetail,
  SpotifyImportJobItem,
  SpotifyImportResult,
} from "@resonarr/shared";
import { getDb } from "../db/database.ts";

interface JobRow {
  id: string;
  created_at: string;
  status: string;
  total: number;
  done: number;
  summary: string;
  results: string | null;
  owner_id: string | null;
}

function rowToJob(r: JobRow): SpotifyImportJob {
  return {
    id: r.id,
    createdAt: r.created_at,
    status: r.status as SpotifyImportJob["status"],
    total: r.total,
    done: r.done,
    items: JSON.parse(r.summary) as SpotifyImportJobItem[],
  };
}

function getRow(id: string): JobRow | undefined {
  return getDb()
    .prepare("SELECT * FROM spotify_import_jobs WHERE id = ?")
    .get(id) as unknown as JobRow | undefined;
}

/** Create a job with one pending item per playlist name. */
export function createImportJob(names: string[], ownerId: string | null): SpotifyImportJob {
  const id = randomUUID();
  const now = Date.now();
  const items: SpotifyImportJobItem[] = names.map((name) => ({
    name,
    status: "pending",
    spotifyTotal: 0,
    matchedCount: 0,
    missCount: 0,
    basketedCount: 0,
  }));
  const results: (SpotifyImportResult | null)[] = names.map(() => null);

  getDb()
    .prepare(
      `INSERT INTO spotify_import_jobs
         (id, created_at, status, total, done, summary, results, owner_id, created_ms)
       VALUES (?, ?, 'running', ?, 0, ?, ?, ?, ?)`,
    )
    .run(
      id,
      new Date(now).toISOString(),
      names.length,
      JSON.stringify(items),
      JSON.stringify(results),
      ownerId,
      now,
    );

  return getImportJob(id)!;
}

/** Patch one item's summary + full result in place. */
function patchItem(
  id: string,
  index: number,
  patch: Partial<SpotifyImportJobItem>,
  result?: SpotifyImportResult | null,
  bumpDone = false,
): void {
  const row = getRow(id);
  if (!row) return;
  const items = JSON.parse(row.summary) as SpotifyImportJobItem[];
  const results = JSON.parse(row.results ?? "[]") as (SpotifyImportResult | null)[];
  const cur = items[index];
  if (cur) items[index] = { ...cur, ...patch };
  if (result !== undefined) results[index] = result;
  const done = bumpDone ? row.done + 1 : row.done;
  getDb()
    .prepare("UPDATE spotify_import_jobs SET summary = ?, results = ?, done = ? WHERE id = ?")
    .run(JSON.stringify(items), JSON.stringify(results), done, id);
}

export function markItemRunning(id: string, index: number): void {
  patchItem(id, index, { status: "running" });
}

export function setItemResult(id: string, index: number, result: SpotifyImportResult): void {
  patchItem(
    id,
    index,
    {
      status: "done",
      spotifyTotal: result.spotifyTotal,
      matchedCount: result.matched.length,
      missCount: result.misses.length,
      basketedCount: result.basketedArtists.length,
      plexPlaylist: result.plexPlaylist,
    },
    result,
    true,
  );
}

export function setItemError(id: string, index: number, message: string): void {
  patchItem(id, index, { status: "error", error: message }, null, true);
}

/** Close out a job: error if any item failed, otherwise done. */
export function finishJob(id: string): void {
  const row = getRow(id);
  if (!row) return;
  const items = JSON.parse(row.summary) as SpotifyImportJobItem[];
  const status = items.some((i) => i.status === "error") ? "error" : "done";
  getDb().prepare("UPDATE spotify_import_jobs SET status = ? WHERE id = ?").run(status, id);
}

export function getImportJob(id: string): SpotifyImportJob | null {
  const row = getRow(id);
  return row ? rowToJob(row) : null;
}

export function getImportJobOwner(id: string): string | null | undefined {
  const row = getDb()
    .prepare("SELECT owner_id FROM spotify_import_jobs WHERE id = ?")
    .get(id) as { owner_id: string | null } | undefined;
  return row ? row.owner_id : undefined;
}

export function getImportJobDetail(id: string): SpotifyImportJobDetail | null {
  const row = getRow(id);
  if (!row) return null;
  return {
    ...rowToJob(row),
    results: JSON.parse(row.results ?? "[]") as (SpotifyImportResult | null)[],
  };
}

/**
 * Jobs visible to one user (own + legacy NULL-owner rows for the owner).
 * `viewerId` null means login is off → show all. Light rows (no result blobs).
 */
export function listImportJobsForViewer(
  viewerId: string | null,
  isOwner: boolean,
  limit = 25,
): SpotifyImportJob[] {
  const db = getDb();
  let rows: JobRow[];
  if (viewerId === null) {
    rows = db
      .prepare("SELECT * FROM spotify_import_jobs ORDER BY created_ms DESC LIMIT ?")
      .all(limit) as unknown as JobRow[];
  } else {
    const sql = isOwner
      ? "SELECT * FROM spotify_import_jobs WHERE owner_id = ? OR owner_id IS NULL ORDER BY created_ms DESC LIMIT ?"
      : "SELECT * FROM spotify_import_jobs WHERE owner_id = ? ORDER BY created_ms DESC LIMIT ?";
    rows = db.prepare(sql).all(viewerId, limit) as unknown as JobRow[];
  }
  return rows.map(rowToJob);
}

export function deleteImportJob(id: string): void {
  getDb().prepare("DELETE FROM spotify_import_jobs WHERE id = ?").run(id);
}

/**
 * On boot, any job still marked 'running' was cut off by a restart. Mark it (and
 * its unfinished items) as errored so the history reflects reality.
 */
export function reconcileRunningJobs(): void {
  const rows = getDb()
    .prepare("SELECT * FROM spotify_import_jobs WHERE status = 'running'")
    .all() as unknown as JobRow[];
  for (const row of rows) {
    const items = JSON.parse(row.summary) as SpotifyImportJobItem[];
    for (const item of items) {
      if (item.status === "pending" || item.status === "running") {
        item.status = "error";
        item.error = "Interrupted by a server restart";
      }
    }
    getDb()
      .prepare("UPDATE spotify_import_jobs SET status = 'error', summary = ? WHERE id = ?")
      .run(JSON.stringify(items), row.id);
  }
}
