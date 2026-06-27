import type { FastifyInstance, FastifyRequest } from "fastify";
import type {
  AutoPlaylist,
  CreateAutoPlaylistRequest,
  UpdateAutoPlaylistRequest,
} from "@resonarr/shared";
import { services } from "../services.ts";
import {
  authEnabled,
  currentUserId,
  ownerAccountId,
  requestSession,
} from "../auth/service.ts";
import {
  createAutoPlaylist,
  deleteAutoPlaylist,
  getAutoPlaylist,
  getAutoPlaylistOwner,
  listAutoPlaylistsForViewer,
  updateAutoPlaylist,
} from "../autoplaylist/store.ts";
import { runAutoPlaylist } from "../autoplaylist/service.ts";

/**
 * May the request's user manage this definition? True when login is off, when
 * they created it, or when they're the server owner (who can manage everything,
 * including legacy rows with no recorded creator). Returns false for unknown ids.
 */
async function canManage(req: FastifyRequest, id: string): Promise<boolean> {
  if (!getAutoPlaylist(id)) return false;
  if (!authEnabled()) return true;
  const viewerId = await currentUserId(req);
  if (!viewerId) return false;
  if (viewerId === (await ownerAccountId())) return true;
  return getAutoPlaylistOwner(id)?.ownerId === viewerId;
}

export function registerAutoPlaylistRoutes(app: FastifyInstance): void {
  // List the scheduled auto-playlists visible to this user (their own, plus
  // legacy rows when they're the server owner).
  app.get("/api/auto-playlists", async (req): Promise<AutoPlaylist[]> => {
    if (!authEnabled()) return listAutoPlaylistsForViewer(null, false);
    const viewerId = await currentUserId(req);
    const isOwner = viewerId !== null && viewerId === (await ownerAccountId());
    return listAutoPlaylistsForViewer(viewerId, isOwner);
  });

  // Create a definition (Discover Weekly), owned by the signed-in user so it
  // builds on THEIR Plex account. Due immediately; the scheduler (or a manual
  // "run now") builds it.
  app.post<{ Body: CreateAutoPlaylistRequest }>(
    "/api/auto-playlists",
    async (req): Promise<AutoPlaylist> => {
      const sess = requestSession(req);
      const ownerId = await currentUserId(req);
      return createAutoPlaylist(req.body ?? {}, {
        ownerId,
        ownerToken: sess?.token ?? null,
      });
    },
  );

  // Update (enable/disable, cadence, size, mode, name).
  app.put<{ Params: { id: string }; Body: UpdateAutoPlaylistRequest }>(
    "/api/auto-playlists/:id",
    async (req, reply): Promise<AutoPlaylist> => {
      if (!(await canManage(req, req.params.id))) {
        return reply.code(404).send({ error: "Not found" }) as never;
      }
      const updated = updateAutoPlaylist(req.params.id, req.body ?? {});
      if (!updated) {
        return reply.code(404).send({ error: "Not found" }) as never;
      }
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/auto-playlists/:id",
    async (req, reply): Promise<{ ok: true }> => {
      if (!(await canManage(req, req.params.id))) {
        return reply.code(404).send({ error: "Not found" }) as never;
      }
      deleteAutoPlaylist(req.params.id);
      return { ok: true };
    },
  );

  // Build it now (test/refresh on demand). Returns the updated definition with
  // its new status — the build itself never throws, so failures land in status.
  app.post<{ Params: { id: string } }>(
    "/api/auto-playlists/:id/run",
    async (req, reply): Promise<AutoPlaylist> => {
      if (!(await canManage(req, req.params.id))) {
        return reply.code(404).send({ error: "Not found" }) as never;
      }
      if (!services.plex) {
        return reply.code(503).send({ error: "Plex is not configured" }) as never;
      }
      return runAutoPlaylist(req.params.id);
    },
  );
}
