import type { FastifyInstance } from "fastify";
import type { TautulliImportResult, TautulliStatus } from "@resonarr/shared";
import { services } from "../services.ts";
import { archiveStatus, importFromTautulli } from "../history/service.ts";

export function registerTautulliRoutes(app: FastifyInstance): void {
  /** Archive state + whether Tautulli is configured (drives the Settings UI). */
  app.get("/api/tautulli/status", async (): Promise<TautulliStatus> => {
    const s = archiveStatus();
    return { configured: !!services.tautulli, ...s };
  });

  /**
   * Import play history from Tautulli (incremental — only plays newer than the
   * archive's newest event). A first import of years of history can take a
   * while; subsequent runs are quick.
   */
  app.post("/api/tautulli/import", async (_req, reply): Promise<TautulliImportResult> => {
    if (!services.tautulli)
      return reply.code(503).send({ error: "Tautulli is not configured" }) as never;
    try {
      return await importFromTautulli();
    } catch (err) {
      return reply.code(502).send({
        error: err instanceof Error ? err.message : String(err),
      }) as never;
    }
  });
}
