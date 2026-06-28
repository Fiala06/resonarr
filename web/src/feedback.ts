import { useSyncExternalStore } from "react";
import type { FeedbackRating, Track } from "@resonarr/shared";
import { getFeedback, putFeedback } from "./api";

/**
 * Tiny global store for like/dislike feedback. Loaded once, kept in memory, and
 * updated optimistically so thumbs feel instant. Any TrackRow can read/toggle
 * without prop-drilling.
 */
let map = new Map<string, FeedbackRating>();
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function loadFeedback(): void {
  if (loaded) return;
  loaded = true;
  getFeedback()
    .then((items) => {
      map = new Map(items.map((i) => [i.trackId, i.rating]));
      emit();
    })
    .catch(() => {
      loaded = false; // allow a retry on next mount
    });
}

/** Force a refetch (e.g. after importing Plex ratings in bulk). */
export function reloadFeedback(): void {
  loaded = false;
  loadFeedback();
}

/** Toggle a rating for a track (clicking the active thumb clears it). */
export async function rateTrack(track: Track, rating: FeedbackRating): Promise<void> {
  const current = map.get(track.id);
  const nextRating: FeedbackRating | null = current === rating ? null : rating;

  // Optimistic update.
  const optimistic = new Map(map);
  if (nextRating === null) optimistic.delete(track.id);
  else optimistic.set(track.id, nextRating);
  map = optimistic;
  emit();

  try {
    const items = await putFeedback({
      trackId: track.id,
      artist: track.artist,
      title: track.title,
      rating: nextRating,
    });
    map = new Map(items.map((i) => [i.trackId, i.rating]));
    emit();
  } catch {
    /* keep the optimistic value rather than flicker back */
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useFeedbackMap(): Map<string, FeedbackRating> {
  return useSyncExternalStore(subscribe, () => map);
}
