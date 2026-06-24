import { createHash, randomBytes } from "node:crypto";
import { config } from "../config/env.ts";

/**
 * Spotify OAuth2 with PKCE. State and tokens are held in memory — they're
 * short-lived and don't need to survive a server restart.
 */

interface PkceState {
  codeVerifier: string;
  redirectUri: string;
  expiresAt: number;
}

export interface SpotifyToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  userId: string;
  userName: string;
}

// state UUID → pkce data (expires after 10 minutes)
const pendingStates = new Map<string, PkceState>();

// session id → token (survives until logout or server restart)
const activeSessions = new Map<string, SpotifyToken>();

export const SPOTIFY_SESSION_COOKIE = "resonarr_spotify";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

const SCOPES = [
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function buildAuthUrl(redirectUri: string): {
  authUrl: string;
  state: string;
} {
  if (!config.spotify) throw new Error("Spotify is not configured");

  const codeVerifier = b64url(randomBytes(96));
  const codeChallenge = b64url(
    createHash("sha256").update(codeVerifier).digest(),
  );
  const state = b64url(randomBytes(16));

  pendingStates.set(state, {
    codeVerifier,
    redirectUri,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    client_id: config.spotify.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  });

  return { authUrl: `https://accounts.spotify.com/authorize?${params}`, state };
}

export async function exchangeCode(
  code: string,
  state: string,
): Promise<string> {
  if (!config.spotify) throw new Error("Spotify is not configured");

  const pkce = pendingStates.get(state);
  if (!pkce) throw new Error("Invalid or expired OAuth state — please try again");
  if (Date.now() > pkce.expiresAt) {
    pendingStates.delete(state);
    throw new Error("OAuth state expired — please try again");
  }
  pendingStates.delete(state);

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: pkce.redirectUri,
      client_id: config.spotify.clientId,
      code_verifier: pkce.codeVerifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify token exchange failed: ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Fetch the user's profile to attach a name to the session.
  const meRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${data.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  const me = (await meRes.json()) as { id: string; display_name?: string };

  const sessionId = b64url(randomBytes(24));
  activeSessions.set(sessionId, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    userId: me.id,
    userName: me.display_name ?? me.id,
  });

  return sessionId;
}

export async function getValidToken(
  sessionId: string | undefined,
): Promise<SpotifyToken | null> {
  if (!sessionId) return null;
  const token = activeSessions.get(sessionId);
  if (!token) return null;

  // Still valid for more than 5 minutes — use as-is.
  if (Date.now() < token.expiresAt - 5 * 60 * 1000) return token;

  // Attempt a refresh.
  if (!config.spotify) return null;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
        client_id: config.spotify.clientId,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return token; // use stale; caller will get a 401 from Spotify
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    const refreshed: SpotifyToken = {
      ...token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? token.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    activeSessions.set(sessionId, refreshed);
    return refreshed;
  } catch {
    return token;
  }
}

export function clearSession(sessionId: string): void {
  activeSessions.delete(sessionId);
}

export function spotifySessionCookie(id: string, secure: boolean): string {
  return (
    `${SPOTIFY_SESSION_COOKIE}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}` +
    (secure ? "; Secure" : "")
  );
}

export function clearSpotifySessionCookie(): string {
  return `${SPOTIFY_SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}
