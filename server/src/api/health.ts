import type { FastifyInstance } from "fastify";
import type { HealthResponse, ServiceStatus } from "@resonarr/shared";
import { services } from "../services.ts";

/**
 * Best-effort reachability probe for the two upstreams. Never throws — the UI
 * uses this to tell the user what still needs configuring.
 */
export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/api/health", async (): Promise<HealthResponse> => {
    return {
      app: "ok",
      plex: await probe(services.plex !== null, async () => {
        const section = await services.plex!.getMusicSection();
        return `music section: ${section.title}`;
      }),
      lidarr: await probe(services.lidarr !== null, async () => {
        const status = await services.lidarr!.systemStatus();
        return `Lidarr ${status.version}`;
      }),
    };
  });
}

async function probe(
  configured: boolean,
  fn: () => Promise<string>,
): Promise<ServiceStatus> {
  if (!configured) return { configured: false };
  try {
    return { configured: true, ok: true, detail: await fn() };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
