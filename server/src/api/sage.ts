import type { FastifyInstance } from "fastify";
import type { DiscoveryResult, SageRequest } from "@resonarr/shared";
import { runSage } from "../sage/service.ts";

export function registerSageRoutes(app: FastifyInstance): void {
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
