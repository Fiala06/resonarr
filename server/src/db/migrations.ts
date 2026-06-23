import type { DatabaseSync } from "node:sqlite";

/**
 * Forward-only schema migrations, tracked via SQLite's `user_version` pragma.
 * Each migration runs once, in order, inside a transaction.
 */
interface Migration {
  version: number;
  up: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS basket_items (
        id         TEXT PRIMARY KEY,
        type       TEXT NOT NULL,
        artist     TEXT NOT NULL,
        album      TEXT,
        mbid       TEXT,
        source     TEXT NOT NULL,
        status     TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id          TEXT PRIMARY KEY,
        feature     TEXT NOT NULL,
        params      TEXT NOT NULL,
        playlist_id TEXT,
        created_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sonic_cache (
        cache_key  TEXT PRIMARY KEY,
        payload    TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `,
  },
  {
    version: 2,
    up: `
      CREATE TABLE IF NOT EXISTS event_log (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        ts      TEXT NOT NULL,
        level   TEXT NOT NULL,
        source  TEXT NOT NULL,
        message TEXT NOT NULL,
        detail  TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_event_log_id ON event_log (id DESC);
    `,
  },
  {
    version: 3,
    up: `
      CREATE TABLE IF NOT EXISTS profiles (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        token      TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
  },
];

export function runMigrations(db: DatabaseSync): void {
  const row = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  let current = row.user_version;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.exec("BEGIN");
    try {
      db.exec(migration.up);
      // PRAGMA can't be parameterized; version is a trusted integer literal.
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec("COMMIT");
      current = migration.version;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
