/**
 * Phase 0 spike: prove Lidarr is reachable and we can read what we need to
 * submit requests later (root folders + profiles) and resolve real artists.
 *
 * Run: npm run spike:lidarr
 */
import { config } from "../config/env";
import { LidarrClient } from "../lidarr/client";

async function main() {
  if (!config.lidarr) {
    console.error(
      "✗ Lidarr not configured. Set LIDARR_URL and LIDARR_API_KEY in .env first.",
    );
    process.exit(1);
  }

  const lidarr = new LidarrClient(config.lidarr);

  console.log("→ Connecting to Lidarr:", config.lidarr.url);
  const status = await lidarr.systemStatus();
  console.log(`✓ Lidarr ${status.version}`);

  const roots = await lidarr.rootFolders();
  console.log(`✓ Root folders (${roots.length}):`);
  for (const r of roots) console.log(`   • [${r.id}] ${r.path}`);

  const quality = await lidarr.qualityProfiles();
  console.log(`✓ Quality profiles (${quality.length}):`);
  for (const p of quality) console.log(`   • [${p.id}] ${p.name}`);

  const metadata = await lidarr.metadataProfiles();
  console.log(`✓ Metadata profiles (${metadata.length}):`);
  for (const p of metadata) console.log(`   • [${p.id}] ${p.name}`);

  const term = "Radiohead";
  const hits = await lidarr.artistLookup(term);
  console.log(`✓ artist/lookup "${term}" → ${hits.length} hits:`);
  for (const h of hits.slice(0, 3)) {
    console.log(
      `   • ${h.artistName}${h.disambiguation ? ` (${h.disambiguation})` : ""} — mbid ${h.foreignArtistId}`,
    );
  }

  if (roots.length === 0 || quality.length === 0 || metadata.length === 0) {
    console.error(
      "\n⚠ Missing a root folder or profile — configure these in Lidarr before requesting.",
    );
    process.exit(2);
  }

  console.log("\n✅ Lidarr spike PASSED — ready to submit requests later.");
}

main().catch((err) => {
  console.error(
    "✗ Lidarr spike failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
