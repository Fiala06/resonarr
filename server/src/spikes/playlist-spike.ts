/**
 * Phase 2 spike: verify track search returns RELEVANT results, and (optionally)
 * that we can create a Plex playlist.
 *
 * Run in the container:
 *   npm run spike:playlist -w server -- love           # search only
 *   npm run spike:playlist -w server -- love create     # search + create playlist
 *
 * Playlist creation makes a REAL playlist named "Resonarr Spike Test". Delete
 * it afterwards if you like.
 */
import { config } from "../config/env.ts";
import { PlexClient } from "../plex/client.ts";

const SEARCH_TERM = process.argv[2] ?? "love";
const DO_CREATE = process.argv.includes("create");

async function main() {
  if (!config.plex) {
    console.error("✗ Plex not configured. Set PLEX_URL and PLEX_TOKEN in .env.");
    process.exit(1);
  }

  const plex = new PlexClient(config.plex);
  const section = await plex.getMusicSection();
  console.log(`✓ Music section: "${section.title}" (key ${section.key})`);

  console.log(`→ Searching tracks for "${SEARCH_TERM}"…`);
  const hits = await plex.searchTracks(SEARCH_TERM, 8);
  console.log(`✓ search returned ${hits.length} tracks:`);
  for (const t of hits) {
    console.log(`   • ${t.title} — ${t.artist} [${t.album}]`);
  }
  console.log(
    `\n>>> Sanity check: do these titles/artists actually relate to "${SEARCH_TERM}"?`,
  );

  if (!DO_CREATE) {
    console.log('\n(Pass "create" as a 2nd arg to also test playlist creation.)');
    return;
  }

  const seed = hits[0] ?? (await plex.getSampleTracks(section.key, 1))[0];
  if (!seed) {
    console.error("✗ No seed track available.");
    process.exit(1);
  }
  const neighbors = await plex.sonicallySimilar(seed.id, 9);
  const trackIds = [seed.id, ...neighbors.map((t) => t.id)];

  console.log(`\n→ Creating playlist from ${trackIds.length} tracks…`);
  const playlist = await plex.createPlaylist("Resonarr Spike Test", trackIds);
  console.log(
    `✅ Created "${playlist.title}" (ratingKey ${playlist.playlistId}, ${playlist.trackCount} tracks).`,
  );
}

main().catch((err) => {
  console.error(
    "✗ Playlist spike failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
