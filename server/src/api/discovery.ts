import type { FastifyInstance } from "fastify";
import type { RadioRequest, RadioResponse, Track } from "@resonarr/shared";
import { services } from "../services.ts";

export function registerDiscoveryRoutes(app: FastifyInstance): void {
  // Seed-track search for the pickers.
  app.get<{ Querystring: { q?: string } }>(
    "/api/search/tracks",
    async (req, reply): Promise<Track[]> => {
      const q = (req.query.q ?? "").trim();
      if (!q) return [];
      if (!services.plex) {
        return reply.code(503).send({ error: "Plex is not configured" }) as never;
      }
      return services.plex.searchTracks(q, 25);
    },
  );

  // Radio: seed track -> sonically similar owned tracks (cached).
  app.post<{ Body: RadioRequest }>(
    "/api/radio",
    async (req, reply): Promise<RadioResponse> => {
      const { seedTrackId, limit } = req.body ?? {};
      if (!seedTrackId) {
        return reply
          .code(400)
          .send({ error: "seedTrackId is required" }) as never;
      }
      if (!services.sonic) {
        return reply.code(503).send({ error: "Plex is not configured" }) as never;
      }
      const tracks = await services.sonic.similar(seedTrackId, limit ?? 25);
      return { tracks };
    },
  );
}
