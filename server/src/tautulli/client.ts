import type { TautulliConfig } from "../config/env.ts";

/**
 * Minimal Tautulli client over its HTTP API (`/api/v2`).
 *
 * Tautulli logs every Plex play to its own database, typically going back years
 * — far longer than Plex's own pruned history. Auth is the `apikey` query param;
 * it never leaves the server. We only read music play history here.
 *
 * Each history row carries the Plex `rating_key` (same id resonarr uses
 * everywhere), the `date` of the play (epoch seconds, matching Plex `viewedAt`),
 * and the Plex `user_id` that played it.
 */

const REQUEST_TIMEOUT_MS = 30_000;
const PAGE_SIZE = 1000;

/** One imported play event, mapped to resonarr's vocabulary. */
export interface TautulliPlay {
  trackId: string;
  artist: string;
  title: string;
  viewedAt: number; // epoch seconds
  accountId?: number;
}

// --- Raw Tautulli JSON shapes (only the fields we read) ----------------------

interface TautulliHistoryRow {
  rating_key?: string | number;
  grandparent_title?: string;
  title?: string;
  date?: number; // epoch seconds (play start)
  user_id?: number;
  media_type?: string;
}

interface TautulliHistoryResponse {
  response?: {
    result?: string;
    message?: string;
    data?: {
      recordsFiltered?: number;
      recordsTotal?: number;
      data?: TautulliHistoryRow[];
    };
  };
}

export class TautulliClient {
  constructor(private readonly cfg: TautulliConfig) {}

  private async request<T>(
    cmd: string,
    params: Record<string, string | number> = {},
  ): Promise<T> {
    const url = new URL("/api/v2", this.cfg.url);
    url.searchParams.set("apikey", this.cfg.apiKey);
    url.searchParams.set("cmd", cmd);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error(`Tautulli request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }
      throw new Error(
        `Tautulli request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!res.ok) {
      throw new Error(`Tautulli ${res.status} ${res.statusText} for ${cmd}`);
    }
    return (await res.json()) as T;
  }

  /** Sanity check — resolves true if the API key works. Throws on HTTP errors. */
  async ping(): Promise<boolean> {
    const data = await this.request<{ response?: { result?: string } }>("arnold");
    return data.response?.result === "success";
  }

  /**
   * Music play history, most-recent first, paging until exhausted or until a
   * page is entirely at/older than `after` (epoch seconds). Pass `after` for an
   * incremental top-up; omit it for a full backfill. `onProgress` reports the
   * running count of mapped plays so callers can log/stream progress.
   */
  async getMusicHistory(opts: {
    after?: number;
    onProgress?: (count: number) => void;
  } = {}): Promise<TautulliPlay[]> {
    const after = opts.after ?? 0;
    const out: TautulliPlay[] = [];

    for (let start = 0; ; start += PAGE_SIZE) {
      const data = await this.request<TautulliHistoryResponse>("get_history", {
        media_type: "track",
        order_column: "date",
        order_dir: "desc",
        length: PAGE_SIZE,
        start,
      });

      if (data.response?.result !== "success") {
        throw new Error(
          `Tautulli get_history failed: ${data.response?.message ?? "unknown error"}`,
        );
      }

      const rows = data.response.data?.data ?? [];
      if (rows.length === 0) break;

      let reachedKnown = false;
      for (const row of rows) {
        const viewedAt = typeof row.date === "number" ? row.date : 0;
        const ratingKey = row.rating_key != null ? String(row.rating_key) : "";
        if (!ratingKey || !viewedAt) continue;
        // Incremental: rows are newest-first, so once we cross `after` every
        // remaining row is already imported — stop after this page.
        if (viewedAt <= after) {
          reachedKnown = true;
          continue;
        }
        out.push({
          trackId: ratingKey,
          artist: row.grandparent_title ?? "",
          title: row.title ?? "",
          viewedAt,
          accountId: typeof row.user_id === "number" ? row.user_id : undefined,
        });
      }

      opts.onProgress?.(out.length);

      if (reachedKnown) break;
      if (rows.length < PAGE_SIZE) break;
    }

    return out;
  }
}
