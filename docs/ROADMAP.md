# Resonarr — Roadmap

What's left and what's being considered. The original Phase 0–7 build plan has
shipped — see [DESIGN.md](DESIGN.md) for the architecture and git history for how
it came together.

Legend: **Next** = likely to build soon · **Ideas** = candidates, not committed.

---

## Next

### Spotify import
Import Spotify playlists (e.g. Liked Songs) into Plex. Pull the playlist via the
Spotify API, fuzzy-match each track to the Plex library (reusing `matching/`):
owned tracks → a Plex playlist, misses → the request basket via Lidarr lookup.
Needs a Spotify OAuth flow + a new server-side secret.

### Discover Weekly (scheduled auto-playlists)
A Spotify-Discover-Weekly equivalent: a personalized playlist that **refreshes
on a schedule** (default weekly). A background job seeds from recent listening
history, expands via sonic similarity, and rebuilds the playlist with owned
tracks that fit your taste — biased toward ones you haven't played lately and
music **newly added to Plex** — avoiding repeats from recent weeks.

Generalizes to any saved discovery definition (a Sage prompt or a Discover
source playlist) on a schedule. Two refresh modes worth supporting: **replace**
(a fresh set each week, like Discover Weekly) and **append** (keep growing one
playlist as new matches appear). Needs: a scheduler, persisted auto-playlist
definitions (builds on *Saved discovery runs* below), a "recently added /
recently unplayed" bias, and history so weeks don't repeat.

---

## Ideas

- **Cycling prompt examples in Sonic Sage** — like Plexamp's "Try one of these",
  show a rotating set of ~10 example prompts seeded from the user's play history
  / top artists (e.g. "melancholic, haunting vocals, reminiscent of
  Evanescence"). Cycle them as placeholder/suggestions to spark ideas.
- **Declutter the sidebar footer** — the lower-left is getting busy (library
  stats, Settings, Lidarr status, login/logout). Group it into a tidier account
  / status area (e.g. collapse stats, fold status + logout into one menu).
- **Saved discovery runs / history** — wire up the reserved `sessions` table to
  save Sage/Discover runs (prompt, params, resulting playlist) and re-run them.
- **Discover: "new artists only"** — optional mode that also excludes candidates
  whose artist already appears in the source playlist, for true new-artist
  discovery rather than new-tracks-by-known-artists.
- **Basket "done" via Plex** — optionally confirm a request actually scanned
  into Plex (playable), not just that Lidarr has the files on disk.
- **Per-user concurrency** — today the app acts as the single signed-in session;
  revisit if multiple people use one instance simultaneously.

---

## Cross-cutting: Claude Design sync

Reusable UI components are authored in the **Claude Design** system and synced
into `web/src/components/` via `/design-sync` incrementally (one component per
change), so the component library and the app stay aligned without wholesale
replacements.
