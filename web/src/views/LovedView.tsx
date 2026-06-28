import { useEffect, useState } from "react";
import type { Track } from "@resonarr/shared";
import { getLoved } from "../api";
import { SavePlaylistBar } from "../components/SavePlaylistBar";
import { TrackRow } from "../components/TrackRow";
import { colors, fx } from "../theme";

/**
 * "Loved" — recommendations from the centre of your taste: owned tracks that sit
 * sonically close to many of the songs you've thumbed up. Refresh re-samples
 * your likes for a new spread.
 */
export function LovedView() {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    getLoved()
      .then((r) => setTracks(r.tracks))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="rsn-rise" style={{ display: "grid", gap: 18, maxWidth: 680 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 1.4, fontWeight: 700, color: colors.accentLight }}>
          FROM YOUR LIKES
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", letterSpacing: "-0.4px" }}>
          Loved
        </h1>
        <div style={{ width: 42, height: 3, borderRadius: 3, background: fx.accentBar, marginTop: 12 }} />
        <div style={{ fontSize: 13.5, color: colors.muted, marginTop: 12 }}>
          Owned tracks from the centre of your taste — songs that sit sonically
          close to many of the tracks you’ve thumbed up. Refresh for a new spread.
        </div>
      </div>

      <div>
        <button
          onClick={load}
          disabled={loading}
          className="rsn-btn"
          style={{
            background: fx.btnBg,
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "10px 18px",
            boxShadow: fx.btnGlow,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Finding…" : "Refresh"}
        </button>
      </div>

      {error && <p style={{ color: colors.red, margin: 0 }}>Error: {error}</p>}

      {tracks === null ? (
        !error && <p style={{ color: colors.muted, margin: 0 }}>Loading…</p>
      ) : tracks.length === 0 ? (
        <div
          style={{
            display: "grid",
            gap: 12,
            justifyItems: "start",
            padding: "16px 18px",
            borderRadius: 12,
            background: colors.panel,
            border: `1px solid ${colors.border}`,
          }}
        >
          <p style={{ color: colors.muted, margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
            No likes to learn from yet. Thumb up tracks as you listen — or bring in
            the star ratings you already have — and they'll shape what shows up here.
          </p>
          <button
            onClick={() => {
              window.location.hash = "settings";
            }}
            className="rsn-btn"
            style={{
              background: fx.btnBg,
              color: "white",
              border: "none",
              borderRadius: 8,
              padding: "9px 16px",
              boxShadow: fx.btnGlow,
              cursor: "pointer",
              font: "inherit",
              fontWeight: 600,
            }}
          >
            Import my ratings →
          </button>
        </div>
      ) : (
        <>
          <SavePlaylistBar defaultName="Loved" trackIds={tracks.map((t) => t.id)} />
          <div style={{ display: "grid", gap: 6 }}>
            {tracks.map((t) => (
              <TrackRow key={t.id} track={t} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
