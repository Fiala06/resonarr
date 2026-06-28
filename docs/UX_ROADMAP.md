# Resonarr UX Roadmap

Goal: make Resonarr friendly and obvious for a non-technical end user who just
wants great playlists. Improvements are grouped into phases so we can ship in
small, reviewable chunks. Check items off as they land.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase 1 — Orientation (highest impact)

Give people a place to land and a clear mental model before they hit the 13
discovery tools.

- [ ] **1.1 Home / dashboard screen** — new landing view (`web/src/views/HomeView.tsx`)
  - "Welcome back" header
  - A fresh mix card, the next Discover Weekly run, 2 suggested artists
  - Surface library stats here (tracks / albums / artists) — see 4.3
  - Becomes the default tab instead of landing inside Sage
  - Wire into `App.tsx` routing + `Sidebar.tsx` as first nav item
- [ ] **1.2 First-run onboarding** — 3-step intro modal shown once
  - Step 1: "We build playlists only from music you already own"
  - Step 2: "Want more? Add it to your Wishlist and we'll fetch it"
  - Step 3: "Set up a weekly auto-playlist"
  - Persist "seen" flag (localStorage or settings)
  - "Skip" + "Don't show again"
- [ ] **1.3 Per-tab one-line subtitles** — short plain-language descriptions under
  each tab/hub so newcomers know what each mode does. Tie into 2.1 renames.
- [ ] **1.4 Surface the "Import my Plex ratings" prompt early** — friendly banner on
  Home / Loved pointing to the import (currently buried in Settings)

## Phase 2 — Plain language (rename the jargon)

- [ ] **2.1 Rename features to plain language** (UI labels only, keep internal keys)
  - "Sonic Sage" → "Describe a Vibe" (or keep Sage + subtitle)
  - Review "Deep Cuts", "Adventure", "Loved", "Radio" for clarity subtitles
- [ ] **2.2 Rename "Basket" → "Wishlist"** across UI (`BasketView.tsx`, `Sidebar.tsx`,
  badges, headings). Keep route/key `basket` internally.
- [ ] **2.3 Soften tech terms** — replace user-facing "Plex"/"Lidarr" with
  "your music library" / "downloads" where it doesn't lose meaning. Keep exact
  names in Settings where they're configured.
- [ ] **2.4 Rename hubs** to action-oriented: "Make a Playlist", "Get More Music",
  "About My Taste" (was Listen / Library / Insights)
- [ ] **2.5 "Request" → "Add to wishlist" / "Get this album"** on track + artist cards

## Phase 3 — Core flow polish (saving + wishlist)

- [ ] **3.1 Clearer, more rewarding save** (`SavePlaylistBar.tsx`)
  - Primary "▶ Save to my music" button
  - Success confirmation with playlist name + "open in Plex" link
- [ ] **3.2 In-app track preview** — 30s preview on hover/click before saving
  (start with what's feasible; fall back to existing YouTube link)
- [ ] **3.3 Plain-English banner on the owned vs not-owned split** (`SageView.tsx`)
  - "These you already have ✓ · These you'd need to download — add to wishlist"
- [ ] **3.4 Humanize wishlist status words** (`BasketView.tsx`)
  - pending → "Waiting", requested → "Downloading", done → "Ready to play",
    failed → "Couldn't find"
  - Per-item step indicator / progress feel
- [ ] **3.5 Better failed-item handling** — replace raw detail string with
  "Couldn't find this album automatically" + Retry / Search manually
- [ ] **3.6 Bigger / safer remove targets** in wishlist (larger tap area, confirm)

## Phase 4 — Stats & insights (make them fun and visible)

- [ ] **4.1 Promote Taste Profile** — move it up / feature it on Home; it's the
  most shareable screen ("Wrapped"-style)
- [ ] **4.2 New lightweight stats** (Home + Profile)
  - "X new songs discovered this month"
  - "X albums added through your wishlist"
  - Top genres / decades as a simple chart
  - Listening streak / most played this week (if data available)
  - NOTE: confirm which metrics are derivable from existing API/data first
- [ ] **4.3 Move library stats out of the hover tooltip** — show the
  tracks/albums/artists numbers on Home instead of a sidebar-footer hover
- [ ] **4.4 Friendly "Recent activity" feed** — human summaries
  ("Built your Discover Weekly · added 4 albums"); keep the raw Activity Log
  behind an "Advanced" toggle (`LogsView.tsx`)

## Phase 5 — Feedback, waiting & consistency

- [ ] **5.1 Reassuring progress for long ops** — Sage/Mixes/etc. show a progress
  message or animation for anything > ~3s (model on Artist Discovery's timer)
- [ ] **5.2 Actionable empty states** — every empty state ends with a button/next
  step (e.g. Loved's empty state gets an "Import my ratings" button)
- [ ] **5.3 Consistent warm/plain voice** — audit all copy; remove technical
  phrases ("MusicBrainz entry invalid") in favor of plain language

## Phase 6 — Mobile & polish

- [ ] **6.1 Verify mobile drawer + grids/preview cards** don't overflow on phones
- [ ] **6.2 Mobile tap-target pass** — buttons, remove icons, checkboxes sized for
  touch
- [ ] **6.3 General consistency pass** — spacing, button styles, success/error
  colors uniform across views

---

## Suggested build order

1. Phase 2 (renames) — low risk, immediate clarity win, unblocks copy in others
2. Phase 1 (Home + onboarding) — biggest orientation impact
3. Phase 3 (core flow) — improves the main job people come to do
4. Phase 4 (stats) — delight + retention
5. Phase 5 + 6 (polish + mobile) — finish

## Open questions / to confirm before building

- Which stats in 4.2 are actually derivable from current data/APIs?
- Track preview (3.2): is there an audio source we can use besides YouTube?
- Onboarding "seen" flag: localStorage vs server-side setting?
