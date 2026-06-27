/**
 * Parse JSON without throwing. Returns `fallback` on malformed input — used for
 * reading values we persisted ourselves (cache rows, settings) where a corrupt
 * entry should degrade gracefully instead of crashing the request.
 */
export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
