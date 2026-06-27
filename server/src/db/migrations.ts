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
  {
    version: 4,
    up: `
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `,
  },
  {
    version: 5,
    // Carry the user's Plex token on the session so the app can act as them.
    up: `ALTER TABLE auth_sessions ADD COLUMN token TEXT;`,
  },
  {
    version: 6,
    // Scheduled auto-playlists (Discover Weekly) + per-definition track history
    // so successive runs don't repeat recent picks.
    up: `
      CREATE TABLE IF NOT EXISTS auto_playlists (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        kind             TEXT NOT NULL,
        mode             TEXT NOT NULL,
        size             INTEGER NOT NULL,
        interval_days    INTEGER NOT NULL,
        enabled          INTEGER NOT NULL,
        plex_playlist_id TEXT,
        last_run_at      INTEGER,
        next_run_at      INTEGER NOT NULL,
        last_status      TEXT,
        created_at       TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auto_playlist_history (
        auto_id  TEXT NOT NULL,
        track_id TEXT NOT NULL,
        used_at  INTEGER NOT NULL,
        PRIMARY KEY (auto_id, track_id)
      );

      CREATE INDEX IF NOT EXISTS idx_aph_auto
        ON auto_playlist_history (auto_id, used_at DESC);
    `,
  },
  {
    version: 7,
    // Per-track thumbs up/down — biases discovery (drop dislikes, favor likes).
    up: `
      CREATE TABLE IF NOT EXISTS feedback (
        track_id   TEXT PRIMARY KEY,
        artist     TEXT NOT NULL,
        title      TEXT,
        rating     TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_feedback_rating ON feedback (rating);
    `,
  },
  {
    version: 8,
    // Opt-in "true new-artist discovery" for scheduled auto-playlists.
    up: `ALTER TABLE auto_playlists ADD COLUMN new_artists_only INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    version: 9,
    // Per-user scoping. Sessions carry the Plex account id so we can tell users
    // apart; auto-playlists record their creator (owner_id) plus the per-server
    // token to build with (owner_token) so the background scheduler can rebuild
    // each one on the right user's Plex account. NULL owner_id = legacy rows
    // created before scoping (treated as the server owner's).
    up: `
      ALTER TABLE auth_sessions ADD COLUMN user_id TEXT;
      ALTER TABLE auto_playlists ADD COLUMN owner_id TEXT;
      ALTER TABLE auto_playlists ADD COLUMN owner_token TEXT;
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
