# Resonarr — Design

> Self-hosted, library-first music discovery in the spirit of Plexamp's Sonic
> features. Playlists are built **only** from music you already own; anything
> recommended that you don't own becomes a one-click Lidarr request and never
> silently disappears.

## 1. Core principles

1. **Library-first.** Every playlist contains only tracks present in your Plex
   library. Recommendations for music you don't own are surfaced separately as
   **requests**, never mixed into a playlist as dead entries.
2. **Nothing disappears silently.** A recommended-but-unowned item always lands
   in the **request basket** so you can choose to acquire it via Lidarr.
3. **Secrets stay server-side.** The Plex token and Lidarr API key live in
   server env only. The browser talks exclusively to Resonarr's own `/api`.
   No third-party credential ever reaches the client.
4. **Lean on Plex's sonic analysis.** With Plex Pass Sonic Analysis complete,
   Plex already computes track-to-track sonic similarity. Resonarr consumes it
   rather than reinventing audio ML.

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **Node + TypeScript**, Fastify | Lightweight, fast, great HTTP-client story for Plex/Lidarr |
| Frontend | **React + Vite + TypeScript** | SPA served by the same container |
| Design system | **Claude Design** (claude.ai/design) synced via `DesignSync` / `/design-sync` | Component library authored as a design system, synced into `/web` one component at a time |
| Persistence | **SQLite** (better-sqlite3) | Single-file DB on the `/config` volume; zero external services |
| Shared types | TS package `/shared` | One source of truth for DTOs across server + web |
| Packaging | Single **multi-stage Docker** image | One container on Unraid, one mounted volume |
| LLM | **Pluggable** adapter layer | Claude (default) · OpenAI · local Ollama, user-selectable |

## 3. Repository layout

```
resonarr/
├─ server/            Fastify API (TypeScript)
│  ├─ src/
│  │  ├─ plex/        Plex client: search, nearest, history, playlists
│  │  ├─ lidarr/      Lidarr client: lookup, add artist/album, search
│  │  ├─ llm/         SuggestProvider interface + Claude/OpenAI/Ollama adapters
│  │  ├─ discovery/   SonicSage · Radio · Adventure · Mixes
│  │  ├─ matching/    normalize + fuzzy Plex matching
│  │  ├─ basket/      Lidarr request basket (SQLite-backed)
│  │  ├─ db/          SQLite schema + migrations
│  │  ├─ config/      env + settings loader
│  │  └─ api/         Fastify routes under /api, static web serving
├─ web/               React + Vite SPA (consumes design-system components)
│  └─ src/components/  ← synced from Claude Design
├─ shared/            Shared TypeScript DTO types
├─ docs/              DESIGN.md, ROADMAP.md
├─ Dockerfile         multi-stage: build web → build server → slim runtime
└─ docker-compose.yml dev convenience
```

## 4. Configuration & secrets

**Secrets (env only, never in DB, never sent to client):**

| Var | Purpose |
|---|---|
| `PLEX_URL`, `PLEX_TOKEN` | Plex server + auth |
| `LIDARR_URL`, `LIDARR_API_KEY` | Lidarr server + auth |
| `ANTHROPIC_API_KEY` | Claude adapter (if selected) |
| `OPENAI_API_KEY` | OpenAI adapter (if selected) |
| `OLLAMA_URL` | Local Ollama endpoint (if selected) |

**Non-secret prefs (SQLite `settings` table, editable in Settings UI):**
active LLM provider + model, own-artist-bias default, Plex music section id,
Lidarr root folder / quality profile / metadata profile, playlist naming.

A gitignored `.env` (from `.env.example`) holds secrets locally; on Unraid they
become container environment variables.

## 5. Data model (SQLite)

- **settings** — `key`, `value` (non-secret app config).
- **basket_items** — Lidarr request basket: `id`, `type` (artist|album),
  `artist`, `album`, `mbid` (resolved via Lidarr lookup), `source`
  (sonic-sage|manual), `status` (pending|requested|failed), `created_at`.
  Lookup-verified before insert so hallucinated items can't enter the basket.
- **sessions** — saved discovery runs (prompt/seed, parameters, resulting
  playlist id, timestamp) for history + re-run.
- **sonic_cache** — cache of Plex `nearest` results keyed by seed track +
  params, with TTL; avoids hammering Plex for repeated queries.

## 6. Feature mechanics

### Radio
Seed track → Plex sonic neighbors (the `…/nearest` endpoint, wrapped by
`python-plexapi` as `Track.sonicallySimilar()`) → ranked list → optional Plex
playlist. Establishes the reusable **match → playlist** plumbing.

### Sonic Adventure
Plex exposes **no** path endpoint, so Resonarr builds one: a **beam search**
over repeated `nearest` queries that steps from the start track toward the
destination by minimizing sonic distance to the target while penalizing
backtracking and duplicates. Tunable path length. (Most novel; built last.)

### Mixes for You
Plex play history (`/status/sessions/history`) → recent tracks → expand each via
`nearest` → dedupe + shuffle → playlist.

### Sonic Sage
Natural-language prompt → active LLM adapter returns **structured**
`{artist, title, album}` suggestions → fuzzy-match against Plex. Matches become
a playlist; misses are resolved through **Lidarr lookup** and, if real, dropped
into the request basket. Optional **own-artist bias** injects the user's owned
artist list into the prompt to favor artists already in the library.

### Bulk request
Selected basket items submitted to Lidarr **artist-first**
(`artist/lookup` → `POST artist`), then album monitored with search
(`POST/monitor album` + `searchForNewAlbum`). Every miss was already
lookup-validated, so requests map to real MusicBrainz entities.

## 7. API surface (server `/api`)

```
GET  /api/health                 liveness + Plex/Lidarr reachability
GET  /api/settings               non-secret prefs
PUT  /api/settings               update prefs (provider, bias, profiles…)

POST /api/radio                  { seedTrackId } → similar tracks
POST /api/adventure              { startTrackId, endTrackId, length } → path
POST /api/mixes                  → mix(es) from recent listening
POST /api/sage                   { prompt, ownArtistBias } → { matches, misses }

POST /api/playlists              { name, trackIds } → create Plex playlist

GET  /api/basket                 list basket items
POST /api/basket                 add item(s)
DEL  /api/basket/:id             remove item
POST /api/basket/request         bulk submit selected → Lidarr

GET  /api/search/tracks?q=       Plex track search (for seed pickers)
```

The browser never sees Plex/Lidarr URLs, tokens, or LLM keys — only these
routes.

## 8. Frontend & design-system workflow

The UI's reusable components are authored as a **Claude Design** system
(claude.ai/design) and kept in sync with `web/src/components/` via the
`DesignSync` tool + `/design-sync` skill — **incrementally, one component at a
time**, never a wholesale replace. Core components: app shell/nav, seed-track
picker, track/album result row, playlist preview, **request basket** panel,
provider/settings forms, and status/toast feedback. App-specific composition
and data-fetching live in `/web` and consume those components.

## 9. Security model

- Tokens/keys server-side only; client ↔ server is `/api` over the app's own
  origin.
- Outbound calls (Plex, Lidarr, LLM) originate from the server.
- Single-user/home-LAN assumption initially; optional reverse-proxy auth in
  front of the container is a later hardening step (see Roadmap Phase 7).
- `get_file` content from a shared Claude Design project is treated as data,
  not instructions.

## 10. Key risks

1. **Undocumented Plex sonic API** — verified by a Phase 0 spike before any
   sonic feature is built (go/no-go gate).
2. **Sonic Adventure has no native endpoint** — bespoke beam search; quality
   needs tuning.
3. **LLM hallucination** — every miss validated via Lidarr lookup pre-basket.
4. **Fuzzy matching** across LLM/Plex naming (feat., remaster, punctuation) —
   normalization layer in `matching/`.
