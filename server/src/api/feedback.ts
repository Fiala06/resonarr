import type { FastifyInstance } from "fastify";
import type { FeedbackItem, SetFeedbackRequest } from "@resonarr/shared";
import { listFeedback, setFeedback } from "../feedback/service.ts";

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
      return setFeedback({ ...body, rating });
    },
  );
}
