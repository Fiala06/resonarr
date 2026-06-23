import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config/env.ts";
import { runMigrations } from "./migrations.ts";

/**
 * Single SQLite connection for the process, opened lazily on first use.
 * Uses Node's built-in `node:sqlite` (synchronous, no native npm module),
 * so there is nothing to compile in the Docker image.
 */
let instance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (instance) return instance;

  mkdirSync(config.dataDir, { recursive: true });
  const db = new DatabaseSync(join(config.dataDir, "resonarr.db"));

  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(db);

  instance = db;
  return db;
}
