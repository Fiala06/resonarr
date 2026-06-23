# Changelog

All notable changes to Resonarr are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project uses phased pre-1.0 development (see [docs/ROADMAP.md](docs/ROADMAP.md)).

## [Unreleased]

### Phase 1 — Core infrastructure

#### Added
- **SQLite persistence** via Node's built-in `node:sqlite` (no native module,
  no Docker build tooling): a lazily-opened connection on the `/config` volume
  (or `<repo>/.data` in dev), with forward-only migrations tracked by
  `user_version`. Tables: `settings`, `basket_items`, `sessions`, `sonic_cache`.
- **Settings persistence + API**: `GET`/`PUT /api/settings` over a typed
  `AppSettings` (LLM provider/model, own-artist-bias default, Lidarr
  root-folder/quality/metadata-profile targets, playlist prefix). Provider is
  seeded from env on first run, then user-overridable.
- **`GET /api/lidarr/options`**: live Lidarr root folders + quality/metadata
  profiles for the Settings dropdowns (503 with a clear message when Lidarr is
  unreachable).
- **Settings UI**: Status/Settings tabbed shell with a working settings form.
- **Sonic cache** (`SonicService`): SQLite-backed cache in front of Plex
  `nearest`, so repeated sonic queries don't hammer Plex (used from Phase 2).
- **Hardened clients**: 10s request timeouts + clearer error messages on the
  Plex and Lidarr clients; a process-wide services container.

#### Verified
- Typecheck clean; settings round-trip through the API and persist across a
  server restart (on-disk SQLite).

### Phase 0 — Scaffold + connectivity spikes

#### Added
- **Project design docs**: `docs/DESIGN.md` (architecture, feature→API mapping,
  data model, `/api` surface, security model) and `docs/ROADMAP.md` (phased
  build plan 0–7).
- **Monorepo scaffold** (npm workspaces, Node 20+, TypeScript, ESM):
  - `server/` — Fastify API run via `tsx` (no compile step).
  - `web/` — React + Vite SPA (placeholder UI).
  - `shared/` — DTO types shared across the `/api` boundary.
- **Plex client** with the sonic-similarity `nearest` endpoint
  (`Track.sonicallySimilar` equivalent), music-section discovery, and sample
  track fetch.
- **Lidarr client** (v1): system status, root folders, quality/metadata
  profiles, and artist lookup (used to keep hallucinated suggestions out of the
  request basket).
- **`/api/health`** endpoint that probes Plex + Lidarr reachability.
- **Connectivity spikes**: `npm run spike:plex` (go/no-go gate — proves sonic
  `nearest` returns neighbors) and `npm run spike:lidarr`.
- **Config/secrets**: root `.env` loader (`.env.example` provided); Plex token,
  Lidarr API key, and LLM keys stay server-side.
- **Docker**: multi-stage `Dockerfile` (build web bundle → `tsx`-run server) and
  `docker-compose.yml` with a `/config` volume for SQLite (Phase 1+).
- Repo hygiene: `.gitignore`, `.gitattributes` (LF normalization),
  `.dockerignore`.
- **CI**: GitHub Actions workflow publishing the Docker image to
  `ghcr.io/fiala06/resonarr` on every push to `main`.
- **Unraid deploy guide**: `docs/DEPLOY-UNRAID.md` (GHCR pull, container env
  vars, `/config` volume, in-container spike verification).

#### Fixed
- Container crash-loop (`ERR_MODULE_NOT_FOUND` on `./config/env`): **root cause**
  was an over-broad `.dockerignore` pattern (`config`) that excluded
  `server/src/config/` from the build context, so the file was never in the
  image. Anchored the runtime-data ignores to the context root (`/config`) and
  added a Docker build-time guard that fails loudly if source is missing.
  Along the way also hardened the build: pinned deps via committed
  `package-lock.json` (`npm ci`), set the Docker base image to Node 24, and
  used explicit `.ts` import extensions (`allowImportingTsExtensions`) for
  deterministic `tsx` resolution across OSes.

#### Verified
- `npm install`, `npm run typecheck` (clean across all workspaces), server boot,
  and `/api/health` (200) on Node 24 LTS.
- **Phase 0 gate PASSED on real hardware**: deployed to Unraid via the GHCR
  image; `/api/health` green for Plex (Music section) and Lidarr (v3.1.0); the
  Plex sonic `nearest` spike returned coherent sonically-similar tracks on the
  live library. The sonic premise is proven end-to-end.

[Unreleased]: https://github.com/Fiala06/resonarr/commits/main
