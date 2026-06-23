# resonarr

Self-hosted, library-first music discovery in the spirit of Plexamp's Sonic features — but it only ever builds playlists from music you actually own, and anything it recommends that you don't own can be bulk-requested through Lidarr in one click.

- **Design:** [docs/DESIGN.md](docs/DESIGN.md)
- **Roadmap:** [docs/ROADMAP.md](docs/ROADMAP.md)

## Status

Phase 0 — scaffold + connectivity spikes. The sonic features depend on Plex
Pass Sonic Analysis being reachable over the API; the Plex spike proves that
before anything is built on top of it.

## Stack

Node + TypeScript monorepo: Fastify API (`server/`), React + Vite SPA (`web/`),
shared DTO types (`shared/`). One Docker container; SQLite on a `/config`
volume (Phase 1+). Secrets stay server-side — the browser only talks to `/api`.

## Getting started

Requires **Node 20+** (and npm). Docker is optional for local dev.

```sh
# 1. Configure secrets (never committed)
cp .env.example .env
#    then edit .env: PLEX_URL/PLEX_TOKEN, LIDARR_URL/LIDARR_API_KEY

# 2. Install workspace deps
npm install

# 3. Run the Phase 0 connectivity spikes (the go/no-go gate)
npm run spike:plex      # proves Plex sonic 'nearest' returns neighbors
npm run spike:lidarr    # proves Lidarr lookup + profiles are reachable

# 4. Run the app in dev (two terminals)
npm run dev:server      # Fastify on :8080
npm run dev:web         # Vite on :5173 (proxies /api -> :8080)
```

Type-check everything: `npm run typecheck`.

## Docker

```sh
docker compose up --build   # serves the built SPA + API on :8080
```
