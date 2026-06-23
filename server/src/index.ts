import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { config } from "./config/env.ts";
import { getDb } from "./db/database.ts";
import { registerHealthRoutes } from "./api/health.ts";
import { registerSettingsRoutes } from "./api/settings.ts";
import { registerLidarrRoutes } from "./api/lidarr.ts";
import { registerDiscoveryRoutes } from "./api/discovery.ts";
import { registerPlaylistRoutes } from "./api/playlists.ts";
import { registerBasketRoutes } from "./api/basket.ts";
import { registerSageRoutes } from "./api/sage.ts";

const here = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(here, "../../web/dist");

const app = Fastify({ logger: true });

// Initialize the database (creates the file + runs migrations) before serving.
getDb();
app.log.info(`data dir: ${config.dataDir}`);

// --- API routes --------------------------------------------------------------
registerHealthRoutes(app);
registerSettingsRoutes(app);
registerLidarrRoutes(app);
registerDiscoveryRoutes(app);
registerPlaylistRoutes(app);
registerBasketRoutes(app);
registerSageRoutes(app);

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
