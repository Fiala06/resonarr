import { useState } from "react";
import type { Track } from "@resonarr/shared";
import { getAdventure } from "../api";
import { SeedPicker } from "../components/SeedPicker";
import { SavePlaylistBar } from "../components/SavePlaylistBar";
import { colors, fx } from "../theme";

export function AdventureView() {
  const [start, setStart] = useState<Track | null>(null);
  const [end, setEnd] = useState<Track | null>(null);
  const [path, setPath] = useState<Track[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function build() {
    if (!start || !end) return;
    setLoading(true);
    setError(null);
    setPath(null);
    try {
      const res = await getAdventure(start.id, end.id, 10);
      setPath(res.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rsn-rise" style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 1.4, fontWeight: 700, color: colors.accentLight }}>
          SONIC ADVENTURE
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", letterSpacing: "-0.4px" }}>
          A sonic path between two tracks
        </h1>
        <div style={{ width: 42, height: 3, borderRadius: 3, background: fx.accentBar, marginTop: 12 }} />
        <p style={{ color: colors.muted, margin: "12px 0 0", fontSize: 13.5 }}>
          It eases from the start into the destination, stepping through sonic
          neighbors along the way.
        </p>
      </div>

      <SeedPicker label="Start" selected={start} onPick={setStart} />
      <SeedPicker label="Destination" selected={end} onPick={setEnd} />

      <div>
        <button
          onClick={build}
          disabled={loading || !start || !end}
          className="rsn-btn"
          style={{
            background: fx.btnBg,
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "10px 18px",
            boxShadow: fx.btnGlow,
            cursor: loading || !start || !end ? "default" : "pointer",
            opacity: loading || !start || !end ? 0.6 : 1,
          }}
        >
          {loading ? "Charting…" : "Build adventure"}
        </button>
      </div>

      {error && <p style={{ color: colors.red, margin: 0 }}>Error: {error}</p>}

      {path && (
        <>
          <SavePlaylistBar
            defaultName={
              start && end ? `${start.title} → ${end.title}` : "Sonic Adventure"
            }
            trackIds={path.map((t) => t.id)}
          />
          <div style={{ display: "grid", gap: 6 }}>
            {path.map((t, i) => (
              <div
                key={`${t.id}-${i}`}
                style={{ display: "flex", gap: 10, alignItems: "center" }}
              >
                <span
                  style={{
                    color: colors.muted,
                    width: 20,
                    textAlign: "right",
                    fontSize: "0.85rem",
                  }}
                >
                  {i + 1}
                </span>
                <div
                  className="rsn-row"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "10px 12px",
                    borderRadius: 9,
                    background: fx.rowBg,
                    boxShadow: fx.rowShadow,
                    border: `1px solid ${
                      i === 0 || i === path.length - 1
                        ? colors.accent
                        : colors.border
                    }`,
                  }}
                >
                  <div
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {t.title}
                  </div>
                  <div
                    style={{
                      color: colors.muted,
                      fontSize: "0.85rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {t.artist}
                    {t.album ? ` — ${t.album}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
