import type { StatsSummary } from "@resonarr/shared";
import { getDb } from "../db/database.ts";

/**
 * Honest, cheap engagement counts derived straight from persisted rows — no new
 * event tracking. `created_at` is stored as a UTC ISO string everywhere, so a
 * lexical `>=` against a UTC month-start boundary is a correct date filter.
 *
 * Wishlist counts are global (the basket isn't user-scoped); rating counts are
 * scoped to the requesting user's feedback key.
 */
export function getStatsSummary(userKey: string): StatsSummary {
  const db = getDb();
  const since = monthStartIsoUtc();

  const count = (sql: string, ...args: (string | number)[]): number =>
    (db.prepare(sql).get(...args) as { n: number }).n;

  return {
    wishlistAddedThisMonth: count(
      "SELECT COUNT(*) AS n FROM basket_items WHERE created_at >= ?",
      since,
    ),
    wishlistLandedTotal: count(
      "SELECT COUNT(*) AS n FROM basket_items WHERE status = 'done'",
    ),
    tracksRatedThisMonth: count(
      "SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND created_at >= ?",
      userKey,
      since,
    ),
    tracksRatedTotal: count(
      "SELECT COUNT(*) AS n FROM feedback WHERE user_id = ?",
      userKey,
    ),
  };
}

/** ISO string for 00:00 UTC on the first of the current month. */
function monthStartIsoUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
