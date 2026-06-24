import { useCallback, useEffect, useState } from "react";
import type { DeepCutsMode, DeepCutsResponse, Track } from "@resonarr/shared";
import { getDeepCuts } from "../api";
import { TrackRow } from "../components/TrackRow";
import { SavePlaylistBar } from "../components/SavePlaylistBar";
import { colors, fx } from "../theme";

const MODES: { key: DeepCutsMode; label: string; blurb: string }[] = [
  {
    key: "never",
    label: "Buried treasure",
    blurb: "Owned tracks you've never once pressed play on — a fresh shuffle each visit.",
  },
  {
    key: "faded",
    label: "Faded favorites",
    blurb: "Songs you played a lot but have drifted from — longest-forgotten first.",
  },
];

export function DeepCutsView() {
  const [mode, setMode] = useState<DeepCutsMode>("never");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeepCutsResponse | null>(null);

  const run = useCallback(async (m: DeepCutsMode) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await getDeepCuts(m));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run(mode);
  }, [mode, run]);

  const active = MODES.find((m) => m.key === mode)!;

  return (
    <section className="rsn-rise" style={{ display: "grid", gap: 18 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 1.4, fontWeight: 700, color: colors.accentLight }}>
          DEEP CUTS
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", letterSpacing: "-0.4px" }}>
          Rediscover your own shelf
        </h1>
        <div style={{ width: 42, height: 3, borderRadius: 3, background: fx.accentBar, marginTop: 12 }} />
        <div style={{ fontSize: 13.5, color: colors.muted, marginTop: 12 }}>
          In a library this size, most tracks rarely get played. {active.blurb}
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 8 }}>
        {MODES.map((m) => {
          const on = m.key === mode;
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className="rsn-btn"
              style={{
                font: "inherit",
                fontSize: 13,
                fontWeight: 600,
                padding: "8px 16px",
                borderRadius: 8,
                cursor: "pointer",
                color: on ? "#fff" : colors.muted,
                background: on ? fx.btnBg : "transparent",
                border: `1px solid ${on ? "transparent" : colors.border}`,
                boxShadow: on ? fx.btnGlow : "none",
              }}
            >
              {m.label}
            </button>
          );
        })}
        {mode === "never" && (
          <button
            onClick={() => run("never")}
            disabled={loading}
            title="Pull a different random set"
            className="rsn-btn"
            style={{
              font: "inherit",
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 14px",
              borderRadius: 8,
              cursor: "pointer",
              color: colors.accentLight,
              background: "transparent",
              border: `1px solid ${colors.border}`,
              marginLeft: "auto",
            }}
          >
            ↻ Reshuffle
          </button>
        )}
      </div>

      {loading && <p style={{ color: colors.muted, margin: 0 }}>Digging…</p>}
      {error && <p style={{ color: colors.red, margin: 0 }}>Error: {error}</p>}

      {result && !loading && (
        <div style={{ display: "grid", gap: 10 }}>
          {result.tracks.length === 0 ? (
            <p style={{ color: colors.muted, margin: 0 }}>
              {mode === "never"
                ? "Nothing unplayed surfaced — you may have already given this library a thorough listen."
                : "No faded favorites yet — you tend to keep up with the music you love."}
            </p>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {result.tracks.length} tracks{" "}
                <span style={{ color: colors.muted, fontWeight: 400 }}>
                  · {active.label.toLowerCase()}
                </span>
              </div>
              <SavePlaylistBar
                defaultName={`${active.label} · Resonarr`}
                trackIds={result.tracks.map((t) => t.id)}
              />
              <div style={{ display: "grid", gap: 6 }}>
                {result.tracks.map((t) => (
                  <TrackRow
                    key={t.id}
                    track={t}
                    right={
                      <span style={{ fontSize: 11, color: colors.faint, whiteSpace: "nowrap" }}>
                        {playStat(t)}
                      </span>
                    }
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** Human-readable play summary for the row's right edge. */
function playStat(t: Track): string {
  const plays = t.viewCount ?? 0;
  if (plays === 0) return "never played";
  const last = t.lastPlayedAt ? ` · ${ago(t.lastPlayedAt)}` : "";
  return `${plays} play${plays === 1 ? "" : "s"}${last}`;
}

/** Coarse "time ago" from an epoch-seconds timestamp. */
function ago(epochSeconds: number): string {
  const days = Math.floor((Date.now() / 1000 - epochSeconds) / 86_400);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}
