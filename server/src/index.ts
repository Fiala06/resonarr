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
import { registerLogRoutes } from "./api/logs.ts";
import { registerAuthRoutes } from "./api/auth.ts";
import { registerAutoPlaylistRoutes } from "./api/autoplaylists.ts";
import { registerFeedbackRoutes } from "./api/feedback.ts";
import { registerSpotifyRoutes } from "./api/spotify.ts";
import { registerTimeMachineRoutes } from "./api/timemachine.ts";
import { registerTautulliRoutes } from "./api/tautulli.ts";
import { startScheduler } from "./autoplaylist/service.ts";
import { startSpotifySyncScheduler } from "./spotify/sync.ts";
import { reconcileRunningJobs } from "./spotify/import-jobs.ts";
import {
  authEnabled,
  getSession,
  parseCookie,
  SESSION_COOKIE,
} from "./auth/service.ts";

const here = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(here, "../../web/dist");

const app = Fastify({ logger: true });

// Initialize the database (creates the file + runs migrations) before serving.
getDb();
app.log.info(`data dir: ${config.dataDir}`);

// Fail fast on a misconfigured LLM provider; warn (don't crash) on optional
// upstreams so the operator sees the problem at boot, not on first use.
function failConfig(msg: string): never {
  app.log.error(`Config error: ${msg}`);
  process.exit(1);
}
if (!["claude", "openai", "ollama"].includes(config.llm.provider)) {
  failConfig(
    `Unknown LLM_PROVIDER "${config.llm.provider}" (expected claude | openai | ollama).`,
  );
}
if (config.llm.provider === "claude" && !config.llm.anthropicApiKey) {
  failConfig("LLM_PROVIDER=claude but ANTHROPIC_API_KEY is not set.");
}
if (config.llm.provider === "openai" && !config.llm.openaiApiKey) {
  failConfig("LLM_PROVIDER=openai but OPENAI_API_KEY is not set.");
}
if (!config.plex) {
  app.log.warn(
    "Plex not configured (PLEX_URL/PLEX_TOKEN) — discovery, playlists, and Plex login are unavailable.",
  );
}
if (!config.lidarr) {
  app.log.warn(
    "Lidarr not configured (LIDARR_URL/LIDARR_API_KEY) — requesting new music is unavailable.",
  );
}
if (config.tautulli) {
  app.log.info(
    "Tautulli configured — play-history import available (Settings → Play history).",
  );
}
if (config.authPlex && !config.plex) {
  app.log.warn(
    "AUTH_PLEX is set but Plex isn't configured — login stays DISABLED until PLEX_URL/PLEX_TOKEN are set.",
  );
}

// Optional HTTP Basic auth (opt-in via AUTH_USER/AUTH_PASS). /api/health is
// exempt so the container healthcheck works without credentials.
if (config.auth) {
  const expected =
    "Basic " +
    Buffer.from(`${config.auth.user}:${config.auth.pass}`).toString("base64");
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/api/health" || req.url.startsWith("/api/spotify/auth/")) return;
    if (req.headers.authorization !== expected) {
      return reply
        .header("WWW-Authenticate", 'Basic realm="Resonarr"')
        .code(401)
        .send({ error: "Unauthorized" });
    }
  });
  app.log.info("HTTP Basic auth enabled");
}

// Plex login gate (opt-in via AUTH_PLEX). Protects the API; the static SPA and
// the auth/health endpoints stay open so the login screen can load and sign in.
if (authEnabled()) {
  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0] ?? req.url;
    if (!path.startsWith("/api/")) return; // SPA + static assets
    if (
      path === "/api/health" ||
      path.startsWith("/api/auth/") ||
      path.startsWith("/api/spotify/auth/") ||
      // Image proxies serve only non-sensitive artwork; leaving them open lets
      // the browser load covers without per-request auth quirks (and is easy to
      // probe with curl when diagnosing).
      path === "/api/art" ||
      path === "/api/lidarr/art"
    )
      return;
    const sess = getSession(parseCookie(req.headers.cookie, SESSION_COOKIE));
    if (!sess) {
      return reply.code(401).send({ error: "Not authenticated" });
    }
  });
  app.log.info("Plex login required (AUTH_PLEX)");
}

// --- API routes --------------------------------------------------------------
registerHealthRoutes(app);
registerAuthRoutes(app);
registerSettingsRoutes(app);
registerLidarrRoutes(app);
registerDiscoveryRoutes(app);
registerPlaylistRoutes(app);
registerBasketRoutes(app);
registerSageRoutes(app);
registerLogRoutes(app);
registerAutoPlaylistRoutes(app);
registerFeedbackRoutes(app);
registerSpotifyRoutes(app);
registerTimeMachineRoutes(app);
registerTautulliRoutes(app);

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
  .then(() => {
    app.log.info(`Resonarr listening on 0.0.0.0:${config.port}`);
    // Any import job left 'running' was cut off by a restart — mark it errored.
    reconcileRunningJobs();
    // Background refresh of scheduled auto-playlists (Discover Weekly).
    startScheduler();
    // Background backfill of ongoing Spotify→Plex migrations.
    startSpotifySyncScheduler();
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
