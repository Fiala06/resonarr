import type { FastifyInstance } from "fastify";
import type {
  AdventureRequest,
  AdventureResponse,
  ArtistDiscoveryResponse,
  DeepCutsMode,
  DeepCutsResponse,
  DiscoverRequest,
  DiscoverResponse,
  LibraryStats,
  LovedResponse,
  MixesResponse,
  RadioRequest,
  RadioResponse,
  TasteProfile,
  Track,
} from "@resonarr/shared";
import { services } from "../services.ts";
import { log } from "../log/service.ts";
import { userPlexClient } from "../auth/service.ts";
import { runMixes } from "../mixes/service.ts";
import { runAdventure } from "../adventure/service.ts";
import { discoverFromPlaylist } from "../discover/service.ts";
import { discoverFromLikes } from "../loved/service.ts";
import { getDeepCuts } from "../deepcuts/service.ts";
import { discoverArtists } from "../artistdiscovery/service.ts";
import { buildTasteProfile } from "../taste/service.ts";
import { feedbackKeyForRequest, filterDisliked } from "../feedback/service.ts";

export function registerDiscoveryRoutes(app: FastifyInstance): void {
  // Seed-track search for the pickers.
  app.get<{ Querystring: { q?: string } }>(
    "/api/search/tracks",
    async (req, reply): Promise<Track[]> => {
      const q = (req.query.q ?? "").trim();
      if (!q) return [];
      if (!services.plex) {
        return reply.code(503).send({ error: "Plex is not configured" }) as never;
      }
      return services.plex.searchTracks(q, 25);
    },
  );

  // Radio: seed track -> sonically similar owned tracks (cached).
  app.post<{ Body: RadioRequest }>(
    "/api/radio",
    async (req, reply): Promise<RadioResponse> => {
      const { seedTrackId, limit } = req.body ?? {};
      if (!seedTrackId) {
        return reply
          .code(400)
          .send({ error: "seedTrackId is required" }) as never;
      }
      if (!services.sonic) {
        return reply.code(503).send({ error: "Plex is not configured" }) as never;
      }
      const tracks = await services.sonic.similar(seedTrackId, limit ?? 25);
      return { tracks: filterDisliked(await feedbackKeyForRequest(req), tracks) };
    },
  );

  // Cover-art proxy: fetch Plex images with the server-side token so the
  // browser never needs it. Restricted to Plex art paths.
  app.get<{ Querystring: { path?: string } }>(
    "/api/art",
    async (req, reply) => {
      const path = req.query.path ?? "";
      if (!path.startsWith("/library/") && !path.startsWith("/photo/")) {
        return reply.code(400).send({ error: "invalid art path" });
      }
      if (!services.plex) {
        return reply.code(503).send({ error: "Plex is not configured" });
      }
      try {
        const { contentType, body } = await services.plex.fetchArt(path);
        reply.header("content-type", contentType);
        reply.header("cache-control", "public, max-age=86400");
        return reply.send(body);
      } catch {
        return reply.code(404).send();
      }
    },
  );

  // Library counts for the sidebar.
  app.get("/api/library/stats", async (_req, reply): Promise<LibraryStats> => {
    if (!services.plex) {
      return reply.code(503).send({ error: "Plex is not configured" }) as never;
    }
    const section = await services.plex.getMusicSection();
    return services.plex.getLibraryStats(section.key);
  });

  // Mixes: seeded from recent listening, expanded by similarity.
  app.get("/api/mixes", async (req, reply): Promise<MixesResponse> => {
    if (!services.plex) {
      return reply.code(503).send({ error: "Plex is not configured" }) as never;
    }
    try {
      return await runMixes(userPlexClient(req), await feedbackKeyForRequest(req));
    } catch (err) {
      return reply.code(502).send({
        error: err instanceof Error ? err.message : String(err),
      }) as never;
    }
  });

  // Discover: fresh owned tracks similar to a chosen playlist (not already in it).
  app.post<{ Body: DiscoverRequest }>(
    "/api/discover",
    async (req, reply): Promise<DiscoverResponse> => {
      const { playlistId, limit, newArtistsOnly } = req.body ?? {};
      if (!playlistId) {
        return reply.code(400).send({ error: "playlistId is required" }) as never;
      }
      if (!services.plex) {
        return reply.code(503).send({ error: "Plex is not configured" }) as never;
      }
      try {
        return await discoverFromPlaylist(
          userPlexClient(req),
          await feedbackKeyForRequest(req),
          playlistId,
          limit,
          newArtistsOnly,
        );
      } catch (err) {
        return reply.code(502).send({
          error: err instanceof Error ? err.message : String(err),
        }) as never;
      }
    },
  );

  // Loved: owned tracks near the centre of your taste (sonic-near many likes).
  app.get("/api/loved", async (req, reply): Promise<LovedResponse> => {
    if (!services.sonic) {
      return reply.code(503).send({ error: "Plex is not configured" }) as never;
    }
    try {
      return await discoverFromLikes(await feedbackKeyForRequest(req));
    } catch (err) {
      return reply.code(502).send({
        error: err instanceof Error ? err.message : String(err),
      }) as never;
    }
  });

  // Deep cuts: owned tracks you rarely (never) or no-longer (faded) play.
  app.get<{ Querystring: { mode?: string } }>(
    "/api/deepcuts",
    async (req, reply): Promise<DeepCutsResponse> => {
      const mode: DeepCutsMode = req.query.mode === "faded" ? "faded" : "never";
      if (!services.plex) {
        return reply.code(503).send({ error: "Plex is not configured" }) as never;
      }
      try {
        return await getDeepCuts(userPlexClient(req), await feedbackKeyForRequest(req), mode);
      } catch (err) {
        return reply.code(502).send({
          error: err instanceof Error ? err.message : String(err),
        }) as never;
      }
    },
  );

  // Artist discovery: adjacent artists you don't own yet, validated via Lidarr.
  app.get<{ Querystring: { count?: string } }>(
    "/api/artist-discovery",
    async (req, reply): Promise<ArtistDiscoveryResponse> => {
      const count = req.query.count ? Number(req.query.count) : undefined;
      if (!services.plex) {
        return reply.code(503).send({ error: "Plex is not configured" }) as never;
      }
      if (!services.lidarr) {
        return reply.code(503).send({ error: "Lidarr is not configured" }) as never;
      }
      try {
        return await discoverArtists(
          userPlexClient(req),
          await feedbackKeyForRequest(req),
          count,
        );
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        log.error("artist-discovery", `Run failed: ${detail}`);
        return reply.code(502).send({ error: detail }) as never;
      }
    },
  );

  // Taste profile ("Resonarr Wrapped"): LLM portrait of your listening.
  app.get("/api/taste-profile", async (req, reply): Promise<TasteProfile> => {
    if (!services.plex) {
      return reply.code(503).send({ error: "Plex is not configured" }) as never;
    }
    try {
      return await buildTasteProfile(userPlexClient(req));
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log.error("taste", `Profile failed: ${detail}`);
      return reply.code(502).send({ error: detail }) as never;
    }
  });

  // Sonic Adventure: a path from a start track to a destination track.
  app.post<{ Body: AdventureRequest }>(
    "/api/adventure",
    async (req, reply): Promise<AdventureResponse> => {
      const { startTrackId, endTrackId, length } = req.body ?? {};
      if (!startTrackId || !endTrackId) {
        return reply
          .code(400)
          .send({ error: "startTrackId and endTrackId are required" }) as never;
      }
      if (!services.plex) {
        return reply.code(503).send({ error: "Plex is not configured" }) as never;
      }
      try {
        return await runAdventure(startTrackId, endTrackId, length);
      } catch (err) {
        return reply.code(502).send({
          error: err instanceof Error ? err.message : String(err),
        }) as never;
      }
    },
  );
}
