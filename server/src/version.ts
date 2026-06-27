import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { AppVersion } from "@resonarr/shared";

/**
 * Build identity read from build-info.json, which the Dockerfile writes into the
 * image at build time (git SHA via build arg, timestamp generated in-image). In
 * local dev the file doesn't exist, so we report "dev". Read once at startup.
 */
function readVersion(): AppVersion {
  const here = dirname(fileURLToPath(import.meta.url)); // server/src
  const path = resolve(here, "../../build-info.json"); // repo / image root
  if (existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, "utf8")) as Partial<AppVersion>;
      return {
        commit: data.commit?.trim() || "unknown",
        builtAt: data.builtAt?.trim() || null,
      };
    } catch {
      /* malformed — fall through to the dev default */
    }
  }
  return { commit: "dev", builtAt: null };
}

export const appVersion: AppVersion = readVersion();
