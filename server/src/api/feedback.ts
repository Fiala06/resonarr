import type { FastifyInstance } from "fastify";
import type { FeedbackItem, SetFeedbackRequest } from "@resonarr/shared";
import { listFeedback, setFeedback } from "../feedback/service.ts";
import { userPlexClient } from "../auth/service.ts";
import { config } from "../config/env.ts";
import { log } from "../log/service.ts";

export function registerFeedbackRoutes(app: FastifyInstance): void {
  app.get("/api/feedback", async (): Promise<FeedbackItem[]> => {
    return listFeedback();
  });

  // Set or clear a track's rating; returns the full list to resync the client.
  app.put<{ Body: SetFeedbackRequest }>(
    "/api/feedback",
    async (req, reply): Promise<FeedbackItem[]> => {
      const body = req.body;
      if (!body?.trackId || !body?.artist) {
        return reply
          .code(400)
          .send({ error: "trackId and artist are required" }) as never;
      }
      const rating =
        body.rating === "up" || body.rating === "down" ? body.rating : null;
      const list = setFeedback({ ...body, rating });

      // Best-effort write-back to the user's Plex star rating: up = 5★, down =
      // 1★, cleared = unset. Never fails the request — it's a convenience mirror.
      if (config.plex) {
        const plexRating = rating === "up" ? 10 : rating === "down" ? 2 : 0;
        try {
          await userPlexClient(req).rateTrack(body.trackId, plexRating);
        } catch (err) {
          log.warn(
            "feedback",
            `Plex rating write-back failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      return list;
    },
  );
}
