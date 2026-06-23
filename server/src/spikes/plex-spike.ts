/**
 * Phase 0 go/no-go spike: prove Plex sonic analysis is reachable via the API.
 *
 * Run: npm run spike:plex
 *
 * Success = the `nearest` endpoint returns sonically similar tracks for a seed.
 * If it returns nothing / errors, Plex Pass Sonic Analysis likely hasn't been
 * run on the library, and the sonic features need rethinking before Phase 2.
 */
import { config } from "../config/env.ts";
import { PlexClient } from "../plex/client.ts";

async function main() {
  if (!config.plex) {
    console.error(
      "✗ Plex not configured. Set PLEX_URL and PLEX_TOKEN in .env first.",
    );
    process.exit(1);
  }

  const plex = new PlexClient(config.plex);

  console.log("→ Connecting to Plex:", config.plex.url);
  const section = await plex.getMusicSection();
  console.log(`✓ Music section: "${section.title}" (key ${section.key})`);

  const seeds = await plex.getSampleTracks(section.key, 1);
  const seed = seeds[0];
  if (!seed) {
    console.error("✗ No tracks found in the music section.");
    process.exit(1);
  }
  console.log(
    `✓ Seed track: "${seed.title}" — ${seed.artist} (ratingKey ${seed.id})`,
  );

  console.log("→ Querying sonic neighbors (nearest)…");
  const similar = await plex.sonicallySimilar(seed.id, 10);

  if (similar.length === 0) {
    console.error(
      "✗ nearest returned 0 tracks. Sonic Analysis may not be complete.",
    );
    process.exit(2);
  }

  console.log(`✓ ${similar.length} sonically similar tracks:`);
  for (const t of similar) {
    console.log(`   • ${t.title} — ${t.artist} [${t.album}]`);
  }
  console.log("\n✅ Plex sonic spike PASSED — the sonic premise holds.");
}

main().catch((err) => {
  console.error("✗ Plex spike failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
