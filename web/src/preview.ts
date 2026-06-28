import { useEffect, useState } from "react";

/**
 * A tiny singleton audio controller for 30-second-style track previews. One
 * shared <audio> element means starting a new preview stops the previous one,
 * and any number of rows can reflect "is this track playing?" reactively.
 *
 * The audio is streamed from `/api/preview/:id`, which proxies the owned track
 * from Plex server-side (the Plex token never reaches the browser).
 */

type State = { id: string | null; loading: boolean };

let audio: HTMLAudioElement | null = null;
let state: State = { id: null, loading: false };
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  const el = new Audio();
  el.preload = "none";
  el.addEventListener("ended", () => set({ id: null, loading: false }));
  el.addEventListener("error", () => set({ id: null, loading: false }));
  el.addEventListener("playing", () =>
    set({ id: state.id, loading: false }),
  );
  audio = el;
  return el;
}

/** Start the preview for a track, or stop it if it's already the active one. */
export function togglePreview(trackId: string): void {
  const el = ensureAudio();
  if (state.id === trackId) {
    el.pause();
    set({ id: null, loading: false });
    return;
  }
  el.src = `/api/preview/${encodeURIComponent(trackId)}`;
  set({ id: trackId, loading: true });
  void el.play().catch(() => set({ id: null, loading: false }));
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Reactive view of which track (if any) is previewing, and whether it's loading. */
export function usePreview(): State {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);
  return state;
}
