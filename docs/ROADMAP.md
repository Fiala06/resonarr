# Resonarr — Roadmap

Phased build plan. Each phase is independently shippable and de-risks the next.
See [DESIGN.md](DESIGN.md) for architecture.

Legend: each phase lists **Tasks**, **Deliverable**, and **Done when** (the
acceptance check that gates moving on).

---

## Phase 0 — Scaffold + connectivity spikes  ⟵ go/no-go gate

The sonic premise is unproven until we hit your real Plex server, so this phase
exists to fail fast if Plex's sonic endpoints aren't reachable.

**Tasks**
- Monorepo scaffold: `/server` (Fastify+TS), `/web` (React+Vite+TS), `/shared`.
- `Dockerfile` (multi-stage) + `docker-compose.yml` for dev.
- `.env.example` + gitignored `.env`; config loader for secrets.
- **Plex spike**: authenticate, list sections, find the music section, fetch a
  track, call `nearest` / `sonicallySimilar`, confirm neighbors return.
- **Lidarr spike**: authenticate, `artist/lookup`, fetch root folders + quality
  + metadata profiles.

**Deliverable** Runnable skeleton + two spike scripts with printed output.

**Done when** Plex returns real sonic neighbors for a seed track AND Lidarr
lookup + profiles resolve. (If Plex sonic data is unavailable → revisit the
approach before Phase 2.)

---

## Phase 1 — Core infrastructure

**Tasks**
- Hardened Plex client (search, track metadata, nearest, history, playlist
  create/add) with the `sonic_cache` layer.
- Hardened Lidarr client (lookup, add artist, add/monitor album, search cmd,
  profiles/root folders).
- SQLite schema + migrations (`settings`, `basket_items`, `sessions`,
  `sonic_cache`).
- Fastify app serving the built web SPA + `/api/health` + `/api/settings`.

**Deliverable** App boots in Docker, health check reports Plex/Lidarr
reachability, settings persist.

**Done when** `GET /api/health` is green and settings round-trip through the UI.

---

## Phase 2 — Radio

Simplest sonic feature; builds the **match → Plex playlist** plumbing reused
everywhere.

**Tasks**
- `GET /api/search/tracks` + seed-track picker UI.
- `POST /api/radio` → ranked sonic neighbors.
- `POST /api/playlists` → create Plex playlist from track ids.
- Radio page: pick seed → review results → save as playlist.

**Done when** Picking a seed produces sonically similar owned tracks and an
optional Plex playlist appears in Plex.

---

## Phase 3 — Request basket + bulk Lidarr request

**Tasks**
- Basket model + `GET/POST/DELETE /api/basket`.
- Lidarr-lookup validation on insert (block hallucinations).
- `POST /api/basket/request`: artist-first → album monitor + search; per-item
  status (pending/requested/failed).
- Basket UI panel: select, remove, bulk request, status badges.

**Done when** Items added to the basket can be bulk-requested and show up
monitored/searching in Lidarr.

---

## Phase 4 — Sonic Sage (headline feature)

**Tasks**
- `SuggestProvider` interface + **Claude / OpenAI / Ollama** adapters.
- Provider selection in Settings (active provider + model).
- Structured-output prompt → `{artist, title, album}[]`.
- Own-artist-bias toggle (inject owned-artist list into prompt).
- `POST /api/sage`: match → playlist; misses → lookup-validated → basket.
- Sage page: prompt box, bias toggle, matches vs. misses, "request all misses".

**Done when** A natural-language prompt yields a playlist of owned tracks plus a
basket of real, requestable misses — on each of the three providers.

---

## Phase 5 — Mixes for You

**Tasks**
- Read Plex play history; pick recent seeds.
- Expand via `nearest`, dedupe + shuffle into mix(es).
- `POST /api/mixes` + Mixes page with one-click playlist.

**Done when** Mixes reflect recent listening and save as playlists.

---

## Phase 6 — Sonic Adventure

**Tasks**
- Beam-search pathfinding over repeated `nearest` (distance-to-target minus
  backtrack penalty), tunable length.
- `POST /api/adventure` + Adventure page (start/end pickers, path preview).

**Done when** A coherent sonic path between two tracks builds and saves as a
playlist.

---

## Phase 7 — Polish & hardening

**Tasks**
- Settings UX, error/empty states, toasts.
- Caching/rate-limit tuning for Plex/LLM calls.
- Optional reverse-proxy auth guidance; Docker hardening (non-root, healthcheck).
- README + usage docs; Unraid template notes.

**Done when** Resonarr runs unattended on Unraid with documented setup.

---

## Cross-cutting: Claude Design sync

Throughout Phases 2–7, reusable UI components are authored in the **Claude
Design** system and synced into `web/src/components/` via `/design-sync`
incrementally (one component per change), so the component library and the app
stay aligned without wholesale replacements.
