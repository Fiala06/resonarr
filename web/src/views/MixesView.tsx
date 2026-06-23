import { useState } from "react";
import type { MixResponse } from "@resonarr/shared";
import { getMixes } from "../api";
import { TrackRow } from "../components/TrackRow";
import { SavePlaylistBar } from "../components/SavePlaylistBar";
import { colors } from "../theme";

export function MixesView() {
  const [mix, setMix] = useState<MixResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      setMix(await getMixes());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <div>
        <h2 style={{ fontSize: "1rem", margin: "0 0 4px" }}>Mixes for You</h2>
        <p style={{ color: colors.muted, margin: 0, fontSize: "0.9rem" }}>
          A mix seeded from your recent listening, expanded by sonic similarity.
        </p>
      </div>

      <div>
        <button
          onClick={generate}
          disabled={loading}
          style={{
            background: colors.accent,
            color: "white",
            border: "none",
            borderRadius: 6,
            padding: "9px 18px",
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Building…" : mix ? "Regenerate mix" : "Generate mix"}
        </button>
      </div>

      {error && <p style={{ color: colors.red, margin: 0 }}>Error: {error}</p>}

      {mix && (
        <>
          {mix.seeds.length > 0 && (
            <p style={{ color: colors.muted, margin: 0, fontSize: "0.85rem" }}>
              Based on: {mix.seeds.map((s) => s.title).join(", ")}
            </p>
          )}
          <SavePlaylistBar
            defaultName="Mix for You"
            trackIds={mix.tracks.map((t) => t.id)}
          />
          <div style={{ display: "grid", gap: 6 }}>
            {mix.tracks.map((t) => (
              <TrackRow key={t.id} track={t} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
