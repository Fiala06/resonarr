import type { TimeMachineGroup } from "@resonarr/shared";
import type { PlexClient } from "../plex/client.ts";

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
 * "On this day" — one group per past year that has tracks. Queries each year
 * in parallel using Plex's lastViewedAt date-range filter, sorted by play
 * count so the most-listened tracks surface first.
 */
export async function getOnThisDay(
  plex: PlexClient,
  sectionKey: string,
): Promise<{ label: string; groups: TimeMachineGroup[] }> {
  const currentYear = new Date().getUTCFullYear();

  const years = Array.from(
    { length: LOOK_BACK_YEARS },
    (_, i) => currentYear - 1 - i,
  );

  const results = await Promise.all(
    years.map(async (year) => {
      const [from, to] = windowForYear(year);
      const tracks = await plex
        .getTracksViewedBetween(sectionKey, from, to, TRACKS_PER_YEAR)
        .catch(() => []);
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
): Promise<{ year: number; tracks: import("@resonarr/shared").Track[] }> {
  const [from, to] = yearBounds(year);
  const tracks = await plex.getTracksViewedBetween(
    sectionKey,
    from,
    to,
    YEAR_TRACKS_LIMIT,
  );
  return { year, tracks };
}
