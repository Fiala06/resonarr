<p align="center">
  <img src="docs/logo.svg" alt="Resonarr" width="360">
</p>

<p align="center">
  Self-hosted, library-first music discovery in the spirit of Plexamp's Sonic features.
</p>

---

Resonarr only ever builds playlists from music you **actually own**, and anything
it recommends that you don't own can be bulk-requested through **Lidarr** in one
click.

Built on **Plex Pass Sonic Analysis**: Resonarr consumes Plex's track-to-track
sonic similarity rather than reinventing audio ML.

- **Design:** [docs/DESIGN.md](docs/DESIGN.md)
- **Roadmap:** [docs/ROADMAP.md](docs/ROADMAP.md)
- **Unraid deploy guide:** [docs/DEPLOY-UNRAID.md](docs/DEPLOY-UNRAID.md)

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
- **Activity log** — what each run did and why requests failed; also in `docker logs`.
- **Plex login (optional)** — gate the app behind a Plex login; it then acts as
  whoever is signed in (their playlists, history, saves).

## How it works

Node + TypeScript monorepo — Fastify API (`server/`), React + Vite SPA (`web/`),
shared DTO types (`shared/`). Ships as **one Docker container**; SQLite (Node's
built-in `node:sqlite`) lives on a mounted `/config` volume. **Secrets stay
server-side** — the browser only ever talks to Resonarr's own `/api`; your Plex
token, Lidarr key, and LLM keys never reach the client.

## Requirements

- A **Plex** server with **Plex Pass** and **Sonic Analysis** run on your music
  library (this is what powers all the sonic features).
- **Lidarr** (optional, but required for the request basket).
- An LLM for Sonic Sage: an **Anthropic** or **OpenAI** API key, or a local
  **Ollama** — also optional; the other features work without it.

## Install (Docker)

The image is published to GHCR on every push to `main`:

```
ghcr.io/fiala06/resonarr:latest
```

**docker compose** (recommended):

```yaml
services:
  resonarr:
    image: ghcr.io/fiala06/resonarr:latest
    container_name: resonarr
    ports:
      - "8080:8080"
    environment:
      PLEX_URL: http://192.168.1.10:32400      # LAN IP, not localhost
      PLEX_TOKEN: xxxxxxxxxxxxxxxxxxxx
      LIDARR_URL: http://192.168.1.10:8686
      LIDARR_API_KEY: xxxxxxxxxxxxxxxxxxxx
      LLM_PROVIDER: claude
      ANTHROPIC_API_KEY: sk-ant-...
    volumes:
      - ./config:/config                       # SQLite DB + settings
    restart: unless-stopped
```

```sh
docker compose up -d
```

Then open `http://<host>:8080`.

> ⚠️ Inside a container, `localhost` is the container itself — use the **LAN IP**
> of the machine running Plex / Lidarr (often your server's own IP).

**Unraid:** see the step-by-step [Unraid deploy guide](docs/DEPLOY-UNRAID.md)
(Community-Apps-style template, ports, paths, and updating).

## Configuration

All configuration is via **environment variables**. Only `PLEX_URL` /
`PLEX_TOKEN` are strictly required to boot; the rest unlock features.

### Plex & Lidarr

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PLEX_URL` | ✅ | — | e.g. `http://192.168.1.10:32400`. Not `localhost`. |
| `PLEX_TOKEN` | ✅ | — | [Finding your Plex token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/) |
| `LIDARR_URL` | for basket | — | e.g. `http://192.168.1.10:8686` |
| `LIDARR_API_KEY` | for basket | — | Lidarr → Settings → General → API Key |

### LLM (Sonic Sage)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `LLM_PROVIDER` | for Sage | `claude` | `claude` \| `openai` \| `ollama` |
| `ANTHROPIC_API_KEY` | if `claude` | — | |
| `OPENAI_API_KEY` | if `openai` | — | |
| `OLLAMA_URL` | if `ollama` | `http://localhost:11434` | local endpoint |

### Auth & access (optional)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `AUTH_PLEX` | no | off | `true` requires a Plex login; the app then acts as the signed-in user. **Pair with HTTPS.** |
| `AUTH_USER` / `AUTH_PASS` | no | off | HTTP Basic auth alternative (set both). |

### Advanced

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | no | `8080` | server listen port |
| `DATA_DIR` | no | `/config` | where the SQLite DB + settings live |

The remaining preferences (active LLM model, own-artist bias, Lidarr root folder
/ quality / metadata profiles, playlist name prefix) are set in the **Settings**
page and stored in SQLite — no env var needed.

## Security / exposing it

On a trusted LAN you can leave it open. **Before exposing Resonarr beyond your
LAN**, secure it — it holds Plex tokens. Best options, strongest first:

1. **Tailscale / WireGuard** — reach it over a private VPN; nothing public.
2. **Cloudflare Tunnel + Access** — public URL, no open ports, login at the edge.
3. **Reverse proxy** (SWAG / NPM / Traefik / Caddy) for **HTTPS**, plus
   `AUTH_PLEX=true` as an app-level login.

Always pair `AUTH_PLEX` with HTTPS — see
[Securing remote access](docs/DEPLOY-UNRAID.md#4-securing-remote-access).

## Local development

Requires **Node 20+**.

```sh
# 1. Configure secrets (never committed)
cp .env.example .env        # then edit it

# 2. Install workspace deps
npm install

# 3. (Optional) Connectivity spikes — the Phase 0 go/no-go gate
npm run spike:plex          # proves Plex sonic 'nearest' returns neighbors
npm run spike:lidarr        # proves Lidarr lookup + profiles are reachable

# 4. Run in dev (two terminals)
npm run dev:server          # Fastify on :8080
npm run dev:web             # Vite on :5173 (proxies /api -> :8080)
```

Type-check everything: `npm run typecheck`. Build the SPA: `npm run build`.
Run the whole stack in Docker from source: `docker compose up --build`.
