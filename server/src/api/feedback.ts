import type { FastifyInstance } from "fastify";
import type {
  FeedbackItem,
  ImportRatingsResult,
  SetFeedbackRequest,
} from "@resonarr/shared";
import {
  feedbackKeyForRequest,
  importRatings,
  listFeedback,
  setFeedback,
} from "../feedback/service.ts";
import { services } from "../services.ts";
import { userPlexClient } from "../auth/service.ts";
import { config } from "../config/env.ts";
import { log } from "../log/service.ts";

export function registerFeedbackRoutes(app: FastifyInstance): void {
  app.get("/api/feedback", async (req): Promise<FeedbackItem[]> => {
    return listFeedback(await feedbackKeyForRequest(req));
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
      const key = await feedbackKeyForRequest(req);
      const list = setFeedback(key, { ...body, rating });

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

  // Import the signed-in user's Plex star ratings into their feedback (one-time,
  // on demand). 4–5★ → 👍, 1–2★ → 👎, ~3★ left neutral.
  app.post(
    "/api/feedback/import-plex",
    async (req, reply): Promise<ImportRatingsResult> => {
      if (!services.plex) {
        return reply.code(503).send({ error: "Plex is not configured" }) as never;
      }
      try {
        const key = await feedbackKeyForRequest(req);
        const plex = userPlexClient(req);
        const section = await plex.getMusicSection();
        const rated = await plex.getRatedTracks(section.key);
        const result = importRatings(key, rated);
        log.info(
          "feedback",
          `Imported Plex ratings: ${result.up} up, ${result.down} down, ${result.skipped} skipped`,
        );
        return result;
      } catch (err) {
        return reply.code(502).send({
          error: err instanceof Error ? err.message : String(err),
        }) as never;
      }
    },
  );
}
