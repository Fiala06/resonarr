/**
 * Plex PIN-based authentication (the OAuth-style flow Plex apps use).
 *
 *   1. createPin()      → { id, code }; build an app.plex.tv auth URL from it.
 *   2. user authorizes  on plex.tv in a popup.
 *   3. checkPin(id)     → polls until an authToken comes back.
 *   4. getAccount(token)→ resolves the account's display name.
 *
 * A stable X-Plex-Client-Identifier ties the pin to this Resonarr instance; it
 * is generated once and persisted (see profiles service).
 */

const PLEX_TV = "https://plex.tv";
const TIMEOUT_MS = 15_000;

function headers(clientId: string): Record<string, string> {
  return {
    Accept: "application/json",
    "X-Plex-Product": "Resonarr",
    "X-Plex-Version": "1.0",
    "X-Plex-Client-Identifier": clientId,
  };
}

export interface PlexPin {
  id: number;
  code: string;
}

/** Create a login PIN. `strong` yields a longer, single-use code. */
export async function createPin(clientId: string): Promise<PlexPin> {
  const res = await fetch(new URL("/api/v2/pins?strong=true", PLEX_TV), {
    method: "POST",
    headers: headers(clientId),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Plex pin create failed: ${res.status}`);
  const data = (await res.json()) as { id: number; code: string };
  return { id: data.id, code: data.code };
}

/**
 * Build the URL the user opens to authorize. On success Plex closes the tab;
 * we learn the result by polling checkPin().
 */
export function buildAuthUrl(clientId: string, code: string): string {
  const params = new URLSearchParams({
    clientID: clientId,
    code,
    "context[device][product]": "Resonarr",
  });
  return `https://app.plex.tv/auth#?${params.toString()}`;
}

/** Poll a PIN; returns the authToken once the user authorizes, else null. */
export async function checkPin(
  clientId: string,
  pinId: number,
): Promise<string | null> {
  const res = await fetch(new URL(`/api/v2/pins/${pinId}`, PLEX_TV), {
    headers: headers(clientId),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Plex pin check failed: ${res.status}`);
  const data = (await res.json()) as { authToken: string | null };
  return data.authToken ?? null;
}

/** A Plex account's identity, enough to match it against a Home/friends list. */
export interface PlexAccount {
  name: string;
  id?: string;
  uuid?: string;
  username?: string;
  email?: string;
}

/** Resolve the identity + display name for an account token. */
export async function getAccount(token: string): Promise<PlexAccount> {
  const res = await fetch(new URL("/api/v2/user", PLEX_TV), {
    headers: {
      Accept: "application/json",
      "X-Plex-Token": token,
      "X-Plex-Product": "Resonarr",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Plex account lookup failed: ${res.status}`);
  const data = (await res.json()) as {
    id?: number | string;
    uuid?: string;
    title?: string;
    username?: string;
    friendlyName?: string;
    email?: string;
  };
  return {
    name:
      data.friendlyName ||
      data.title ||
      data.username ||
      data.email ||
      "Plex user",
    id: data.id != null ? String(data.id) : undefined,
    uuid: data.uuid,
    username: data.username,
    email: data.email,
  };
}

/** Resolve just the display name for an account token. */
export async function getAccountName(token: string): Promise<string> {
  return (await getAccount(token)).name;
}

/** A Plex server this account can reach, with the token to act on it as them. */
export interface AccessibleServer {
  /** The server's machine identifier (matches its /identity machineIdentifier). */
  clientId: string;
  /** Per-user, per-server access token — the one that authenticates to it. */
  accessToken: string | null;
}

/**
 * Every Plex server this token can reach, per plex.tv. This is how Plex apps
 * discover shared servers: a shared/Home user's account token authenticates to
 * plex.tv (here) even though it can't hit the owner's LAN server URL directly.
 * Each entry carries the per-server access token to actually use against it.
 * Match an entry's clientId against the owner server's machine id to decide
 * access. Requires a stable X-Plex-Client-Identifier.
 */
export async function getAccessibleServers(
  token: string,
  clientId: string,
): Promise<AccessibleServer[]> {
  const res = await fetch(
    new URL("/api/v2/resources?includeHttps=1", PLEX_TV),
    {
      headers: { ...headers(clientId), "X-Plex-Token": token },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`Plex resources lookup failed: ${res.status}`);
  const data = (await res.json()) as Array<{
    clientIdentifier?: string;
    provides?: string;
    accessToken?: string;
  }>;
  return data
    .filter(
      (r) =>
        Boolean(r.clientIdentifier) &&
        (r.provides ?? "").split(",").includes("server"),
    )
    .map((r) => ({
      clientId: r.clientIdentifier as string,
      accessToken: r.accessToken ?? null,
    }));
}
