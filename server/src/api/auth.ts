import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuthLoginStatus, AuthStatus, PlexPinStart } from "@resonarr/shared";
import { buildAuthUrl, checkPin, createPin, getAccountName } from "../plex/auth.ts";
import { getClientId } from "../profiles/service.ts";
import { log } from "../log/service.ts";
import {
  authEnabled,
  clearSessionCookie,
  createSession,
  deleteSession,
  getSession,
  parseCookie,
  sessionCookie,
  SESSION_COOKIE,
  verifyServerAccess,
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
  app.post("/api/auth/login", async (_req, reply): Promise<PlexPinStart> => {
    if (!authEnabled()) {
      return reply.code(400).send({ error: "Login is not enabled" }) as never;
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
      try {
        const token = await checkPin(getClientId(), Number(req.params.id));
        if (!token) return { pending: true };

        const allowed = await verifyServerAccess(token);
        if (!allowed) {
          log.warn("auth", "Login denied: no access to this Plex server");
          return reply.code(403).send({
            error: "That Plex account doesn't have access to this server.",
          }) as never;
        }

        const name = await getAccountName(token);
        const sid = createSession(name);
        reply.header("Set-Cookie", sessionCookie(sid, isHttps(req)));
        log.info("auth", `Signed in: ${name}`);
        return { pending: false, user: { name } };
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
