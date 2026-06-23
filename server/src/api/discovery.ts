import type { FastifyInstance } from "fastify";
import type {
  AdventureRequest,
  AdventureResponse,
  LibraryStats,
  MixesResponse,
  RadioRequest,
  RadioResponse,
  Track,
} from "@resonarr/shared";
import { services } from "../services.ts";
import { runMixes } from "../mixes/service.ts";
import { runAdventure } from "../adventure/service.ts";

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

  // Cover-art proxy: fetch Plex images with the server-side token so the
  // browser never needs it. Restricted to Plex art paths.
  app.get<{ Querystring: { path?: string } }>(
    "/api/art",
    async (req, reply) => {
      const path = req.query.path ?? "";
      if (!path.startsWith("/library/") && !path.startsWith("/photo/")) {
        return reply.code(400).send({ error: "invalid art path" });
      }
      if (!services.plex) {
        return reply.code(503).send({ error: "Plex is not configured" });
      }
      try {
        const { contentType, body } = await services.plex.fetchArt(path);
        reply.header("content-type", contentType);
        reply.header("cache-control", "public, max-age=86400");
        return reply.send(body);
      } catch {
        return reply.code(404).send();
      }
    },
  );

  // Library counts for the sidebar.
  app.get("/api/library/stats", async (_req, reply): Promise<LibraryStats> => {
    if (!services.plex) {
      return reply.code(503).send({ error: "Plex is not configured" }) as never;
    }
    const section = await services.plex.getMusicSection();
    return services.plex.getLibraryStats(section.key);
  });

  // Mixes: seeded from recent listening, expanded by similarity.
  app.get("/api/mixes", async (_req, reply): Promise<MixesResponse> => {
    if (!services.plex) {
      return reply.code(503).send({ error: "Plex is not configured" }) as never;
    }
    try {
      return await runMixes();
    } catch (err) {
      return reply.code(502).send({
        error: err instanceof Error ? err.message : String(err),
      }) as never;
    }
  });

  // Sonic Adventure: a path from a start track to a destination track.
  app.post<{ Body: AdventureRequest }>(
    "/api/adventure",
    async (req, reply): Promise<AdventureResponse> => {
      const { startTrackId, endTrackId, length } = req.body ?? {};
      if (!startTrackId || !endTrackId) {
        return reply
          .code(400)
          .send({ error: "startTrackId and endTrackId are required" }) as never;
      }
      if (!services.plex) {
        return reply.code(503).send({ error: "Plex is not configured" }) as never;
      }
      try {
        return await runAdventure(startTrackId, endTrackId, length);
      } catch (err) {
        return reply.code(502).send({
          error: err instanceof Error ? err.message : String(err),
        }) as never;
      }
    },
  );
}
