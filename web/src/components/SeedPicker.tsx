import { useEffect, useState } from "react";
import type { Track } from "@resonarr/shared";
import { searchTracks } from "../api";
import { TrackRow } from "./TrackRow";
import { colors } from "../theme";

/** Search-and-pick a single seed track. */
export function SeedPicker({
  label,
  selected,
  onPick,
}: {
  label: string;
  selected: Track | null;
  onPick: (track: Track | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const s = q.trim();
    if (!s) {
      setResults([]);
      return;
    }
    setSearching(true);
    const h = setTimeout(() => {
      searchTracks(s)
        .then(setResults)
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(h);
  }, [q]);

  if (selected) {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <span style={{ color: colors.muted, fontSize: "0.8rem" }}>{label}</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            borderRadius: 6,
            background: "rgba(124,92,255,0.12)",
            border: `1px solid ${colors.accent}`,
          }}
        >
          <span style={{ flex: 1 }}>
            {selected.title} — {selected.artist}
          </span>
          <button
            onClick={() => {
              onPick(null);
              setQ("");
            }}
            style={{
              background: "transparent",
              color: colors.muted,
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ color: colors.muted, fontSize: "0.8rem" }}>{label}</span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a track…"
        style={{
          background: colors.panel,
          color: colors.text,
          border: `1px solid ${colors.border}`,
          borderRadius: 6,
          padding: "9px 12px",
        }}
      />
      {searching && (
        <span style={{ color: colors.muted, fontSize: "0.85rem" }}>Searching…</span>
      )}
      {results.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {results.slice(0, 8).map((t) => (
            <TrackRow
              key={t.id}
              track={t}
              onClick={() => {
                onPick(t);
                setResults([]);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
