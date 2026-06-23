import type { FastifyInstance } from "fastify";
import type {
  AddToPlaylistResponse,
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  PlaylistSummary,
} from "@resonarr/shared";
import { log } from "../log/service.ts";
import { services } from "../services.ts";
import { getSettings } from "../settings/service.ts";

export function registerPlaylistRoutes(app: FastifyInstance): void {
  // List existing audio playlists (for "add to existing").
  app.get("/api/playlists", async (_req, reply): Promise<PlaylistSummary[]> => {
    if (!services.plex) {
      return reply.code(503).send({ error: "Plex is not configured" }) as never;
    }
    return services.plex.getPlaylists();
  });

  // Create a new playlist.
  app.post<{ Body: CreatePlaylistRequest }>(
    "/api/playlists",
    async (req, reply): Promise<CreatePlaylistResponse> => {
      const { name, trackIds } = req.body ?? {};
      if (!name || !trackIds?.length) {
        return reply
          .code(400)
          .send({ error: "name and trackIds are required" }) as never;
      }
      if (!services.plex) {
        return reply.code(503).send({ error: "Plex is not configured" }) as never;
      }

      const prefix = getSettings().playlistPrefix.trim();
      const title = prefix ? `${prefix} · ${name}` : name;

      const created = await services.plex.createPlaylist(title, trackIds);
      log.info("playlist", `Created "${created.title}" (${created.trackCount} tracks)`);
      return {
        playlistId: created.playlistId,
        name: created.title,
        trackCount: created.trackCount,
      };
    },
  );

  // Append tracks to an existing playlist.
  app.post<{ Params: { id: string }; Body: { trackIds: string[] } }>(
    "/api/playlists/:id/items",
    async (req, reply): Promise<AddToPlaylistResponse> => {
      const { id } = req.params;
      const trackIds = req.body?.trackIds ?? [];
      if (!id || trackIds.length === 0) {
        return reply
          .code(400)
          .send({ error: "playlist id and trackIds are required" }) as never;
      }
      if (!services.plex) {
        return reply.code(503).send({ error: "Plex is not configured" }) as never;
      }
      const added = await services.plex.addToPlaylist(id, trackIds);
      log.info("playlist", `Added ${added} tracks to playlist ${id}`);
      return { playlistId: id, added };
    },
  );
}
