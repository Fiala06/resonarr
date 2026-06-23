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

// Optional HTTP Basic auth (opt-in via AUTH_USER/AUTH_PASS). /api/health is
// exempt so the container healthcheck works without credentials.
if (config.auth) {
  const expected =
    "Basic " +
    Buffer.from(`${config.auth.user}:${config.auth.pass}`).toString("base64");
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/api/health") return;
    if (req.headers.authorization !== expected) {
      reply
        .header("WWW-Authenticate", 'Basic realm="Resonarr"')
        .code(401)
        .send({ error: "Unauthorized" });
    }
  });
  app.log.info("HTTP Basic auth enabled");
}

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
  .then(() => app.log.info(`Resonarr listening on 0.0.0.0:${config.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
