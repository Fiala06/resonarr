/**
 * Multi-user discovery spike: who can access this Plex server, and how?
 *
 * Run: npm run spike:users -w server
 *
 * Classifies every account so we can pick the right multi-user approach:
 *   - Home / managed users  → admin token can mint per-user tokens server-side
 *     (the simple path: no extra login).
 *   - Shared friends (separate accounts) → they'd authenticate to Resonarr
 *     themselves (Plex PIN/OAuth) to grant a token.
 *
 * Read-only: it only lists accounts, it changes nothing.
 */
import { config } from "../config/env.ts";

const PLEX_TV = "https://plex.tv";

async function getJson(path: string, token: string): Promise<unknown> {
  const res = await fetch(new URL(path, PLEX_TV), {
    headers: {
      Accept: "application/json",
      "X-Plex-Token": token,
      "X-Plex-Product": "Resonarr",
      "X-Plex-Client-Identifier": "resonarr-users-spike",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${path}`);
  }
  return res.json();
}

interface HomeUser {
  id?: number | string;
  uuid?: string;
  title?: string;
  username?: string;
  email?: string;
  restricted?: boolean;
  guest?: boolean;
  admin?: boolean;
}

async function main() {
  if (!config.plex) {
    console.error("✗ Plex not configured. Set PLEX_URL and PLEX_TOKEN in .env.");
    process.exit(1);
  }
  const token = config.plex.token;

  // --- Plex Home users (managed + home accounts under this admin) -----------
  console.log("→ Fetching Plex Home users (plex.tv/api/v2/home/users)…");
  try {
    const data = (await getJson("/api/v2/home/users", token)) as {
      users?: HomeUser[];
    };
    const users = data.users ?? [];
    if (users.length === 0) {
      console.log("   (no Home users — Plex Home may not be set up)");
    }
    for (const u of users) {
      const kind = u.admin
        ? "ADMIN"
        : u.restricted || u.guest
          ? "managed/home"
          : "home";
      console.log(
        `   • ${u.title ?? u.username ?? u.email ?? "?"}  [${kind}]  id=${u.id ?? "?"}`,
      );
    }
  } catch (err) {
    console.log(
      `   ! Home users lookup failed: ${err instanceof Error ? err.message : err}`,
    );
  }

  // --- Shared friends (separate Plex accounts with access) ------------------
  console.log("\n→ Fetching shared friends (plex.tv/api/v2/friends)…");
  try {
    const friends = (await getJson("/api/v2/friends", token)) as HomeUser[];
    if (!Array.isArray(friends) || friends.length === 0) {
      console.log("   (no shared friends)");
    } else {
      for (const f of friends) {
        console.log(
          `   • ${f.title ?? f.username ?? f.email ?? "?"}  [separate account]  id=${f.id ?? "?"}`,
        );
      }
    }
  } catch (err) {
    console.log(
      `   ! Friends lookup failed: ${err instanceof Error ? err.message : err}`,
    );
  }

  console.log(
    "\n✅ Done. If your wife appears under Home users → simple server-side path.\n" +
      "   If she only appears under shared friends → she'll authenticate herself.",
  );
}

main().catch((err) => {
  console.error("✗ Users spike failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
