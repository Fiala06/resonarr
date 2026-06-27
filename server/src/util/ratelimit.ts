/**
 * Minimal in-memory fixed-window rate limiter — enough to blunt brute-force /
 * abuse of cheap-to-call endpoints without pulling in a dependency. State is
 * per-process (resets on restart), which is fine for a single-instance app.
 *
 * Note: behind a reverse proxy without trustProxy, the key IP is the proxy's,
 * so a household shares a bucket — limits are set with that headroom in mind.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Returns true if the call is allowed; false once `max` is exceeded in window. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    // Opportunistically sweep expired buckets so the map can't grow unbounded.
    if (buckets.size > 1000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}
