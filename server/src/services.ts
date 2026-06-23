import { config } from "./config/env.ts";
import { PlexClient } from "./plex/client.ts";
import { LidarrClient } from "./lidarr/client.ts";
import { SonicService } from "./sonic/cache.ts";

/**
 * Process-wide service singletons, built once from configuration. A client is
 * `null` when its upstream isn't configured; routes surface that as a clear
 * "not configured" rather than crashing.
 */
const plex = config.plex ? new PlexClient(config.plex) : null;
const lidarr = config.lidarr ? new LidarrClient(config.lidarr) : null;

export const services = {
  plex,
  lidarr,
  sonic: plex ? new SonicService(plex) : null,
};
