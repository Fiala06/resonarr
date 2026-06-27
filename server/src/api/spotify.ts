import type { FastifyInstance, FastifyRequest } from "fastify";
import type {
  SpotifyFileImportRequest,
  SpotifyImportRequest,
  SpotifyImportResult,
  SpotifyStatus,
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
import { runImport } from "../spotify/import.ts";
import type { PlexClient } from "../plex/client.ts";
import { services } from "../services.ts";
import { parseCookie, userPlexClient } from "../auth/service.ts";
import { log } from "../log/service.ts";
import { getSettings } from "../settings/service.ts";

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
    const settings = getSettings();
    const prefix = settings.playlistPrefix ?? "Resonarr";
    const playlistName = prefix ? `${prefix} — ${name}` : name;
    const created = await plex.createPlaylist(playlistName, trackIds);
    return { id: created.playlistId, name: created.title, trackCount: created.trackCount };
  } catch (err) {
    log.warn("spotify", `Playlist creation failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
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

      const { source, name, savePlaylist = false } = req.body ?? {};
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
      const plexPlaylist = savePlaylist
        ? await maybeSavePlaylist(userPlexClient(req), name, result.matched.map((t) => t.id))
        : undefined;

      return {
        sourceName: name,
        spotifyTotal: result.spotifyTotal,
        matched: result.matched,
        misses: result.misses,
        basketedArtists: result.basketedArtists,
        plexPlaylist,
      };
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

      const { tracks, name, savePlaylist = false } = req.body ?? {};
      if (!Array.isArray(tracks) || tracks.length === 0) {
        return reply.code(400).send({ error: "tracks array is required and must not be empty" }) as never;
      }
      if (!name) {
        return reply.code(400).send({ error: "name is required" }) as never;
      }

      const result = await runImport(tracks, name);
      const plexPlaylist = savePlaylist
        ? await maybeSavePlaylist(userPlexClient(req), name, result.matched.map((t) => t.id))
        : undefined;

      return {
        sourceName: name,
        spotifyTotal: result.spotifyTotal,
        matched: result.matched,
        misses: result.misses,
        basketedArtists: result.basketedArtists,
        plexPlaylist,
      };
    },
  );
}
