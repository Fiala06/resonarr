import type { FastifyInstance } from "fastify";
import type { DiscoveryResult, SageRequest } from "@resonarr/shared";
import { runSage } from "../sage/service.ts";
import { getSageExamples } from "../sage/examples.ts";
import { services } from "../services.ts";
import { userPlexClient } from "../auth/service.ts";

export function registerSageRoutes(app: FastifyInstance): void {
  // Personalized "Try one of these" example prompts (cached, ?refresh=1 rebuilds).
  app.get<{ Querystring: { refresh?: string } }>(
    "/api/sage/examples",
    async (req, reply): Promise<{ examples: string[] }> => {
      if (!services.plex) {
        return reply.code(503).send({ error: "Plex is not configured" }) as never;
      }
      const refresh = req.query.refresh === "1";
      return { examples: await getSageExamples(userPlexClient(req), refresh) };
    },
  );

  app.post<{ Body: SageRequest }>(
    "/api/sage",
    async (req, reply): Promise<DiscoveryResult> => {
      const prompt = (req.body?.prompt ?? "").trim();
      if (!prompt) {
        return reply.code(400).send({ error: "prompt is required" }) as never;
      }
      try {
        return await runSage(
          prompt,
          req.body?.ownArtistBias ?? false,
          req.body?.count,
        );
      } catch (err) {
        return reply.code(502).send({
          error: err instanceof Error ? err.message : String(err),
        }) as never;
      }
    },
  );
}
