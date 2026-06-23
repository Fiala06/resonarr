# Changelog

All notable changes to Resonarr are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project uses phased pre-1.0 development (see [docs/ROADMAP.md](docs/ROADMAP.md)).

## [Unreleased]

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

#### Verified
- `npm install`, `npm run typecheck` (clean across all workspaces), server boot,
  and `/api/health` (200) on Node 24 LTS. Live spikes against real Plex/Lidarr
  pending user credentials.

[Unreleased]: https://github.com/Fiala06/resonarr/commits/main
