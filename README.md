# resonarr

Self-hosted, library-first music discovery in the spirit of Plexamp's Sonic features — but it only ever builds playlists from music you actually own, and anything it recommends that you don't own can be bulk-requested through Lidarr in one click.

- **Design:** [docs/DESIGN.md](docs/DESIGN.md)
- **Roadmap:** [docs/ROADMAP.md](docs/ROADMAP.md)

## Status

Feature-complete against the [roadmap](docs/ROADMAP.md) (Phases 0–7) and
running on Unraid. Sonic features depend on **Plex Pass Sonic Analysis** being
reachable over the API; the `spike:plex` script proves that.

## Features

- **Sonic Sage** — natural-language prompt → an LLM (Claude / OpenAI / Ollama)
  suggests tracks → owned ones become a playlist, the rest go to the basket.
- **Radio** — pick a seed track, get sonically similar owned tracks.
- **Mixes** — several mixes seeded from your recent listening.
- **Discover** — point at a playlist you love (e.g. Liked Songs) and get fresh,
  owned tracks that sound like it but aren't already in it.
- **Sonic Adventure** — a beam-search sonic path between two tracks.
- **Request basket** — everything recommended-but-unowned, Lidarr-validated;
  bulk-request artist-first, and items flip to **done** once Lidarr has the files.
- **Activity log** — what each run did and why requests failed; mirrored to
  `docker logs`.
- **Plex login (optional)** — `AUTH_PLEX=true` gates the app behind a Plex
  login; the app then acts as whoever is signed in (their playlists, history,
  saves). See [Securing remote access](docs/DEPLOY-UNRAID.md#4-securing-remote-access).

## Stack

Node + TypeScript monorepo: Fastify API (`server/`), React + Vite SPA (`web/`),
shared DTO types (`shared/`). One Docker container; SQLite (Node's built-in
`node:sqlite`) on a `/config` volume. Secrets stay server-side — the browser
only talks to `/api`.

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
