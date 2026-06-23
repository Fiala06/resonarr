import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import type { HealthResponse, ServiceStatus } from "@resonarr/shared";
import { config } from "./config/env.ts";
import { PlexClient } from "./plex/client.ts";
import { LidarrClient } from "./lidarr/client.ts";

const here = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(here, "../../web/dist");

const app = Fastify({ logger: true });

// --- API: health -------------------------------------------------------------
// Best-effort reachability probe for the two upstreams. Never throws — the UI
// uses this to tell the user what still needs configuring.
app.get("/api/health", async (): Promise<HealthResponse> => {
  return {
    app: "ok",
    plex: await probe(async () => {
      const plex = new PlexClient(requireOrThrow(config.plex, "plex"));
      const section = await plex.getMusicSection();
      return `music section: ${section.title}`;
    }, config.plex !== undefined),
    lidarr: await probe(async () => {
      const lidarr = new LidarrClient(requireOrThrow(config.lidarr, "lidarr"));
      const status = await lidarr.systemStatus();
      return `Lidarr ${status.version}`;
    }, config.lidarr !== undefined),
  };
});

function requireOrThrow<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`${name} not configured`);
  return value;
}

async function probe(
  fn: () => Promise<string>,
  configured: boolean,
): Promise<ServiceStatus> {
  if (!configured) return { configured: false };
  try {
    const detail = await fn();
    return { configured: true, ok: true, detail };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// --- Static web app (built SPA) ----------------------------------------------
// Present in production / Docker; absent during `dev:web` (Vite serves it).
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, prefix: "/" });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api")) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    reply.sendFile("index.html");
  });
} else {
  app.log.warn(`web build not found at ${webDist} — API only`);
}

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then((addr) => app.log.info(`Resonarr listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
