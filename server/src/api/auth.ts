import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuthLoginStatus, AuthStatus, PlexPinStart } from "@resonarr/shared";
import { buildAuthUrl, checkPin, createPin, getAccount } from "../plex/auth.ts";
import { log } from "../log/service.ts";
import { rateLimit } from "../util/ratelimit.ts";
import {
  authEnabled,
  clearSessionCookie,
  createSession,
  deleteSession,
  getClientId,
  getSession,
  parseCookie,
  resolveServerAccess,
  sessionCookie,
  SESSION_COOKIE,
} from "../auth/service.ts";

function isHttps(req: FastifyRequest): boolean {
  return (
    req.headers["x-forwarded-proto"] === "https" || req.protocol === "https"
  );
}

export function registerAuthRoutes(app: FastifyInstance): void {
  // Current auth state for the SPA.
  app.get("/api/auth/me", async (req, reply): Promise<AuthStatus> => {
    if (!authEnabled()) return { authRequired: false };
    const sess = getSession(parseCookie(req.headers.cookie, SESSION_COOKIE));
    if (!sess) {
      return reply.code(401).send({ error: "Not authenticated" }) as never;
    }
    return { authRequired: true, user: { name: sess.name } };
  });

  // Start a Plex login PIN.
  app.post("/api/auth/login", async (req, reply): Promise<PlexPinStart> => {
    if (!authEnabled()) {
      return reply.code(400).send({ error: "Login is not enabled" }) as never;
    }
    // Creating PINs is rare; cap it hard to blunt abuse.
    if (!rateLimit(`login-start:${req.ip}`, 10, 5 * 60_000)) {
      return reply
        .code(429)
        .send({ error: "Too many login attempts. Try again in a few minutes." }) as never;
    }
    try {
      const clientId = getClientId();
      const pin = await createPin(clientId);
      return { pinId: String(pin.id), authUrl: buildAuthUrl(clientId, pin.code) };
    } catch (err) {
      return reply.code(502).send({
        error: err instanceof Error ? err.message : String(err),
      }) as never;
    }
  });

  // Poll the PIN; on success verify server access and start a session.
  app.get<{ Params: { id: string } }>(
    "/api/auth/login/:id",
    async (req, reply): Promise<AuthLoginStatus> => {
      if (!authEnabled()) {
        return reply.code(400).send({ error: "Login is not enabled" }) as never;
      }
      // The client polls this every ~2s during login (≈30/min); allow headroom
      // for a couple of concurrent logins behind one IP, but cap runaway loops.
      if (!rateLimit(`login-poll:${req.ip}`, 90, 60_000)) {
        return reply
          .code(429)
          .send({ error: "Too many requests. Slow down." }) as never;
      }
      try {
        const accountToken = await checkPin(getClientId(), Number(req.params.id));
        if (!accountToken) return { pending: true };

        const access = await resolveServerAccess(accountToken);
        if (!access) {
          return reply.code(403).send({
            error: "That Plex account doesn't have access to this server.",
          }) as never;
        }

        // Identity (name + account id) comes from the account token; the session
        // stores the token that actually authenticates to the server as this
        // user (their per-server access token for shared/Home users, else the
        // account token) and their account id so we can scope per-user data.
        const account = await getAccount(accountToken);
        const sid = createSession(account.name, access.token, account.id ?? null);
        reply.header("Set-Cookie", sessionCookie(sid, isHttps(req)));
        log.info("auth", `Signed in: ${account.name}`);
        return { pending: false, user: { name: account.name } };
      } catch (err) {
        return reply.code(502).send({
          error: err instanceof Error ? err.message : String(err),
        }) as never;
      }
    },
  );

  // End the session.
  app.post("/api/auth/logout", async (req, reply): Promise<{ ok: true }> => {
    const sid = parseCookie(req.headers.cookie, SESSION_COOKIE);
    if (sid) deleteSession(sid);
    reply.header("Set-Cookie", clearSessionCookie());
    return { ok: true };
  });
}
