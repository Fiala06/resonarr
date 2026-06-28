# Resonarr UX Roadmap

Goal: make Resonarr friendly and obvious for a non-technical end user who just
wants great playlists. Improvements are grouped into phases so we can ship in
small, reviewable chunks. Check items off as they land.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase 1 — Orientation (highest impact)

Give people a place to land and a clear mental model before they hit the 13
discovery tools.

- [x] **1.1 Home / dashboard screen** — new landing view (`web/src/views/HomeView.tsx`)
  - Time-of-day greeting (uses signed-in user's first name)
  - Library stat tiles (tracks / albums / artists) — see 4.3
  - 6 quick-start action cards into the main features
  - "What's happening" tiles: wishlist count + next weekly auto-playlist run
  - Default tab (App.tsx `tabFromHash` → "home"); first item in Sidebar nav
  - NOTE: kept the dashboard to cheap/cached endpoints (auto-playlists, feedback)
    so it loads fast; "fresh mix / suggested artists" cards deferred to avoid slow
    first paint — revisit once those endpoints are confirmed cheap
- [x] **1.2 First-run onboarding** — 3-step intro modal shown once
  (`web/src/components/Onboarding.tsx`)
  - Steps: library-first idea → wishlist → weekly auto-playlist
  - Step dots, Back / Next / Get started, Skip, backdrop-click to dismiss
  - "Seen" flag in localStorage (`resonarr.onboarded`); storage-disabled →
    treated as seen so it never nags. Rendered over both wide/narrow layouts.
- [x] **1.3 Per-tab one-line subtitles** — plain-language `TAB_SUBTITLES` map drives
  hover tooltips on every tab pill, the Home/hub sidebar items, and the footer
  items; hubs get their own one-line hints. Delivered as tooltips (not stacked
  visible text) to avoid duplicating each view's own header; Home cards already
  show visible blurbs for the main modes.
- [x] **1.4 Surface the "Import my Plex ratings" prompt early** — friendly nudge
  banner on Home (shown only until the user has any thumbs) linking to Settings.
  Loved-page banner can follow later.

## Phase 2 — Plain language (rename the jargon)

- [x] **2.1 Rename features to plain language** (UI labels only, keep internal keys)
  - "Sonic Sage" → nav tab now "Describe a Vibe" (kept "SONIC SAGE" page eyebrow
    as the branded header — friendly nav, branded page)
  - Other leaf labels left as-is; clarity subtitles deferred to 1.3
- [x] **2.2 Rename "Basket" → "Wishlist"** across UI (Sidebar tab, BasketView header /
  empty state / buttons, Sage + Artist + Spotify "in wishlist" labels). Route/key
  `basket` and all API/DTO names kept internal.
- [x] **2.3 Soften tech terms** — sidebar status "Downloads connected/offline"
  (tooltip names Lidarr); discovery copy now says "your library" / "download"
  instead of Plex/Lidarr. Settings, Login, and Status pages keep exact names.
- [x] **2.4 Rename hubs** to action-oriented: "Make a Playlist", "Get More Music",
  "About My Taste" (was Listen / Library / Insights)
- [x] **2.5 "Request" → "Add to wishlist"** on Sage track cards and Artist cards;
  basket submit buttons now "Download selected / Download all waiting"

## Phase 3 — Core flow polish (saving + wishlist)

- [x] **3.1 Clearer, more rewarding save** (`SavePlaylistBar.tsx`)
  - Primary "▶ Save to my music (N)" button (append shows "Add to playlist (N)")
  - Success is a green ✓ confirmation card naming the playlist + track count
  - "Open in Plex →" deep link NOW DONE: added `PlexClient.playlistWebUrl()`
    (uses the server machine id) and a best-effort `plexUrl` on both
    Create/AddToPlaylist responses; the card links straight to the playlist in
    Plex, falling back to "Find it in your music app." if the link can't be built.
- [x] **3.2 In-app track preview** — owned tracks now play inline. Backend
  `GET /api/preview/:id` proxies the track's file from Plex (token stays
  server-side) with Range support for seeking (`PlexClient.streamTrack` /
  `getTrackPartKey`). Frontend: a singleton audio controller (`preview.ts`) so
  one preview plays at a time, and a play/stop button on every `TrackRow`.
  (Unowned recommendations still use the YouTube link — there's no audio to
  stream for music you don't own.)
- [x] **3.3 Plain-English banner on the owned vs not-owned split** (`SageView.tsx`)
  - Info banner above results: "✓ N you already have — ready to play now ·
    ✦ M you'd need to download — add them to your wishlist below"
- [x] **3.4 Humanize wishlist status words** (`BasketView.tsx`)
  - pending → "Waiting", requested → "Downloading", done → "✓ Ready to play",
    failed → "Couldn't find"; dropped the shouty uppercase tag styling
  - Per-row line text already gives progress feel; dedicated step indicator left
    as a later nicety
- [x] **3.5 Better failed-item handling** — row reads "Not found automatically —
  try the links, or retry"; existing YouTube/MusicBrainz links cover manual
  search; retry button relabelled "Try again". (No raw error string was ever
  shown per-item; top-level message already humanized in Phase 2.)
- [x] **3.6 Bigger / safer remove targets** in wishlist — remove is now a 34×34
  bordered trash button (was a tiny "×") with a confirm dialog before removing.

## Phase 4 — Stats & insights (make them fun and visible)

- [x] **4.1 Promote Taste Profile** — top quick-start card on Home PLUS a "Your
  Sound" hero (soundline + genre chips) that links to the full profile. Solved
  the generation-cost concern with a new **cache-only** endpoint
  `GET /api/taste-profile/cached` (`getCachedTasteProfile` → `cacheGet`, never
  runs the LLM): the hero only appears once the user has built their profile, so
  the landing page stays cheap.
- [x] **4.2 New lightweight stats** (Home + Profile)
  - [x] Genres + eras chips in the "Your Sound" hero (cached TasteProfile)
  - [x] "Your activity" section on Home from a new `GET /api/stats/summary`
    (`stats/service.ts`): rated this month, added to wishlist this month, and
    total added to your library — all derived from real persisted `created_at` /
    `status` rows (basket + feedback), no new event tracking. Hidden until
    there's something non-zero to show.
  - [x] Listening streak + most-played-this-week — DONE without a new subsystem:
    Plex already persists play history, so `GET /api/stats/listening`
    (`listening/service.ts` → `PlexClient.getMusicPlayHistory`) reads it on
    demand (cached 20 min), scoped to the user's account on shared servers.
    Home shows a "This week" card: 🔥 day-streak, plays this week, and the
    most-played tracks. Shown only when there are plays this week.
- [x] **4.3 Move library stats out of the hover tooltip** — tracks/albums/artists
  now shown as stat tiles on Home (no hover needed). Sidebar footer "X tracks"
  + hover breakdown left as a bonus at-a-glance.
- [x] **4.4 Friendly "Recent activity" feed** — LogsView now defaults to a
  "Simple" feed (per-feature emoji + friendly name, plain message, relative time
  like "5m ago", "needs attention"/"heads up" flags for warn/error) with an
  "Advanced" toggle that shows the original raw technical log. Page retitled
  "Recent activity".

## Phase 5 — Feedback, waiting & consistency

- [x] **5.1 Reassuring progress for long ops** — Sage and Mixes now show an
  animated `rsn-loader` bar plus a reassuring "this can take a few seconds" line
  while working (Artists already had its elapsed-seconds timer).
- [x] **5.2 Actionable empty states** — Loved's empty state now has an "Import my
  ratings →" button; the empty wishlist points to "Describe a Vibe →" /
  "Find New Artists →". (Both navigate via the hash router.)
- [~] **5.3 Consistent warm/plain voice** — light pass done: audition link
  "MusicBrainz" → "Look up" (tooltip keeps the name); Activity page reworded away
  from "Lidarr / container logs". Kept on-brand "sonically". Full copy audit is
  ongoing — revisit per-view as we touch them.

## Phase 6 — Mobile & polish

- [~] **6.1 Verify mobile drawer + grids/preview cards** don't overflow on phones
  - Fixed the confident risks: Mixes grid is now responsive (`auto-fill
    minmax(190px)` instead of a rigid 3 columns); wishlist / Sage-miss / Artist
    rows now `flex-wrap` so their controls reflow instead of overflowing.
  - REMAINING: actual on-device check (drawer, AlbumArt hover preview overflow)
    needs a real phone — I verify by hand, so this needs you or a device.
- [x] **6.2 Mobile tap-target pass** — remove button is 34×34 (Phase 3); thumbs
  up/down bumped 26→30px; wishlist checkbox enlarged to 18px with a label.
- [~] **6.3 General consistency pass** — incremental so far (shared row/card
  styling, success/error colors reused from theme). A dedicated sweep across all
  views is still worth doing as a final pass.

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
