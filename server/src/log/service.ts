import type { LogEntry, LogLevel } from "@resonarr/shared";
import { getDb } from "../db/database.ts";

/** Keep the activity log bounded — oldest rows are trimmed past this. */
const MAX_ROWS = 1000;

interface LogRow {
  id: number;
  ts: string;
  level: string;
  source: string;
  message: string;
  detail: string | null;
}

function rowToEntry(r: LogRow): LogEntry {
  return {
    id: r.id,
    ts: r.ts,
    level: r.level as LogLevel,
    source: r.source,
    message: r.message,
    detail: r.detail ?? undefined,
  };
}

/**
 * Record an app event to the SQLite activity log and mirror it to stdout
 * (so it also shows up in `docker logs`). Logging never throws — a logging
 * failure must not break the feature it's observing.
 */
export function logEvent(
  level: LogLevel,
  source: string,
  message: string,
  detail?: unknown,
): void {
  const ts = new Date().toISOString();
  const detailJson =
    detail === undefined ? null : safeStringify(detail);

  // Mirror to stdout for `docker logs`.
  const line = `[${source}] ${message}${detailJson ? ` ${detailJson}` : ""}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO event_log (ts, level, source, message, detail)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(ts, level, source, message, detailJson);

    // Trim oldest rows so the table stays bounded.
    db.prepare(
      `DELETE FROM event_log
       WHERE id <= (
         SELECT id FROM event_log ORDER BY id DESC LIMIT 1 OFFSET ?
       )`,
    ).run(MAX_ROWS);
  } catch {
    /* never let logging break the caller */
  }
}

export const log = {
  info: (source: string, message: string, detail?: unknown) =>
    logEvent("info", source, message, detail),
  warn: (source: string, message: string, detail?: unknown) =>
    logEvent("warn", source, message, detail),
  error: (source: string, message: string, detail?: unknown) =>
    logEvent("error", source, message, detail),
};

/** Most recent log entries, newest first. */
export function listEvents(limit = 200): LogEntry[] {
  const capped = Math.max(1, Math.min(limit, MAX_ROWS));
  const rows = getDb()
    .prepare("SELECT * FROM event_log ORDER BY id DESC LIMIT ?")
    .all(capped) as unknown as LogRow[];
  return rows.map(rowToEntry);
}

export function clearEvents(): void {
  getDb().prepare("DELETE FROM event_log").run();
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
