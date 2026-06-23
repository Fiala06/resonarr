import type { FastifyInstance } from "fastify";
import type { AppSettings } from "@resonarr/shared";
import { getSettings, updateSettings } from "../settings/service.ts";

export function registerSettingsRoutes(app: FastifyInstance): void {
  app.get("/api/settings", async (): Promise<AppSettings> => getSettings());

  app.put<{ Body: Partial<AppSettings> }>(
    "/api/settings",
    async (req): Promise<AppSettings> => {
      const body = (req.body ?? {}) as Partial<AppSettings>;
      return updateSettings(body);
    },
  );
}
