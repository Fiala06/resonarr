import type { FastifyInstance } from "fastify";
import type { OnThisDayResponse, YearInReviewResponse } from "@resonarr/shared";
import type { FastifyRequest } from "fastify";
import { userPlexClient } from "../auth/service.ts";
import { feedbackKeyForRequest } from "../feedback/service.ts";
import { getOnThisDay, getYearTracks } from "../timemachine/service.ts";
import { services } from "../services.ts";

/** Session Plex account id as a number, or null when login is off. */
async function accountIdForRequest(req: FastifyRequest): Promise<number | null> {
  const key = await feedbackKeyForRequest(req);
  return key ? Number(key) : null;
}

export function registerTimeMachineRoutes(app: FastifyInstance): void {
  /** "On this day" — tracks from this week across the past 6 years. */
  app.get("/api/timemachine/onthisday", async (req, reply): Promise<OnThisDayResponse> => {
    if (!services.plex)
      return reply.code(503).send({ error: "Plex is not configured" }) as never;
    try {
      const plex = userPlexClient(req);
      const section = await plex.getMusicSection();
      const result = await getOnThisDay(
        plex,
        section.key,
        await accountIdForRequest(req),
      );
      return result;
    } catch (err) {
      return reply.code(502).send({
        error: err instanceof Error ? err.message : String(err),
      }) as never;
    }
  });

  /** Top tracks from a specific calendar year. */
  app.get<{ Params: { year: string } }>(
    "/api/timemachine/year/:year",
    async (req, reply): Promise<YearInReviewResponse> => {
      if (!services.plex)
        return reply.code(503).send({ error: "Plex is not configured" }) as never;

      const year = Number(req.params.year);
      if (!Number.isInteger(year) || year < 2000 || year > new Date().getFullYear()) {
        return reply.code(400).send({ error: "Invalid year" }) as never;
      }

      try {
        const plex = userPlexClient(req);
        const section = await plex.getMusicSection();
        return await getYearTracks(
          plex,
          section.key,
          year,
          await accountIdForRequest(req),
        );
      } catch (err) {
        return reply.code(502).send({
          error: err instanceof Error ? err.message : String(err),
        }) as never;
      }
    },
  );
}
