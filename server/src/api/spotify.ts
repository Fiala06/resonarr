import type { FastifyInstance, FastifyRequest } from "fastify";
import type {
  SpotifyBatchImportRequest,
  SpotifyFileImportRequest,
  SpotifyImportJob,
  SpotifyImportJobDetail,
  SpotifyImportRequest,
  SpotifyImportResult,
  SpotifySync,
  SpotifyStatus,
  SpotifyTrack,
} from "@resonarr/shared";
import { config } from "../config/env.ts";
import {
  buildAuthUrl,
  clearSession,
  clearSpotifySessionCookie,
  exchangeCode,
  getValidToken,
  SPOTIFY_SESSION_COOKIE,
  spotifySessionCookie,
} from "../spotify/auth.ts";
import { SpotifyClient } from "../spotify/client.ts";
import { runImport, spotifyPlaylistTitle } from "../spotify/import.ts";
import type { ImportResult } from "../spotify/import.ts";
import {
  createSync,
  deleteSync,
  getSync,
  getSyncOwner,
  listSyncsForViewer,
  updateSync,
} from "../spotify/sync-store.ts";
import { runSpotifySync } from "../spotify/sync.ts";
import {
  createImportJob,
  deleteImportJob,
  finishJob,
  getImportJobDetail,
  getImportJobOwner,
  listImportJobsForViewer,
  markItemRunning,
  setItemError,
  setItemResult,
} from "../spotify/import-jobs.ts";
import type { PlexClient } from "../plex/client.ts";
import { services } from "../services.ts";
import {
  authEnabled,
  currentUserId,
  ownerAccountId,
  parseCookie,
  requestSession,
  userPlexClient,
} from "../auth/service.ts";
import { log } from "../log/service.ts";

function isHttps(req: FastifyRequest): boolean {
  return (
    req.headers["x-forwarded-proto"] === "https" || req.protocol === "https"
  );
}

function redirectUri(req: FastifyRequest): string {
  const proto = isHttps(req) ? "https" : "http";
  const fwdHost = req.headers["x-forwarded-host"];
  const host =
    (Array.isArray(fwdHost) ? fwdHost[0] : fwdHost) ??
    req.headers.host ??
    "localhost";
  return `${proto}://${host}/api/spotify/auth/callback`;
}

function getSpotifySessionId(req: FastifyRequest): string | undefined {
  return parseCookie(req.headers.cookie, SPOTIFY_SESSION_COOKIE);
}

async function maybeSavePlaylist(
  plex: PlexClient,
  name: string,
  trackIds: string[],
): Promise<SpotifyImportResult["plexPlaylist"]> {
  if (trackIds.length === 0) return undefined;
  try {
    const created = await plex.createPlaylist(spotifyPlaylistTitle(name), trackIds);
    return { id: created.playlistId, name: created.title, trackCount: created.trackCount };
  } catch (err) {
    log.warn("spotify", `Playlist creation failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

/** The per-request bits finishImport needs, captured so it can run detached. */
interface ImportDeps {
  plex: PlexClient;
  ownerId: string | null;
  ownerToken: string | null;
}

async function importDepsFromReq(req: FastifyRequest): Promise<ImportDeps> {
  return {
    plex: userPlexClient(req),
    ownerId: await currentUserId(req),
    ownerToken: requestSession(req)?.token ?? null,
  };
}

/**
 * Shared tail for the import routes: optionally save the matched tracks as a
 * Plex playlist and, when keepInSync is set, register a background sync that
 * keeps adding the still-unmatched tracks as they arrive in the Plex library.
 * Takes captured deps (not the request) so it can run after the HTTP response.
 */
async function finishImportCore(
  deps: ImportDeps,
  opts: {
    name: string;
    source: string;
    savePlaylist: boolean;
    keepInSync: boolean;
    intervalDays?: number;
  },
  result: ImportResult,
): Promise<SpotifyImportResult> {
  const plexPlaylist =
    opts.savePlaylist || opts.keepInSync
      ? await maybeSavePlaylist(deps.plex, opts.name, result.matched.map((t) => t.id))
      : undefined;

  let sync: SpotifySync | undefined;
  if (opts.keepInSync) {
    sync = createSync(
      {
        name: opts.name,
        source: opts.source,
        plexPlaylistId: plexPlaylist?.id,
        matchedCount: result.matched.length,
        pending: result.misses,
        intervalDays: opts.intervalDays,
      },
      { ownerId: deps.ownerId, ownerToken: deps.ownerToken },
    );
  }

  return {
    sourceName: opts.name,
    spotifyTotal: result.spotifyTotal,
    matched: result.matched,
    misses: result.misses,
    basketedArtists: result.basketedArtists,
    plexPlaylist,
    sync,
  };
}

async function finishImport(
  req: FastifyRequest,
  opts: {
    name: string;
    source: string;
    savePlaylist: boolean;
    keepInSync: boolean;
    intervalDays?: number;
  },
  result: ImportResult,
): Promise<SpotifyImportResult> {
  return finishImportCore(await importDepsFromReq(req), opts, result);
}

/**
 * Process a batch import detached from the HTTP request: each playlist is matched
 * and saved in turn, with the job row updated after every one so the client can
 * poll progress. Runs to completion regardless of whether the browser is open.
 */
async function processImportJob(
  jobId: string,
  deps: ImportDeps,
  playlists: { name: string; tracks: SpotifyTrack[] }[],
  opts: { savePlaylist: boolean; keepInSync: boolean; intervalDays?: number },
): Promise<void> {
  for (let i = 0; i < playlists.length; i++) {
    const pl = playlists[i];
    if (!pl) continue;
    markItemRunning(jobId, i);
    try {
      const result = await runImport(pl.tracks, pl.name);
      const finished = await finishImportCore(
        deps,
        { name: pl.name, source: "file", ...opts },
        result,
      );
      setItemResult(jobId, i, finished);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn("spotify", `Import job ${jobId} playlist "${pl.name}" failed: ${msg}`);
      setItemError(jobId, i, msg);
    }
  }
  finishJob(jobId);
}

/** May the request's user see this import job? (Own it, or be the server owner.) */
async function canViewJob(req: FastifyRequest, id: string): Promise<boolean> {
  const owner = getImportJobOwner(id);
  if (owner === undefined) return false; // no such job
  if (!authEnabled()) return true;
  const viewerId = await currentUserId(req);
  if (!viewerId) return false;
  if (viewerId === (await ownerAccountId())) return true;
  return owner === viewerId;
}

/** May the request's user manage this sync? (Own it, or be the server owner.) */
async function canManageSync(req: FastifyRequest, id: string): Promise<boolean> {
  if (!getSync(id)) return false;
  if (!authEnabled()) return true;
  const viewerId = await currentUserId(req);
  if (!viewerId) return false;
  if (viewerId === (await ownerAccountId())) return true;
  return getSyncOwner(id)?.ownerId === viewerId;
}

export function registerSpotifyRoutes(app: FastifyInstance): void {
  // ── Auth ────────────────────────────────────────────────────────────────────

  /** Returns the current Spotify connection status. */
  app.get("/api/spotify/auth/status", async (req, reply): Promise<SpotifyStatus> => {
    if (!config.spotify) return { configured: false, connected: false };
    const token = await getValidToken(getSpotifySessionId(req));
    if (!token) return { configured: true, connected: false };
    return {
      configured: true,
      connected: true,
      user: { id: token.userId, name: token.userName },
    };
  });

  /** Redirects the browser to Spotify's OAuth consent screen. */
  app.get("/api/spotify/auth/start", async (req, reply) => {
    if (!config.spotify) {
      return reply.code(503).send({ error: "Spotify is not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env" });
    }
    const { authUrl } = buildAuthUrl(redirectUri(req));
    return reply.redirect(authUrl, 302);
  });

  /** Spotify redirects here after the user grants (or denies) access. */
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/api/spotify/auth/callback",
    async (req, reply) => {
      const { code, state, error } = req.query;

      if (error || !code || !state) {
        log.warn("spotify", `OAuth denied or missing params: ${error ?? "no code/state"}`);
        return reply.redirect("/#spotify", 302);
      }

      try {
        const sessionId = await exchangeCode(code, state);
        reply.header("Set-Cookie", spotifySessionCookie(sessionId, isHttps(req)));
        log.info("spotify", "Spotify connected");
      } catch (err) {
        log.warn("spotify", `Token exchange failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      return reply.redirect("/#spotify", 302);
    },
  );

  /** Disconnects the Spotify session. */
  app.delete("/api/spotify/auth/logout", async (req, reply): Promise<{ ok: true }> => {
    const sid = getSpotifySessionId(req);
    if (sid) clearSession(sid);
    reply.header("Set-Cookie", clearSpotifySessionCookie());
    return { ok: true };
  });

  // ── Data ────────────────────────────────────────────────────────────────────

  /** Lists the user's Spotify playlists. */
  app.get("/api/spotify/playlists", async (req, reply) => {
    const token = await getValidToken(getSpotifySessionId(req));
    if (!token) return reply.code(401).send({ error: "Not connected to Spotify" });
    try {
      const client = new SpotifyClient(token);
      return await client.getPlaylists();
    } catch (err) {
      return reply.code(502).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /** Imports a Spotify source (liked songs or a playlist) into Plex. */
  app.post<{ Body: SpotifyImportRequest }>(
    "/api/spotify/import",
    async (req, reply): Promise<SpotifyImportResult> => {
      const token = await getValidToken(getSpotifySessionId(req));
      if (!token)
        return reply.code(401).send({ error: "Not connected to Spotify" }) as never;

      if (!services.plex)
        return reply.code(503).send({ error: "Plex is not configured" }) as never;

      const { source, name, savePlaylist = false, keepInSync = false, intervalDays } =
        req.body ?? {};
      if (!source || !name) {
        return reply.code(400).send({ error: "source and name are required" }) as never;
      }

      let spotifyTracks;
      try {
        const client = new SpotifyClient(token);
        spotifyTracks =
          source === "liked"
            ? await client.getLikedTracks()
            : await client.getPlaylistTracks(source);
      } catch (err) {
        return reply.code(502).send({
          error: `Spotify fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        }) as never;
      }

      const result = await runImport(spotifyTracks, name);
      return finishImport(
        req,
        { name, source, savePlaylist, keepInSync, intervalDays },
        result,
      );
    },
  );

  /**
   * Import from a pre-parsed Spotify data-export file. No Spotify account or
   * Premium subscription required — the browser parses the JSON and sends the
   * track list directly.
   */
  app.post<{ Body: SpotifyFileImportRequest }>(
    "/api/spotify/import/tracks",
    async (req, reply): Promise<SpotifyImportResult> => {
      if (!services.plex)
        return reply.code(503).send({ error: "Plex is not configured" }) as never;

      const { tracks, name, savePlaylist = false, keepInSync = false, intervalDays } =
        req.body ?? {};
      if (!Array.isArray(tracks) || tracks.length === 0) {
        return reply.code(400).send({ error: "tracks array is required and must not be empty" }) as never;
      }
      if (!name) {
        return reply.code(400).send({ error: "name is required" }) as never;
      }

      const result = await runImport(tracks, name);
      return finishImport(
        req,
        { name, source: "file", savePlaylist, keepInSync, intervalDays },
        result,
      );
    },
  );

  /**
   * Import one or more playlists as a detached server-side job. Responds 202 with
   * the job immediately; the work continues even if the browser is closed. Poll
   * GET /api/spotify/import/jobs/:id for progress and results.
   */
  app.post<{ Body: SpotifyBatchImportRequest }>(
    "/api/spotify/import/batch",
    async (req, reply): Promise<SpotifyImportJob> => {
      if (!services.plex)
        return reply.code(503).send({ error: "Plex is not configured" }) as never;

      const { playlists, savePlaylist = false, keepInSync = false, intervalDays } =
        req.body ?? {};
      const clean = (Array.isArray(playlists) ? playlists : []).filter(
        (p) =>
          p &&
          typeof p.name === "string" &&
          p.name &&
          Array.isArray(p.tracks) &&
          p.tracks.length > 0,
      );
      if (clean.length === 0) {
        return reply
          .code(400)
          .send({ error: "playlists array is required and each must have tracks" }) as never;
      }

      const deps = await importDepsFromReq(req);
      const job = createImportJob(clean.map((p) => p.name), deps.ownerId);

      // Detached on purpose — closing the tab must not interrupt the import.
      void processImportJob(job.id, deps, clean, { savePlaylist, keepInSync, intervalDays });

      return reply.code(202).send(job) as never;
    },
  );

  /** Recent import jobs visible to this user (history + in-progress). */
  app.get("/api/spotify/import/jobs", async (req): Promise<SpotifyImportJob[]> => {
    if (!authEnabled()) return listImportJobsForViewer(null, false);
    const viewerId = await currentUserId(req);
    const isOwner = viewerId !== null && viewerId === (await ownerAccountId());
    return listImportJobsForViewer(viewerId, isOwner);
  });

  /** One import job with its full per-playlist results. */
  app.get<{ Params: { id: string } }>(
    "/api/spotify/import/jobs/:id",
    async (req, reply): Promise<SpotifyImportJobDetail> => {
      if (!(await canViewJob(req, req.params.id))) {
        return reply.code(404).send({ error: "Not found" }) as never;
      }
      const detail = getImportJobDetail(req.params.id);
      if (!detail) return reply.code(404).send({ error: "Not found" }) as never;
      return detail;
    },
  );

  /** Remove an import job from history. */
  app.delete<{ Params: { id: string } }>(
    "/api/spotify/import/jobs/:id",
    async (req, reply): Promise<{ ok: true }> => {
      if (!(await canViewJob(req, req.params.id))) {
        return reply.code(404).send({ error: "Not found" }) as never;
      }
      deleteImportJob(req.params.id);
      return { ok: true };
    },
  );

  // ── Ongoing syncs ─────────────────────────────────────────────────────────

  /** List the background Spotify→Plex syncs visible to this user. */
  app.get("/api/spotify/syncs", async (req): Promise<SpotifySync[]> => {
    if (!authEnabled()) return listSyncsForViewer(null, false);
    const viewerId = await currentUserId(req);
    const isOwner = viewerId !== null && viewerId === (await ownerAccountId());
    return listSyncsForViewer(viewerId, isOwner);
  });

  /** Enable/disable a sync and/or change its re-check cadence. */
  app.put<{ Params: { id: string }; Body: { enabled?: boolean; intervalDays?: number } }>(
    "/api/spotify/syncs/:id",
    async (req, reply): Promise<SpotifySync> => {
      if (!(await canManageSync(req, req.params.id))) {
        return reply.code(404).send({ error: "Not found" }) as never;
      }
      const updated = updateSync(req.params.id, req.body ?? {});
      if (!updated) return reply.code(404).send({ error: "Not found" }) as never;
      return updated;
    },
  );

  /** Delete a sync (leaves the Plex playlist in place). */
  app.delete<{ Params: { id: string } }>(
    "/api/spotify/syncs/:id",
    async (req, reply): Promise<{ ok: true }> => {
      if (!(await canManageSync(req, req.params.id))) {
        return reply.code(404).send({ error: "Not found" }) as never;
      }
      deleteSync(req.params.id);
      return { ok: true };
    },
  );

  /** Run a backfill now (check the library for newly-available tracks). */
  app.post<{ Params: { id: string } }>(
    "/api/spotify/syncs/:id/run",
    async (req, reply): Promise<SpotifySync> => {
      if (!(await canManageSync(req, req.params.id))) {
        return reply.code(404).send({ error: "Not found" }) as never;
      }
      if (!services.plex) {
        return reply.code(503).send({ error: "Plex is not configured" }) as never;
      }
      return runSpotifySync(req.params.id);
    },
  );
}
