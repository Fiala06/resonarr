import { useEffect, useState } from "react";
import type { Track } from "@resonarr/shared";
import { getRadio, searchTracks } from "../api";
import { SavePlaylistBar } from "../components/SavePlaylistBar";
import { Logo } from "../components/Logo";
import { colors } from "../theme";

export function RadioView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);

  const [seed, setSeed] = useState<Track | null>(null);
  const [neighbors, setNeighbors] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    const h = setTimeout(() => {
      searchTracks(q)
        .then(setResults)
        .catch((e) => setError(String(e)))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(h);
  }, [query]);

  async function pickSeed(t: Track) {
    setSeed(t);
    setQuery("");
    setResults([]);
    setNeighbors([]);
    setError(null);
    setLoading(true);
    try {
      const res = await getRadio(t.id);
      setNeighbors(res.tracks);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function matchFor(i: number, n: number) {
    // Plex returns neighbors by sonic distance; approximate a % from rank.
    return Math.max(55, Math.round(99 - (i / Math.max(1, n - 1)) * 42));
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Radio</h1>
        <div style={{ fontSize: 13, color: colors.muted, marginTop: 3 }}>
          Pick a seed track — Resonarr finds sonically similar tracks you own and
          saves them straight to Plex.
        </div>
      </div>

      {!seed && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your library for a seed track…"
            style={fieldStyle}
          />
          {searching && <p style={{ color: colors.muted, margin: 0 }}>Searching…</p>}
          {results.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              {results.map((t) => (
                <div key={t.id} onClick={() => pickSeed(t)} style={{ ...rowStyle, cursor: "pointer" }}>
                  <div style={art} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>{t.title}</div>
                    <div style={sub}>{t.artist}{t.album ? ` — ${t.album}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {error && <p style={{ color: colors.red, margin: 0 }}>Error: {error}</p>}

      {seed && (
        <>
          {/* seed card */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: 6, background: colors.seedBg, flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Logo size={22} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, letterSpacing: 1, color: colors.accentLight, fontWeight: 600 }}>SEED TRACK</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{seed.title}</div>
              <div style={sub}>{seed.artist}{seed.album ? ` — ${seed.album}` : ""}</div>
            </div>
            <button
              onClick={() => {
                setSeed(null);
                setNeighbors([]);
              }}
              style={ghostBtn}
            >
              Change seed
            </button>
          </div>

          {loading && <p style={{ color: colors.muted, margin: 0 }}>Finding similar tracks…</p>}

          {neighbors.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                Sonically similar in your library <span style={{ color: colors.muted }}>· {neighbors.length}</span>
              </div>
              <SavePlaylistBar defaultName={`${seed.title} Radio`} trackIds={[seed.id, ...neighbors.map((t) => t.id)]} />
              <div style={{ display: "grid", gap: 6 }}>
                {neighbors.map((t, i) => (
                  <div key={t.id} style={rowStyle}>
                    <div style={art} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14 }}>{t.title}</div>
                      <div style={sub}>{t.artist}{t.album ? ` — ${t.album}` : ""}</div>
                    </div>
                    <span style={matchBadge}>{matchFor(i, neighbors.length)}% match</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

const fieldStyle = {
  background: colors.panel,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "10px 12px",
};
const art = { width: 32, height: 32, borderRadius: 4, background: colors.panel2, flex: "none" as const };
const sub = { fontSize: 12, color: colors.muted };
const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "9px 11px",
  borderRadius: 6,
  background: colors.panel,
  border: `1px solid ${colors.border}`,
};
const matchBadge = {
  fontSize: 11,
  color: colors.accentLight,
  background: "rgba(124,92,255,0.12)",
  border: `1px solid #3a3550`,
  borderRadius: 20,
  padding: "3px 9px",
  whiteSpace: "nowrap" as const,
};
const ghostBtn = {
  font: "inherit",
  fontSize: 13,
  fontWeight: 600,
  background: "transparent",
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "9px 15px",
  cursor: "pointer",
};
