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
  {
    version: 10,
    // Auto-playlists are now listed filtered by creator, so index that column.
    up: `CREATE INDEX IF NOT EXISTS idx_auto_playlists_owner ON auto_playlists (owner_id);`,
  },
  {
    version: 11,
    // Per-user feedback: re-key by (user_id, track_id) so each person's
    // likes/dislikes are their own. Existing global rows become user_id = ''
    // (the single-user / owner-legacy bucket, claimed by the owner on first use).
    up: `
      CREATE TABLE feedback_v11 (
        user_id    TEXT NOT NULL DEFAULT '',
        track_id   TEXT NOT NULL,
        artist     TEXT NOT NULL,
        title      TEXT,
        rating     TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, track_id)
      );
      INSERT INTO feedback_v11 (user_id, track_id, artist, title, rating, created_at)
        SELECT '', track_id, artist, title, rating, created_at FROM feedback;
      DROP TABLE feedback;
      ALTER TABLE feedback_v11 RENAME TO feedback;
      CREATE INDEX idx_feedback_rating ON feedback (rating);
      CREATE INDEX idx_feedback_user ON feedback (user_id);
    `,
  },
  {
    version: 12,
    // Ongoing Spotify→Plex migrations. A sync owns a Plex playlist plus the set
    // of Spotify tracks that had no Plex match yet ("pending"). The scheduler
    // re-matches pending tracks as the library grows and appends new finds to the
    // playlist — so a migrated playlist keeps filling in as music arrives in Plex.
    up: `
      CREATE TABLE IF NOT EXISTS spotify_syncs (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        source           TEXT NOT NULL,
        plex_playlist_id TEXT,
        enabled          INTEGER NOT NULL DEFAULT 1,
        interval_days    INTEGER NOT NULL DEFAULT 1,
        last_run_at      INTEGER,
        next_run_at      INTEGER NOT NULL,
        last_status      TEXT,
        matched_count    INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT NOT NULL,
        owner_id         TEXT,
        owner_token      TEXT
      );

      CREATE TABLE IF NOT EXISTS spotify_sync_pending (
        sync_id   TEXT NOT NULL,
        track_key TEXT NOT NULL,
        title     TEXT NOT NULL,
        artist    TEXT NOT NULL,
        album     TEXT,
        added_at  INTEGER NOT NULL,
        PRIMARY KEY (sync_id, track_key)
      );

      CREATE INDEX IF NOT EXISTS idx_spotify_sync_pending ON spotify_sync_pending (sync_id);
      CREATE INDEX IF NOT EXISTS idx_spotify_syncs_owner ON spotify_syncs (owner_id);
    `,
  },
  {
    version: 13,
    // Cache a public artwork URL (from Lidarr metadata) per wishlist item so
    // rows show real cover art instead of a blank tint.
    up: `ALTER TABLE basket_items ADD COLUMN cover_url TEXT;`,
  },
  {
    version: 14,
    // Persisted play-history archive (currently sourced from Tautulli). Plex's
    // own history is short-lived and gets pruned; Tautulli often has years of
    // it. We store events here once and merge them with Plex's live tail at read
    // time. The composite PK makes re-imports idempotent (same play = same row).
    up: `
      CREATE TABLE IF NOT EXISTS play_history (
        source      TEXT    NOT NULL,           -- 'tautulli'
        track_id    TEXT    NOT NULL,           -- Plex ratingKey
        artist      TEXT    NOT NULL DEFAULT '',
        title       TEXT,
        viewed_at   INTEGER NOT NULL,           -- epoch seconds of the play
        account_id  INTEGER,                    -- Plex account that played it
        imported_at INTEGER NOT NULL,           -- epoch seconds we stored it
        PRIMARY KEY (source, track_id, viewed_at)
      );

      CREATE INDEX IF NOT EXISTS idx_play_history_viewed_at ON play_history (viewed_at);
      CREATE INDEX IF NOT EXISTS idx_play_history_account   ON play_history (account_id);
    `,
  },
  {
    version: 15,
    // Spotify file imports now run server-side as a detached job so closing the
    // browser can't interrupt them. Each job covers one or more playlists and is
    // kept as history. `summary` holds the light per-playlist counts; `results`
    // holds the full matched/miss track lists for re-viewing a past import.
    up: `
      CREATE TABLE IF NOT EXISTS spotify_import_jobs (
        id          TEXT PRIMARY KEY,
        created_at  TEXT NOT NULL,
        status      TEXT NOT NULL,        -- 'running' | 'done' | 'error'
        total       INTEGER NOT NULL,
        done        INTEGER NOT NULL DEFAULT 0,
        summary     TEXT NOT NULL,        -- JSON: SpotifyImportJobItem[]
        results     TEXT,                 -- JSON: (SpotifyImportResult | null)[]
        owner_id    TEXT,
        created_ms  INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_spotify_import_jobs_owner
        ON spotify_import_jobs (owner_id, created_ms DESC);
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
