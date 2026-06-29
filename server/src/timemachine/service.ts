import type { Track, TimeMachineGroup } from "@resonarr/shared";
import type { PlexClient } from "../plex/client.ts";
import { archiveBoundary, archiveTopTracksBetween } from "../history/service.ts";

const WINDOW_DAYS = 14; // ±14 days around today's date
const TRACKS_PER_YEAR = 30;
const YEAR_TRACKS_LIMIT = 50;
const LOOK_BACK_YEARS = 6;

/** Epoch seconds for midnight UTC on a given Date. */
function toEpoch(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

/**
 * Returns [fromEpoch, toEpoch] for a ±WINDOW_DAYS window centred on today's
 * month/day but in the given year. Handles year-boundary wrap (e.g. Dec → Jan).
 */
function windowForYear(year: number): [number, number] {
  const now = new Date();
  const centre = new Date(
    Date.UTC(year, now.getUTCMonth(), now.getUTCDate()),
  );
  const from = new Date(centre);
  from.setUTCDate(from.getUTCDate() - WINDOW_DAYS);
  const to = new Date(centre);
  to.setUTCDate(to.getUTCDate() + WINDOW_DAYS);
  return [toEpoch(from), toEpoch(to)];
}

/** [Jan 1, Dec 31] epoch seconds for a full calendar year. */
function yearBounds(year: number): [number, number] {
  return [
    toEpoch(new Date(Date.UTC(year, 0, 1))),
    toEpoch(new Date(Date.UTC(year, 11, 31, 23, 59, 59))),
  ];
}

/**
 * Tracks played within [from, to], most-played first.
 *
 * When the Tautulli archive is populated we count real play *events* in the
 * window (so a track loved 3 years ago surfaces for that year), then hydrate the
 * ids into full tracks via Plex. Without the archive we fall back to Plex's
 * `lastViewedAt` range filter — which only knows each track's *last* play, so it
 * can't really do "N years ago", but it keeps the feature working.
 */
async function tracksForWindow(
  plex: PlexClient,
  sectionKey: string,
  from: number,
  to: number,
  limit: number,
  useArchive: boolean,
): Promise<Track[]> {
  if (!useArchive) {
    return plex.getTracksViewedBetween(sectionKey, from, to, limit).catch(() => []);
  }
  const ranked = archiveTopTracksBetween(from, to, limit);
  if (ranked.length === 0) return [];
  const tracks = await plex
    .getTracksByRatingKeys(ranked.map((r) => r.trackId))
    .catch(() => [] as Track[]);
  const byId = new Map(tracks.map((t) => [t.id, t]));
  // Preserve play-count order; drop ids Plex no longer has.
  return ranked
    .map((r) => byId.get(r.trackId))
    .filter((t): t is Track => t !== undefined);
}

/**
 * "On this day" — one group per past year that has tracks, most-played first.
 * Years are queried in parallel.
 */
export async function getOnThisDay(
  plex: PlexClient,
  sectionKey: string,
): Promise<{ label: string; groups: TimeMachineGroup[] }> {
  const currentYear = new Date().getUTCFullYear();
  const useArchive = archiveBoundary() > 0;

  const years = Array.from(
    { length: LOOK_BACK_YEARS },
    (_, i) => currentYear - 1 - i,
  );

  const results = await Promise.all(
    years.map(async (year) => {
      const [from, to] = windowForYear(year);
      const tracks = await tracksForWindow(
        plex,
        sectionKey,
        from,
        to,
        TRACKS_PER_YEAR,
        useArchive,
      );
      return { year, tracks };
    }),
  );

  const groups = results.filter((g) => g.tracks.length > 0);

  // Label like "June 24" using the server's local date.
  const now = new Date();
  const label = now.toLocaleDateString("en-US", { month: "long", day: "numeric" });

  return { label, groups };
}

/**
 * Top tracks from an entire calendar year, sorted by play count. Useful for
 * "what was my soundtrack in 2022?" style browsing.
 */
export async function getYearTracks(
  plex: PlexClient,
  sectionKey: string,
  year: number,
): Promise<{ year: number; tracks: Track[] }> {
  const [from, to] = yearBounds(year);
  const tracks = await tracksForWindow(
    plex,
    sectionKey,
    from,
    to,
    YEAR_TRACKS_LIMIT,
    archiveBoundary() > 0,
  );
  return { year, tracks };
}
