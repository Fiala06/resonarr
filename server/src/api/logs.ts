import type { FastifyInstance } from "fastify";
import type { LogEntry } from "@resonarr/shared";
import { clearEvents, listEvents } from "../log/service.ts";

export function registerLogRoutes(app: FastifyInstance): void {
  // Recent activity log, newest first.
  app.get<{ Querystring: { limit?: string } }>(
    "/api/logs",
    async (req): Promise<LogEntry[]> => {
      const limit = Number(req.query.limit) || 200;
      return listEvents(limit);
    },
  );

  // Clear the activity log.
  app.delete("/api/logs", async (): Promise<{ cleared: true }> => {
    clearEvents();
    return { cleared: true };
  });
}
