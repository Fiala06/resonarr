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
| Persistence | **SQLite** (Node's built-in `node:sqlite`) | Single-file DB on the `/config` volume; no native module to compile in Alpine |
| Shared types | TS package `/shared` | One source of truth for DTOs across server + web |
| Packaging | Single **multi-stage Docker** image | One container on Unraid, one mounted volume |
| LLM | **Pluggable** adapter layer | Claude (default) · OpenAI · local Ollama, user-selectable |

## 3. Repository layout

```
resonarr/
├─ server/            Fastify API (TypeScript)
│  ├─ src/
│  │  ├─ plex/        Plex client + PIN auth: search, nearest, history, playlists
│  │  ├─ lidarr/      Lidarr client: lookup, add artist/album, search, stats
│  │  ├─ llm/         SuggestProvider (suggest/suggestArtists/chat) + Claude/OpenAI/Ollama adapters
│  │  ├─ sage/ radio/ mixes/ discover/ adventure/   discovery features (+ sage/examples)
│  │  ├─ deepcuts/    rarely/never-played rediscovery
│  │  ├─ artistdiscovery/  adjacent-artist discovery → Lidarr basket
│  │  ├─ autoplaylist/ scheduled auto-playlists (Discover Weekly) + in-process scheduler
│  │  ├─ taste/       LLM "taste profile" / Resonarr Wrapped
│  │  ├─ feedback/    like/dislike store + discovery filter
│  │  ├─ matching/    normalize + fuzzy Plex matching
│  │  ├─ basket/      Lidarr request basket (SQLite-backed)
│  │  ├─ auth/        Plex-login sessions + per-request user client
│  │  ├─ log/         activity log service
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

**Auth / access (env, optional):**

| Var | Purpose |
|---|---|
| `AUTH_PLEX` | `true` to require Plex login (acts as the signed-in user) |
| `AUTH_USER`, `AUTH_PASS` | HTTP Basic auth alternative |

**Non-secret prefs (SQLite `settings` table, editable in Settings UI):**
active LLM provider + model, own-artist-bias default, Plex music section id,
Lidarr root folder / quality profile / metadata profile, playlist naming.

A gitignored `.env` (from `.env.example`) holds secrets locally; on Unraid they
become container environment variables.

## 5. Data model (SQLite)

- **settings** — `key`, `value` (non-secret app config; also holds the
  generated Plex client-identifier under `_plexClientId`).
- **basket_items** — Lidarr request basket: `id`, `type` (artist|album),
  `artist`, `album`, `mbid` (resolved via Lidarr lookup), `source`
  (sonic-sage|artist-discovery|manual), `status` (pending|requested|**done**|failed),
  `created_at`. Lookup-verified before insert so hallucinated items can't enter
  the basket. `done` is set when Lidarr's statistics show files on disk.
- **sonic_cache** — cache of Plex `nearest` results keyed by seed track +
  params, with TTL; avoids hammering Plex for repeated queries. Also holds the
  cached Sonic Sage example prompts (`sage:examples`).
- **event_log** — activity log (`ts`, `level`, `source`, `message`, `detail`),
  bounded to the last 1000 rows; mirrored to stdout.
- **auth_sessions** — Plex-login sessions (`id`, `name`, `token`, `expires_at`)
  when `AUTH_PLEX` is enabled. The session `token` lets the app act as the
  signed-in user.
- **profiles** — known Plex users seen by the app (`id`, `name`, `token`).
- **auto_playlists** — scheduled auto-playlist definitions (Discover Weekly):
  `name`, `kind`, `mode` (replace|append), `size`, `interval_days`,
  `new_artists_only`, `enabled`, `plex_playlist_id`, `last_run_at`,
  `next_run_at`, `last_status`.
- **auto_playlist_history** — `(auto_id, track_id, used_at)`; lets successive
  runs of a definition avoid repeating recent picks.
- **feedback** — per-track thumbs (`track_id`, `artist`, `title`, `rating`
  up|down); biases discovery (dislikes hidden, likes hinted to Sage).
- **sessions** — reserved for saved discovery runs (not yet wired up).

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

### Discover (fresh picks from a playlist)
Pick a playlist (e.g. a "Loved" / "Liked Songs" list) → sample seeds evenly
across it → expand each via `nearest` → drop anything already in the playlist →
rank the rest by how many seeds independently surfaced them (sonic consensus).
Every result is owned and new to that playlist. Reuses the Mixes plumbing.

### Sonic Sage
Natural-language prompt → active LLM adapter returns **structured**
`{artist, title, album}` suggestions → fuzzy-match against Plex. Matches become
a playlist; misses are resolved through **Lidarr lookup** and, if real, dropped
into the request basket. Optional **own-artist bias** injects the user's owned
artist list into the prompt to favor artists already in the library.

### Bulk request
Selected basket items submitted to Lidarr **artist-first**: add the artist if
missing (`artist/lookup` → `POST artist` with `searchForMissingAlbums`), else
trigger an `ArtistSearch`. Requests are artist-level for now (album text is
stored/displayed; album-level monitoring is a deferred refinement). Every miss
was already lookup-validated, so requests map to real MusicBrainz entities. A
status refresh re-checks `requested` items against Lidarr download statistics
and flips them to **done** once files are on disk.

### Deep cuts & rediscovery
Owned tracks you rarely or never play, from Plex play data (`viewCount` /
`lastViewedAt`). Two modes: *Buried treasure* (never-played, random sample,
reshuffled each visit) and *Faded favorites* (played 2+ times but not heard in
60+ days, longest-forgotten first). Capped per artist for spread.

### Artist-level discovery → Lidarr
"Artists like the ones you love that you don't own yet." Seeds from your
most-played artists (Plex track play counts), asks the LLM (`suggestArtists`)
for adjacent artists, drops anything you own, and validates each survivor via
**Lidarr lookup** — sequentially, since Lidarr proxies MusicBrainz (~1 req/s) and
a parallel burst gets throttled. Survivors go to the basket (`artist-discovery`
source).

### Discover Weekly (scheduled auto-playlists)
Persisted definitions (`auto_playlists`) refreshed by an **in-process scheduler**
(5-min poll + boot catch-up). Each run seeds from recent listening, expands by
sonic similarity, biases toward newly-added + never-played tracks, drops
dislikes and recent-run repeats (`auto_playlist_history`), and writes to Plex —
**replace** (fresh list each cycle, via `deletePlaylist` + recreate) or
**append** (grow one list). Optional **new-artists-only** excludes artists from
recent listening. Runs as the owner account; failures land in the definition's
status, never throw.

### Taste profile ("Resonarr Wrapped")
Most-played artists (with counts) + library stats → the LLM (`chat`) writes a
one-line "your sound", a summary, and genre/era/vibe chips. The model infers
genres/eras from artist names, so no Plex genre tags are needed.

### Like/dislike feedback loop
Thumbs up/down on track rows, stored in `feedback`. A dislike hides that track
**and its artist** across every sonic-discovery surface (Radio, Mixes, Discover,
Deep Cuts, Discover Weekly) via `filterDisliked`; liked/disliked artists are also
fed into the Sonic Sage prompt.

### Moods & cycling Sage prompts
**Moods** are one-click preset cards that run a mood-tuned Sage generation
(owned-biased) into a saveable playlist — pure reuse of the Sage pipeline.
**Cycling prompts** are personalized "Try one of these" example prompts for
Sonic Sage, LLM-generated from your top artists and cached (`sage:examples`).

### Activity log
A small `log.info/warn/error` service writes structured events (discovery runs,
playlist saves, per-item request outcomes incl. failure reasons) to the bounded
`event_log` table and mirrors them to stdout (so they also appear in
`docker logs`). Surfaced in the **Activity log** view.

## 7. API surface (server `/api`)

```
GET  /api/health                 liveness + Plex/Lidarr reachability
GET  /api/settings               non-secret prefs
PUT  /api/settings               update prefs (provider, bias, profiles…)
GET  /api/library/stats          track/album/artist counts
GET  /api/art?path=              cover-art proxy (token stays server-side)

POST /api/radio                  { seedTrackId } → similar tracks
POST /api/adventure              { startTrackId, endTrackId, length } → path
GET  /api/mixes                  → mix(es) from recent listening
POST /api/discover               { playlistId, newArtistsOnly } → fresh owned picks
GET  /api/deepcuts?mode=         never|faded → rarely/never-played owned tracks
GET  /api/artist-discovery?count= adjacent artists you don't own (Lidarr-validated)
GET  /api/taste-profile          LLM portrait of your listening
POST /api/sage                   { prompt, ownArtistBias, count } → { matches, misses }
GET  /api/sage/examples          personalized example prompts (?refresh=1 rebuilds)

GET  /api/auto-playlists         list scheduled auto-playlists
POST /api/auto-playlists         create a Discover-Weekly definition
PUT  /api/auto-playlists/:id     update (enable/disable, cadence, mode…)
DEL  /api/auto-playlists/:id     delete
POST /api/auto-playlists/:id/run build now (manual refresh)

GET  /api/feedback               list track thumbs
PUT  /api/feedback               set/clear a track's rating

GET  /api/playlists              list audio playlists
POST /api/playlists              { name, trackIds } → create Plex playlist
POST /api/playlists/:id/items    { trackIds } → append to a playlist

GET  /api/basket                 list basket items
POST /api/basket                 add item
POST /api/basket/bulk            add many
DEL  /api/basket/:id             remove item
POST /api/basket/request         bulk submit selected → Lidarr
POST /api/basket/refresh         re-check Lidarr; flip downloaded → done

GET  /api/search/tracks?q=       Plex track search (for seed pickers)
GET  /api/logs                   recent activity log
DEL  /api/logs                   clear the activity log

GET  /api/auth/me                auth state + signed-in user
POST /api/auth/login             start a Plex PIN login
GET  /api/auth/login/:id         poll the PIN; verify + start session
POST /api/auth/logout            end the session
```

Routes that read playlists/history or create playlists run as the signed-in
user (their session token) when `AUTH_PLEX` is on, else as the owner.

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
- **Auth options** (opt-in): `AUTH_PLEX=true` requires a Plex login — anyone
  whose Plex account can read the owner's server is allowed in; sessions are
  opaque, HttpOnly cookies (`Secure` behind HTTPS), and the app then acts as
  the signed-in user. `AUTH_USER`/`AUTH_PASS` provide simpler HTTP Basic auth
  as an alternative. Always pair either with HTTPS (reverse proxy / tunnel /
  VPN — see [DEPLOY-UNRAID.md](DEPLOY-UNRAID.md)).
- Home-LAN by default (auth off). Don't expose the raw HTTP port; prefer
  Tailscale/WireGuard or a TLS reverse proxy.
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
