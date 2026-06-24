# Resonarr — Roadmap

What's left and what's being considered. The original Phase 0–7 build plan has
shipped — see [DESIGN.md](DESIGN.md) for the architecture and git history for how
it came together.

Legend: **Next** = likely to build soon · **Ideas** = candidates, not committed.

What makes Resonarr different from Plexamp: it's **library-first**, it reads
**Plex sonic** data, it has a **pluggable LLM**, and — uniquely — it can actually
*acquire* music via **Lidarr**. The strongest ideas lean on all four, especially
Lidarr: Plexamp can recommend music but it can't go get it.

---

## Recently shipped

- **Discover Weekly (scheduled auto-playlists)** — a "Weekly" tab to define
  Discover-Weekly-style playlists that rebuild on a cadence. An in-process
  scheduler (`startScheduler`, 5-min poll + boot catch-up) refreshes due
  definitions; each seeds from recent listening, expands by sonic similarity,
  biases toward newly-added + never-played tracks, and avoids repeats via a
  per-definition track history. **replace** mode rebuilds a fresh list each
  cycle; **append** grows one playlist. Manual "Refresh now" for testing.
  (`server/src/autoplaylist/`, migration v6, `WeeklyView`.) v1 runs as the
  owner account (per-user scheduling is a later refinement).
- **Artist-level discovery → Lidarr** — an "Artists" tab: seeds from your
  most-played artists (Plex track play counts), asks the LLM for adjacent
  artists you don't own, validates every candidate against Lidarr (the
  hallucination guard), and drops them in the basket with a distinct
  `artist-discovery` source. Each row carries the LLM's one-line reason +
  audition links. (`server/src/artistdiscovery/`, `ArtistDiscoveryView`, new
  `suggestArtists` on the LLM providers.)
- **Deep cuts & rediscovery** — a "Deep Cuts" tab with two modes: *Buried
  treasure* (owned tracks never played, reshuffled each visit) and *Faded
  favorites* (proven favorites not heard in 60+ days, longest-forgotten first).
  Pure play history — Plex `viewCount` / `lastViewedAt`, capped per artist for
  spread, saveable as a playlist. (`server/src/deepcuts/`, `DeepCutsView`.)
- **Audition links** — YouTube + MusicBrainz links on basket rows and Sonic
  Sage misses (see Ideas → Grow the library).

---

## Next

### Spotify import
Import Spotify playlists (e.g. Liked Songs) into Plex. Pull the playlist via the
Spotify API, fuzzy-match each track to the Plex library (reusing `matching/`):
owned tracks → a Plex playlist, misses → the request basket via Lidarr lookup.
Needs a Spotify OAuth flow + a new server-side secret.

---

## Ideas

### Grow & complete the library (Lidarr synergy)

- ~~**Audition links for unowned items** *(quick win)*~~ — ✅ **shipped.**
  `AuditionLinks` component adds **YouTube** (search URL — "let me hear it") and
  **MusicBrainz** links to basket rows and Sonic Sage misses. Basket rows use
  the resolved artist `mbid` for a direct MB page; Sage misses fall back to an
  MB artist search. Pure outbound links — no API or secrets. (Album-level MB
  links would need a release-group id, not stored yet, so v1 is artist-direct +
  a YouTube track search. Bandcamp/Last.fm could be added similarly later.)
- **New releases from artists you play** — watch owned artists, surface new
  albums, and queue them to Lidarr + a "New from your artists" playlist once
  downloaded. Lidarr monitors releases but doesn't know *which* artists you
  actually listen to; play history does the filtering.
- **Discography completeness / library health** — "you have 7 of 11 albums by X"
  → one-click fill the gaps via the basket. Also flag low-bitrate tracks for
  quality upgrades. Pure Lidarr / MusicBrainz synergy; collector appeal.

### Rediscover & revisit

- **On-this-day / time machine** — "what you were into last summer", decade or
  year-added playlists. Nostalgia is core to music lovers and nearly free to
  build from date-added / play history.
- **Discover: "new artists only"** — optional mode that excludes candidates whose
  artist already appears in the source, for true new-artist discovery rather than
  new-tracks-by-known-artists.

### Smarter, learning recommendations

- **Like/dislike feedback loop** — thumbs on any track that bias future
  Sage/Radio/Discover (boost approved sonic neighborhoods, suppress rejected
  ones). Turns one-shot discovery into a system that learns your taste; could
  write back to Plex star ratings. The sleeper — it makes everything else better.
- **Mood / activity presets** — focus, workout, dinner, wind-down — generated
  from Plex mood/genre tags + sonic similarity with smart ordering. Low effort,
  high everyday use.
- **Cycling prompt examples in Sonic Sage** — like Plexamp's "Try one of these":
  a rotating set of ~10 example prompts seeded from the user's play history / top
  artists (e.g. "melancholic, haunting vocals, reminiscent of Evanescence"). Best
  seeded from the *taste profile* below.

### Insight & delight

- **Taste profile + "Resonarr Wrapped"** — analyze listening into top artists,
  eras, genres, and a plain-language "your sound" summary; a yearly wrapped.
  Shareable, delightful, and makes the LLM earn its keep.
- **Shared / collaborative household playlists** — now that multiple people log
  in, let them build playlists together or see "what she's into lately". The
  multi-user groundwork already exists.

### Bigger bets (higher effort)

- **In-app preview / playback** — today you build a playlist but jump to Plex to
  hear it. Even 30-second previews to audition before saving would close the
  loop and greatly improve daily usability. Bigger build (streaming/transcode
  from Plex).
- **Energy-arc / tempo-curve playlists** — DJ-style sets that ramp up then cool
  down. ⚠️ Needs a feasibility spike first: unclear whether Plex exposes raw
  sonic attributes (tempo/energy) via the API — `nearest` gives neighbors and
  distance, not the underlying numbers.

### Plumbing & UX

- **Saved discovery runs / history** — wire up the reserved `sessions` table to
  save Sage/Discover runs (prompt, params, resulting playlist) and re-run them.
  Foundation for *Discover Weekly*.
- **Basket "done" via Plex** — optionally confirm a request actually scanned into
  Plex (playable), not just that Lidarr has the files on disk.
- **Declutter the sidebar footer** — the lower-left is getting busy (library
  stats, Settings, Lidarr status, login/logout). Group it into a tidier account /
  status area.
- **Per-user concurrency** — today the app acts as the single signed-in session;
  revisit if multiple people use one instance simultaneously.

---

## Cross-cutting: Claude Design sync

Reusable UI components are authored in the **Claude Design** system and synced
into `web/src/components/` via `/design-sync` incrementally (one component per
change), so the component library and the app stay aligned without wholesale
replacements.
