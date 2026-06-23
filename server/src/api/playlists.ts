import type { FastifyInstance } from "fastify";
import type {
  CreatePlaylistRequest,
  CreatePlaylistResponse,
} from "@resonarr/shared";
import { services } from "../services.ts";
import { getSettings } from "../settings/service.ts";

export function registerPlaylistRoutes(app: FastifyInstance): void {
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

      // Apply the user's playlist-name prefix from settings.
      const prefix = getSettings().playlistPrefix.trim();
      const title = prefix ? `${prefix} · ${name}` : name;

      const created = await services.plex.createPlaylist(title, trackIds);
      return {
        playlistId: created.playlistId,
        name: created.title,
        trackCount: created.trackCount,
      };
    },
  );
}
