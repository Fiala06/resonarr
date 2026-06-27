import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { getDb } from "../db/database.ts";
import { config } from "../config/env.ts";
import { PlexClient } from "../plex/client.ts";
import { getAccessibleServers } from "../plex/auth.ts";
import { log } from "../log/service.ts";

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

/**
 * Decide whether an account (identified by its Plex account token) may use this
 * Resonarr instance, and return the token to act AS that user against the Plex
 * server. Returns null when the account has no access.
 *
 * Two paths, because a plain account token behaves differently for the owner vs
 * shared users:
 *   1. The owner's token can read the server's library over its (LAN) URL
 *      directly — fast path, store the account token as-is.
 *   2. A shared / Plex Home user's account token can NOT authenticate to that
 *      LAN URL directly even when they have full library access. We ask plex.tv
 *      which servers their token can reach, match our machine id, and store the
 *      per-server access token plex.tv hands back — that's the token that
 *      actually works against the server for them.
 */
export async function resolveServerAccess(
  accountToken: string,
): Promise<{ token: string } | null> {
  if (!config.plex) return null;

  // Owner / direct-access path: account token already reads the library.
  if (await canReadLibrary(accountToken)) return { token: accountToken };

  const machineId = await getServerMachineId();
  if (!machineId) {
    log.warn(
      "auth",
      "Access check: could not resolve this server's machine identifier",
    );
    return null;
  }

  try {
    const servers = await getAccessibleServers(accountToken, getClientId());
    const match = servers.find((s) => s.clientId === machineId);
    if (match) return { token: match.accessToken ?? accountToken };
    log.warn(
      "auth",
      "Login denied: account has no access to this Plex server (not the owner, and plex.tv lists no matching shared server)",
    );
  } catch (err) {
    log.warn(
      "auth",
      `Access check (plex.tv) errored: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return null;
}

/** Fast path: can this token read the server's library over its direct URL? */
async function canReadLibrary(token: string): Promise<boolean> {
  if (!config.plex) return false;
  try {
    const res = await fetch(new URL("/library/sections", config.plex.url), {
      headers: { Accept: "application/json", "X-Plex-Token": token },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch (err) {
    log.warn(
      "auth",
      `Library reachability check errored: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/** This server's Plex machine identifier (used to match plex.tv resources). */
async function getServerMachineId(): Promise<string | null> {
  if (!config.plex) return null;
  try {
    const res = await fetch(new URL("/identity", config.plex.url), {
      headers: { Accept: "application/json", "X-Plex-Token": config.plex.token },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      MediaContainer?: { machineIdentifier?: string };
    };
    return data.MediaContainer?.machineIdentifier ?? null;
  } catch {
    return null;
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
