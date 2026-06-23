/**
 * Phase 2 spike: prove we can search tracks and create a Plex playlist via the
 * API (playlist creation needs the server's machine identifier + a server:// URI).
 *
 * Run in the container: npm run spike:playlist -w server
 *
 * It creates a small REAL playlist named "Resonarr Spike Test" in your Plex,
 * built from a seed track's sonic neighbors. Delete it afterwards if you like.
 */
import { config } from "../config/env.ts";
import { PlexClient } from "../plex/client.ts";

const SEARCH_TERM = process.argv[2] ?? "love";

async function main() {
  if (!config.plex) {
    console.error("✗ Plex not configured. Set PLEX_URL and PLEX_TOKEN in .env.");
    process.exit(1);
  }

  const plex = new PlexClient(config.plex);
  const section = await plex.getMusicSection();
  console.log(`✓ Music section: "${section.title}" (key ${section.key})`);

  console.log(`→ Searching tracks for "${SEARCH_TERM}"…`);
  const hits = await plex.searchTracks(section.key, SEARCH_TERM, 5);
  console.log(`✓ search returned ${hits.length} tracks`);
  for (const t of hits.slice(0, 5)) {
    console.log(`   • ${t.title} — ${t.artist} (ratingKey ${t.id})`);
  }

  // Seed: prefer a search hit, else fall back to any sample track.
  const seed = hits[0] ?? (await plex.getSampleTracks(section.key, 1))[0];
  if (!seed) {
    console.error("✗ No seed track available.");
    process.exit(1);
  }
  console.log(`→ Seed: "${seed.title}" — ${seed.artist}`);

  const neighbors = await plex.sonicallySimilar(seed.id, 9);
  const trackIds = [seed.id, ...neighbors.map((t) => t.id)];
  console.log(`✓ Building playlist from ${trackIds.length} tracks`);

  const id = await plex.getMachineIdentifier();
  console.log(`✓ machineIdentifier: ${id}`);

  console.log("→ Creating playlist…");
  const playlist = await plex.createPlaylist("Resonarr Spike Test", trackIds);
  console.log(
    `✅ Created playlist "${playlist.title}" (ratingKey ${playlist.playlistId}, ${playlist.trackCount} tracks).`,
  );
  console.log("   Check Plex — and delete it if you don't want to keep it.");
}

main().catch((err) => {
  console.error(
    "✗ Playlist spike failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
