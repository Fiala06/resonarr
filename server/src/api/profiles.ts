import type { FastifyInstance } from "fastify";
import type {
  PlexPinStart,
  PlexPinStatus,
  UserProfile,
} from "@resonarr/shared";
import { buildAuthUrl, checkPin, createPin } from "../plex/auth.ts";
import {
  addProfileFromToken,
  getClientId,
  listProfiles,
  removeProfile,
  setActiveProfile,
} from "../profiles/service.ts";

export function registerProfileRoutes(app: FastifyInstance): void {
  // List profiles (owner + connected Plex users).
  app.get("/api/profiles", async (): Promise<UserProfile[]> => listProfiles());

  // Switch the active profile.
  app.post<{ Body: { id?: string } }>(
    "/api/profiles/active",
    async (req, reply): Promise<UserProfile[]> => {
      const id = req.body?.id;
      if (!id) {
        return reply.code(400).send({ error: "id is required" }) as never;
      }
      try {
        return setActiveProfile(id);
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        }) as never;
      }
    },
  );

  // Remove a connected profile.
  app.delete<{ Params: { id: string } }>(
    "/api/profiles/:id",
    async (req): Promise<{ ok: true }> => {
      removeProfile(req.params.id);
      return { ok: true };
    },
  );

  // Start a Plex PIN login — returns the URL to open and a pin id to poll.
  app.post("/api/profiles/pin", async (_req, reply): Promise<PlexPinStart> => {
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

  // Poll a PIN: pending until authorized, then creates + returns the profile.
  app.get<{ Params: { id: string } }>(
    "/api/profiles/pin/:id",
    async (req, reply): Promise<PlexPinStatus> => {
      try {
        const token = await checkPin(getClientId(), Number(req.params.id));
        if (!token) return { pending: true };
        const profile = await addProfileFromToken(token);
        return { pending: false, profile };
      } catch (err) {
        return reply.code(502).send({
          error: err instanceof Error ? err.message : String(err),
        }) as never;
      }
    },
  );
}
