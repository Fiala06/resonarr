import type { FastifyInstance } from "fastify";
import type { LidarrOptions } from "@resonarr/shared";
import { services } from "../services.ts";

/**
 * Lidarr targets for the Settings dropdowns (root folders + profiles). Fetched
 * live from Lidarr; returns 503 when Lidarr isn't configured/reachable so the
 * UI can show a clear message instead of empty selects.
 */
export function registerLidarrRoutes(app: FastifyInstance): void {
  app.get("/api/lidarr/options", async (_req, reply): Promise<LidarrOptions> => {
    if (!services.lidarr) {
      return reply.code(503).send({ error: "Lidarr is not configured" }) as never;
    }
    try {
      const [rootFolders, qualityProfiles, metadataProfiles] = await Promise.all(
        [
          services.lidarr.rootFolders(),
          services.lidarr.qualityProfiles(),
          services.lidarr.metadataProfiles(),
        ],
      );
      return {
        rootFolders: rootFolders.map((r) => ({ id: r.id, path: r.path })),
        qualityProfiles: qualityProfiles.map((p) => ({ id: p.id, name: p.name })),
        metadataProfiles: metadataProfiles.map((p) => ({
          id: p.id,
          name: p.name,
        })),
      };
    } catch (err) {
      return reply.code(503).send({
        error: err instanceof Error ? err.message : String(err),
      }) as never;
    }
  });
}
