import { randomUUID } from "node:crypto";
import type {
  AddBasketItemRequest,
  BasketItem,
  BasketItemSource,
  BasketItemStatus,
  BasketItemType,
} from "@resonarr/shared";
import { getDb } from "../db/database.ts";
import type { LidarrImage } from "../lidarr/client.ts";
import { log } from "../log/service.ts";
import { normalize } from "../matching/match.ts";
import { services } from "../services.ts";
import { getSettings } from "../settings/service.ts";

interface BasketRow {
  id: string;
  type: string;
  artist: string;
  album: string | null;
  mbid: string | null;
  source: string;
  status: string;
  created_at: string;
  cover_url: string | null;
}

/** Pick a public (http) artwork URL from a Lidarr images array, if any. */
function pickCoverUrl(images: unknown): string | undefined {
  if (!Array.isArray(images)) return undefined;
  const imgs = images as LidarrImage[];
  const pick = imgs.find((i) => i?.coverType === "poster") ?? imgs[0];
  const url = pick?.remoteUrl;
  return typeof url === "string" && url.startsWith("http") ? url : undefined;
}

const KNOWN_SOURCES: BasketItemSource[] = [
  "sonic-sage",
  "artist-discovery",
  "spotify-import",
  "manual",
];

function rowToItem(r: BasketRow): BasketItem {
  return {
    id: r.id,
    type: r.type as BasketItemType,
    artist: r.artist,
    album: r.album ?? undefined,
    mbid: r.mbid ?? undefined,
    source: (KNOWN_SOURCES as string[]).includes(r.source)
      ? (r.source as BasketItemSource)
      : "manual",
    status: r.status as BasketItemStatus,
    createdAt: r.created_at,
    coverUrl: r.cover_url ?? undefined,
  };
}

export function listBasket(): BasketItem[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM basket_items ORDER BY created_at DESC")
    .all() as unknown as BasketRow[];
  return rows.map(rowToItem);
}

/**
 * Add an item to the basket, but only after Lidarr's metadata lookup confirms
 * the artist is real — this is the hallucination guard. Deduplicates on
 * (mbid, album).
 */
export async function addToBasket(
  input: AddBasketItemRequest,
  options: { autoRequest?: boolean } = {},
): Promise<BasketItem> {
  const artist = input.artist.trim();
  if (!artist) throw new Error("artist is required");
  if (!services.lidarr) throw new Error("Lidarr is not configured");

  const hits = await services.lidarr.artistLookup(artist);
  const match = hits[0];
  if (!match) {
    throw new Error(`No Lidarr/MusicBrainz match for "${artist}"`);
  }

  const album = input.album?.trim() || undefined;
  const db = getDb();

  // Dedupe on resolved artist mbid + album.
  const existing = db
    .prepare(
      `SELECT * FROM basket_items
       WHERE mbid = ? AND IFNULL(album, '') = IFNULL(?, '')`,
    )
    .get(match.foreignArtistId, album ?? null) as unknown as
    | BasketRow
    | undefined;
  if (existing) return rowToItem(existing);

  const autoRequest = options.autoRequest ?? true;

  const item: BasketItem = {
    id: randomUUID(),
    type: (album ? "album" : "artist") as BasketItemType,
    artist: match.artistName,
    album,
    mbid: match.foreignArtistId,
    source: input.source ?? "manual",
    status: "pending",
    createdAt: new Date().toISOString(),
    coverUrl: pickCoverUrl(match.images),
  };

  db.prepare(
    `INSERT INTO basket_items
       (id, type, artist, album, mbid, source, status, created_at, cover_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    item.id,
    item.type,
    item.artist,
    item.album ?? null,
    item.mbid ?? null,
    item.source,
    item.status,
    item.createdAt,
    item.coverUrl ?? null,
  );

  // Submit straight to Lidarr so nothing waits on a manual approval step. Best
  // effort: if the Lidarr target isn't configured yet, the item stays "pending"
  // and the basket's Request button remains a fallback.
  if (autoRequest) {
    const submitted = await autoSubmit([item.id]);
    return submitted ?? item;
  }

  return item;
}

/**
 * Fire-and-forget submit of freshly-added items to Lidarr. Swallows the
 * "target not configured" error so adding never fails on it; per-item failures
 * are already recorded as "failed" status by requestBasket. Returns the updated
 * row for the first id (convenience for the single-add path).
 */
async function autoSubmit(ids: string[]): Promise<BasketItem | undefined> {
  try {
    await requestBasket(ids);
  } catch (err) {
    log.warn("basket", "Auto-request skipped", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM basket_items WHERE id = ?")
    .get(ids[0]) as unknown as BasketRow | undefined;
  return row ? rowToItem(row) : undefined;
}

/** Add several items best-effort; returns what succeeded and what failed. */
export async function addManyToBasket(
  inputs: AddBasketItemRequest[],
): Promise<{ added: BasketItem[]; failed: { artist: string; error: string }[] }> {
  const added: BasketItem[] = [];
  const failed: { artist: string; error: string }[] = [];
  for (const input of inputs) {
    try {
      // Defer the Lidarr submit so the whole batch goes in one pass below
      // (one getArtists() call) instead of once per item.
      added.push(await addToBasket(input, { autoRequest: false }));
    } catch (err) {
      failed.push({
        artist: input.artist,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (added.length > 0) {
    try {
      await requestBasket(added.map((i) => i.id));
    } catch (err) {
      log.warn("basket", "Bulk auto-request skipped", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { added: listBasket().filter((i) => added.some((a) => a.id === i.id)), failed };
}

export function removeFromBasket(id: string): void {
  getDb().prepare("DELETE FROM basket_items WHERE id = ?").run(id);
}

function setStatus(id: string, status: BasketItemStatus): void {
  getDb()
    .prepare("UPDATE basket_items SET status = ? WHERE id = ?")
    .run(status, id);
}

function setCoverUrl(id: string, url: string): void {
  getDb()
    .prepare("UPDATE basket_items SET cover_url = ? WHERE id = ?")
    .run(url, id);
}

/**
 * Submit basket items to Lidarr: artist-first (add if missing, with search for
 * missing albums) or trigger a search if the artist already exists. Returns the
 * updated items with per-item status.
 */
export async function requestBasket(ids?: string[]): Promise<BasketItem[]> {
  const lidarr = services.lidarr;
  if (!lidarr) throw new Error("Lidarr is not configured");

  const settings = getSettings();
  if (
    !settings.lidarrRootFolderPath ||
    settings.lidarrQualityProfileId === null ||
    settings.lidarrMetadataProfileId === null
  ) {
    throw new Error(
      "Lidarr target not configured — set root folder + profiles in Settings",
    );
  }

  const db = getDb();
  const items = (
    ids && ids.length > 0
      ? (db
          .prepare(
            `SELECT * FROM basket_items WHERE id IN (${ids.map(() => "?").join(",")})`,
          )
          .all(...ids) as unknown as BasketRow[])
      : (db
          .prepare("SELECT * FROM basket_items WHERE status = 'pending'")
          .all() as unknown as BasketRow[])
  ).map(rowToItem);

  if (items.length === 0) return [];

  // Fetch the existing artist set once to avoid double-adding.
  const existingByMbid = new Map(
    (await lidarr.getArtists()).map((a) => [a.foreignArtistId, a]),
  );

  let requested = 0;
  let failed = 0;
  for (const item of items) {
    const label = item.album ? `${item.artist} — ${item.album}` : item.artist;
    try {
      const existing = item.mbid
        ? existingByMbid.get(item.mbid)
        : undefined;

      if (existing) {
        await lidarr.searchArtist(existing.id);
      } else {
        const hits = await lidarr.artistLookup(item.artist);
        const lookup =
          hits.find((h) => h.foreignArtistId === item.mbid) ?? hits[0];
        if (!lookup) throw new Error("artist no longer resolvable");
        await lidarr.addArtist(lookup, {
          rootFolderPath: settings.lidarrRootFolderPath,
          qualityProfileId: settings.lidarrQualityProfileId,
          metadataProfileId: settings.lidarrMetadataProfileId,
          monitored: true,
          searchForMissingAlbums: true,
          monitor: "all",
        });
      }
      setStatus(item.id, "requested");
      requested += 1;
    } catch (err) {
      setStatus(item.id, "failed");
      failed += 1;
      // Surface the reason the UI's "failed" badge can't show.
      log.warn("basket", `Request failed: ${label}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info("basket", `Requested ${requested}, failed ${failed}`);
  return listBasket();
}

/**
 * Re-check "requested" items against Lidarr's download statistics and flip any
 * that now have files to "done" — so the basket reflects what has actually
 * landed, not just what was submitted. Cheap when nothing is outstanding.
 */
export async function refreshBasketStatuses(): Promise<BasketItem[]> {
  const lidarr = services.lidarr;
  const all = listBasket();
  const requested = all.filter((i) => i.status === "requested");
  // Items that still lack cover art but could get it from Lidarr (any status).
  const needsCover = all.filter((i) => !i.coverUrl && i.mbid);
  if (!lidarr || (requested.length === 0 && needsCover.length === 0)) return all;

  const artistsByMbid = new Map(
    (await lidarr.getArtists()).map((a) => [a.foreignArtistId, a]),
  );

  // Backfill artwork for existing items (e.g. added before we captured covers).
  for (const item of needsCover) {
    const url = pickCoverUrl(artistsByMbid.get(item.mbid as string)?.images);
    if (url) setCoverUrl(item.id, url);
  }

  // Album lookups are per-artist; cache within this pass.
  const albumCache = new Map<number, Awaited<ReturnType<typeof lidarr.getAlbums>>>();
  let done = 0;

  for (const item of requested) {
    if (!item.mbid) continue;
    const artist = artistsByMbid.get(item.mbid);
    if (!artist) continue; // not in Lidarr yet — still outstanding

    let landed = false;
    if (item.type === "album" && item.album) {
      try {
        let albums = albumCache.get(artist.id);
        if (!albums) {
          albums = await lidarr.getAlbums(artist.id);
          albumCache.set(artist.id, albums);
        }
        const want = normalize(item.album);
        const match = albums.find((a) => normalize(a.title) === want);
        landed = (match?.statistics?.trackFileCount ?? 0) > 0;
      } catch {
        landed = false;
      }
    } else {
      // Artist-level request: any tracks on disk counts as landed.
      landed = (artist.statistics?.trackFileCount ?? 0) > 0;
    }

    if (landed) {
      setStatus(item.id, "done");
      done += 1;
    }
  }

  if (done > 0) log.info("basket", `${done} item(s) now downloaded (done)`);
  return listBasket();
}
