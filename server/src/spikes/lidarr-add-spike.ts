/**
 * Phase 3 spike: verify the artist-first add + search path against Lidarr,
 * using the Lidarr target saved in Settings (root folder + profiles).
 *
 * SAFE BY DEFAULT — dry run unless you opt in:
 *   npm run spike:lidarr-add -w server -- "Khruangbin"            # dry run
 *   npm run spike:lidarr-add -w server -- "Khruangbin" add        # add artist (no download)
 *   npm run spike:lidarr-add -w server -- "Khruangbin" add search # add + grab music
 *
 * "add" creates a REAL artist in Lidarr; "search" tells Lidarr to start
 * downloading. Delete the artist in Lidarr afterwards if it was just a test.
 */
import { config } from "../config/env.ts";
import { LidarrClient } from "../lidarr/client.ts";
import { getSettings } from "../settings/service.ts";

const TERM = process.argv[2] ?? "Khruangbin";
const DO_ADD = process.argv.includes("add");
const DO_SEARCH = process.argv.includes("search");

async function main() {
  if (!config.lidarr) {
    console.error("✗ Lidarr not configured. Set LIDARR_URL and LIDARR_API_KEY.");
    process.exit(1);
  }

  const s = getSettings();
  if (
    !s.lidarrRootFolderPath ||
    s.lidarrQualityProfileId === null ||
    s.lidarrMetadataProfileId === null
  ) {
    console.error(
      "✗ Lidarr target not configured. Set root folder + quality + metadata profiles in Settings first.",
    );
    process.exit(1);
  }
  console.log(
    `✓ Target: ${s.lidarrRootFolderPath} | quality #${s.lidarrQualityProfileId} | metadata #${s.lidarrMetadataProfileId}`,
  );

  const lidarr = new LidarrClient(config.lidarr);

  console.log(`→ artist/lookup "${TERM}"…`);
  const hits = await lidarr.artistLookup(TERM);
  const artist = hits[0];
  if (!artist) {
    console.error(`✗ No artist found for "${TERM}".`);
    process.exit(1);
  }
  console.log(
    `✓ Resolved: ${artist.artistName}${artist.disambiguation ? ` (${artist.disambiguation})` : ""} — mbid ${artist.foreignArtistId}`,
  );

  const existing = (await lidarr.getArtists()).find(
    (a) => a.foreignArtistId === artist.foreignArtistId,
  );

  if (existing) {
    console.log(`• Already in Lidarr (id ${existing.id}).`);
    if (DO_SEARCH) {
      console.log("→ Triggering ArtistSearch…");
      await lidarr.searchArtist(existing.id);
      console.log("✅ Search command sent.");
    }
    return;
  }

  if (!DO_ADD) {
    console.log(
      `\nDRY RUN — would add "${artist.artistName}" to ${s.lidarrRootFolderPath}.`,
    );
    console.log('Pass "add" to actually add, and "search" to also grab music.');
    return;
  }

  console.log(`→ Adding "${artist.artistName}" (search=${DO_SEARCH})…`);
  const added = await lidarr.addArtist(artist, {
    rootFolderPath: s.lidarrRootFolderPath,
    qualityProfileId: s.lidarrQualityProfileId,
    metadataProfileId: s.lidarrMetadataProfileId,
    monitored: true,
    searchForMissingAlbums: DO_SEARCH,
    monitor: "all",
  });
  console.log(
    `✅ Added "${added.artistName}" (id ${added.id}).${DO_SEARCH ? " Search started." : " (not searching)"}`,
  );
}

main().catch((err) => {
  console.error(
    "✗ Lidarr add spike failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
