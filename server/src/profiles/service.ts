import { randomUUID } from "node:crypto";
import type { UserProfile } from "@resonarr/shared";
import { getDb } from "../db/database.ts";
import { config } from "../config/env.ts";
import { log } from "../log/service.ts";
import { PlexClient } from "../plex/client.ts";
import { getAccountName } from "../plex/auth.ts";
import { getSettings, updateSettings } from "../settings/service.ts";

export const OWNER_ID = "owner";

interface ProfileRow {
  id: string;
  name: string;
  token: string;
  created_at: string;
}

/** A stable X-Plex-Client-Identifier for this instance, generated once. */
export function getClientId(): string {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM settings WHERE key = '_plexClientId'")
    .get() as { value: string } | undefined;
  if (row) return JSON.parse(row.value) as string;

  const id = randomUUID();
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('_plexClientId', ?)",
  ).run(JSON.stringify(id));
  return id;
}

function ownerProfile(active: boolean): UserProfile {
  return { id: OWNER_ID, name: "Owner (you)", isOwner: true, active };
}

/** All profiles: the synthetic owner first, then connected Plex users. */
export function listProfiles(): UserProfile[] {
  const activeId = getSettings().activeProfileId || OWNER_ID;
  const rows = getDb()
    .prepare("SELECT id, name FROM profiles ORDER BY created_at ASC")
    .all() as Pick<ProfileRow, "id" | "name">[];

  return [
    ownerProfile(activeId === OWNER_ID),
    ...rows.map((r) => ({
      id: r.id,
      name: r.name,
      isOwner: false,
      active: r.id === activeId,
    })),
  ];
}

/** Connect a Plex account by token; dedupes on token. Returns the profile. */
export async function addProfileFromToken(token: string): Promise<UserProfile> {
  const db = getDb();
  const existing = db
    .prepare("SELECT id, name FROM profiles WHERE token = ?")
    .get(token) as Pick<ProfileRow, "id" | "name"> | undefined;
  if (existing) {
    return { id: existing.id, name: existing.name, isOwner: false, active: false };
  }

  const name = await getAccountName(token);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO profiles (id, name, token, created_at) VALUES (?, ?, ?, ?)`,
  ).run(id, name, token, new Date().toISOString());

  log.info("profiles", `Connected Plex user "${name}"`);
  return { id, name, isOwner: false, active: false };
}

export function removeProfile(id: string): void {
  if (id === OWNER_ID) return;
  getDb().prepare("DELETE FROM profiles WHERE id = ?").run(id);
  // If the removed profile was active, fall back to the owner.
  if (getSettings().activeProfileId === id) {
    updateSettings({ activeProfileId: OWNER_ID });
  }
  log.info("profiles", `Removed profile ${id}`);
}

/** Set the active profile (owner or a connected user). */
export function setActiveProfile(id: string): UserProfile[] {
  const valid =
    id === OWNER_ID ||
    Boolean(
      getDb().prepare("SELECT 1 FROM profiles WHERE id = ?").get(id),
    );
  if (!valid) throw new Error("Unknown profile");
  updateSettings({ activeProfileId: id });
  const active = listProfiles().find((p) => p.active);
  log.info("profiles", `Switched to "${active?.name ?? id}"`);
  return listProfiles();
}

/** Plex token for the active profile (owner = the server's env token). */
export function getActiveToken(): string | undefined {
  const id = getSettings().activeProfileId || OWNER_ID;
  if (id === OWNER_ID) return config.plex?.token;
  const row = getDb()
    .prepare("SELECT token FROM profiles WHERE id = ?")
    .get(id) as { token: string } | undefined;
  return row?.token ?? config.plex?.token;
}

/**
 * A Plex client bound to the active profile's token — for user-scoped reads
 * and writes (their playlists, their history, saving to their account). Library
 * content reads can keep using the shared owner client.
 */
export function getActivePlexClient(): PlexClient {
  if (!config.plex) throw new Error("Plex is not configured");
  const token = getActiveToken() ?? config.plex.token;
  return new PlexClient({ url: config.plex.url, token });
}
