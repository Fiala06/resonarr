import { useEffect, useState } from "react";
import type { Track } from "@resonarr/shared";
import { getRadio, searchTracks } from "../api";
import { SavePlaylistBar } from "../components/SavePlaylistBar";
import { AlbumArt } from "../components/AlbumArt";
import { TrackRow } from "../components/TrackRow";
import { Logo } from "../components/Logo";
import { colors, fx } from "../theme";

export function RadioView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);

  const [seed, setSeed] = useState<Track | null>(null);
  const [neighbors, setNeighbors] = useState<Track[]>([]);
  const [limit, setLimit] = useState(25);
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

  async function loadRadio(t: Track, lim: number) {
    setError(null);
    setLoading(true);
    try {
      const res = await getRadio(t.id, lim);
      setNeighbors(res.tracks);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function pickSeed(t: Track) {
    setSeed(t);
    setQuery("");
    setResults([]);
    setNeighbors([]);
    void loadRadio(t, limit);
  }

  function changeLimit(n: number) {
    setLimit(n);
    if (seed) void loadRadio(seed, n);
  }

  function matchFor(i: number, n: number) {
    // Plex returns neighbors by sonic distance; approximate a % from rank.
    return Math.max(55, Math.round(99 - (i / Math.max(1, n - 1)) * 42));
  }

  return (
    <section className="rsn-rise" style={{ display: "grid", gap: 16 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 1.4, fontWeight: 700, color: colors.accentLight }}>
          RADIO
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", letterSpacing: "-0.4px" }}>
          A station from any seed
        </h1>
        <div style={{ width: 42, height: 3, borderRadius: 3, background: fx.accentBar, marginTop: 12 }} />
        <div style={{ fontSize: 13.5, color: colors.muted, marginTop: 12 }}>
          Pick a seed track — Resonarr finds sonically similar tracks you own and
          saves them straight to your library.
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
                <div
                  key={t.id}
                  onClick={() => pickSeed(t)}
                  className="rsn-row"
                  style={{ ...rowStyle, cursor: "pointer" }}
                >
                  <AlbumArt
                    thumb={t.thumb}
                    tint={colors.seedBg}
                    album={t.album}
                    artist={t.artist}
                    line="In your library"
                    tone="owned"
                  />
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
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 14,
              background: colors.panel,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: 18,
              overflow: "hidden",
              boxShadow: fx.cardShadow,
            }}
          >
            {/* breathing glow behind the content */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: fx.seedGlow,
                animation: "resonarr-breathe 5.5s ease-in-out infinite",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "relative",
                width: 60,
                height: 60,
                borderRadius: 8,
                background: colors.seedBg,
                flex: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                filter: fx.logoGlow,
              }}
            >
              <Logo size={24} />
            </div>
            <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, letterSpacing: 1.2, color: colors.accentLight, fontWeight: 700 }}>SEED TRACK</div>
              <div style={{ fontSize: 17, fontWeight: 600, marginTop: 3 }}>{seed.title}</div>
              <div style={sub}>{seed.artist}{seed.album ? ` — ${seed.album}` : ""}</div>
            </div>
            <button
              onClick={() => {
                setSeed(null);
                setNeighbors([]);
              }}
              className="rsn-btn"
              style={{ ...ghostBtn, position: "relative" }}
            >
              Change seed
            </button>
          </div>

          {loading && <p style={{ color: colors.muted, margin: 0 }}>Finding similar tracks…</p>}

          {neighbors.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  Sonically similar in your library <span style={{ color: colors.muted }}>· {neighbors.length}</span>
                </div>
                <label style={{ display: "flex", gap: 6, alignItems: "center", color: colors.muted, fontSize: 13 }}>
                  Songs
                  <select
                    value={limit}
                    onChange={(e) => changeLimit(Number(e.target.value))}
                    style={{ background: colors.panel, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 6, padding: "5px 8px" }}
                  >
                    {[10, 25, 50, 75, 100].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
              </div>
              <SavePlaylistBar defaultName={`${seed.title} Radio`} trackIds={[seed.id, ...neighbors.map((t) => t.id)]} />
              <div style={{ display: "grid", gap: 6 }}>
                {neighbors.map((t, i) => (
                  <TrackRow
                    key={t.id}
                    track={t}
                    right={<span style={matchBadge}>{matchFor(i, neighbors.length)}% match</span>}
                  />
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
const sub = { fontSize: 12, color: colors.muted };
const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 9,
  background: fx.rowBg,
  border: `1px solid ${colors.border}`,
  boxShadow: fx.rowShadow,
};
const matchBadge = {
  fontSize: 11,
  fontWeight: 600,
  color: colors.accentLight,
  background: fx.badgeHi,
  border: `1px solid rgba(124,92,255,0.35)`,
  borderRadius: 20,
  padding: "4px 11px",
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
