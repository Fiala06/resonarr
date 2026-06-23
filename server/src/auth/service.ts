import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { getDb } from "../db/database.ts";
import { config } from "../config/env.ts";
import { PlexClient } from "../plex/client.ts";

/**
 * Session-cookie auth gated on Plex server access. A user proves they belong by
 * authenticating with Plex (PIN flow) and having a token that can read THIS
 * server's library — i.e. anyone the owner has shared the library with. No
 * passwords are stored; sessions are opaque random ids in SQLite.
 */

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
export const SESSION_COOKIE = "resonarr_session";

/** Login is only enforced when opted in AND Plex is configured to verify against. */
export function authEnabled(): boolean {
  return Boolean(config.authPlex && config.plex);
}

/** True if the token can read the owner's Plex server library (= has access). */
export async function verifyServerAccess(token: string): Promise<boolean> {
  if (!config.plex) return false;
  try {
    const res = await fetch(new URL("/library/sections", config.plex.url), {
      headers: { Accept: "application/json", "X-Plex-Token": token },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function createSession(name: string, token: string): string {
  const id = randomBytes(32).toString("hex");
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO auth_sessions (id, name, token, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, name, token, new Date(now).toISOString(), now + SESSION_TTL_MS);
  return id;
}

export interface Session {
  name: string;
  /** The user's Plex token (may be null for legacy sessions). */
  token: string | null;
}

export function getSession(id: string | undefined): Session | null {
  if (!id) return null;
  const row = getDb()
    .prepare("SELECT name, token, expires_at FROM auth_sessions WHERE id = ?")
    .get(id) as
    | { name: string; token: string | null; expires_at: number }
    | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    deleteSession(id);
    return null;
  }
  return { name: row.name, token: row.token };
}

export function deleteSession(id: string): void {
  getDb().prepare("DELETE FROM auth_sessions WHERE id = ?").run(id);
}

/** Read one cookie value from a Cookie header. */
export function parseCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

export function sessionCookie(id: string, secure: boolean): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return (
    `${SESSION_COOKIE}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}` +
    (secure ? "; Secure" : "")
  );
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
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

/**
 * Plex client for the request's user. When login is enabled and the request has
 * a session, it uses that user's token (so the app acts as whoever is signed
 * in); otherwise it falls back to the owner's configured token.
 */
export function userPlexClient(req: FastifyRequest): PlexClient {
  if (!config.plex) throw new Error("Plex is not configured");
  let token = config.plex.token;
  if (authEnabled()) {
    const sess = getSession(parseCookie(req.headers.cookie, SESSION_COOKIE));
    if (sess?.token) token = sess.token;
  }
  return new PlexClient({ url: config.plex.url, token });
}
