import type { FastifyInstance } from "fastify";
import type {
  AutoPlaylist,
  CreateAutoPlaylistRequest,
  UpdateAutoPlaylistRequest,
} from "@resonarr/shared";
import { services } from "../services.ts";
import {
  createAutoPlaylist,
  deleteAutoPlaylist,
  getAutoPlaylist,
  listAutoPlaylists,
  updateAutoPlaylist,
} from "../autoplaylist/store.ts";
import { runAutoPlaylist } from "../autoplaylist/service.ts";

export function registerAutoPlaylistRoutes(app: FastifyInstance): void {
  // List all scheduled auto-playlists with their status.
  app.get("/api/auto-playlists", async (): Promise<AutoPlaylist[]> => {
    return listAutoPlaylists();
  });

  // Create a definition (Discover Weekly). Due immediately; the scheduler (or a
  // manual "run now") builds it.
  app.post<{ Body: CreateAutoPlaylistRequest }>(
    "/api/auto-playlists",
    async (req): Promise<AutoPlaylist> => {
      return createAutoPlaylist(req.body ?? {});
    },
  );

  // Update (enable/disable, cadence, size, mode, name).
  app.put<{ Params: { id: string }; Body: UpdateAutoPlaylistRequest }>(
    "/api/auto-playlists/:id",
    async (req, reply): Promise<AutoPlaylist> => {
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
      if (!getAutoPlaylist(req.params.id)) {
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
      if (!getAutoPlaylist(req.params.id)) {
        return reply.code(404).send({ error: "Not found" }) as never;
      }
      if (!services.plex) {
        return reply.code(503).send({ error: "Plex is not configured" }) as never;
      }
      return runAutoPlaylist(req.params.id);
    },
  );
}
