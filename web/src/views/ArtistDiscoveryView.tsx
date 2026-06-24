import { useEffect, useRef, useState } from "react";
import type { ArtistCandidate, ArtistDiscoveryResponse } from "@resonarr/shared";
import { bulkAddBasket, discoverArtists } from "../api";
import { AlbumArt } from "../components/AlbumArt";
import { AuditionLinks } from "../components/AuditionLinks";
import { colors, fx } from "../theme";

export function ArtistDiscoveryView() {
  const [count, setCount] = useState(12);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ArtistDiscoveryResponse | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [addingAll, setAddingAll] = useState(false);
  const startedAt = useRef(0);

  // Tick an elapsed-seconds counter while a run is in flight — the lookups are
  // sequential and can take ~20s, so the user needs visible proof it's working.
  useEffect(() => {
    if (!loading) return;
    startedAt.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [loading]);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    setAdded(new Set());
    try {
      setResult(await discoverArtists(count));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function add(c: ArtistCandidate) {
    try {
      await bulkAddBasket([{ artist: c.artist, source: "artist-discovery" }]);
      setAdded((prev) => new Set(prev).add(c.mbid));
    } catch {
      /* surfaced via add-all otherwise */
    }
  }

  async function addAll() {
    if (!result) return;
    setAddingAll(true);
    try {
      const remaining = result.candidates.filter((c) => !added.has(c.mbid));
      await bulkAddBasket(
        remaining.map((c) => ({ artist: c.artist, source: "artist-discovery" as const })),
      );
      setAdded(new Set(result.candidates.map((c) => c.mbid)));
    } catch {
      /* ignore */
    } finally {
      setAddingAll(false);
    }
  }

  return (
    <section className="rsn-rise" style={{ display: "grid", gap: 18 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 1.4, fontWeight: 700, color: colors.accentLight }}>
          ARTIST DISCOVERY
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", letterSpacing: "-0.4px" }}>
          Artists like the ones you love
        </h1>
        <div style={{ width: 42, height: 3, borderRadius: 3, background: fx.accentBar, marginTop: 12 }} />
        <div style={{ fontSize: 13.5, color: colors.muted, marginTop: 12 }}>
          Seeded from the artists you actually play, expanded into adjacent ones
          you don’t own yet — every suggestion verified against Lidarr, one click
          from your basket. The thing Plexamp can’t do: grow the collection.
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <button
          onClick={run}
          disabled={loading}
          className="rsn-btn"
          style={primaryBtn(loading)}
        >
          {loading ? "Searching…" : "Find artists"}
        </button>
        <label style={{ display: "flex", gap: 6, alignItems: "center", color: colors.muted }}>
          Artists
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            style={{
              background: colors.panel,
              color: colors.text,
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              padding: "6px 8px",
            }}
          >
            {[6, 12, 20, 30].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p style={{ color: colors.red, margin: 0 }}>Error: {error}</p>}

      {loading && (
        <div style={{ display: "grid", gap: 12 }}>
          <div className="rsn-loader" />
          <div style={{ fontSize: 12.5, color: colors.muted }}>
            Verifying each suggestion against Lidarr — checked one at a time to
            respect MusicBrainz rate limits, so this can take up to ~20s.{" "}
            <span style={{ color: colors.accentLight }}>{elapsed}s</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Array.from({ length: Math.min(count, 6) }).map((_, i) => (
              <div key={i} className="rsn-skeleton" style={skeletonRow}>
                <div style={{ width: 44, height: 44, borderRadius: 8, background: colors.panel2, flex: "none" }} />
                <div style={{ flex: 1, display: "grid", gap: 7 }}>
                  <div style={{ height: 11, width: "32%", borderRadius: 4, background: colors.panel2 }} />
                  <div style={{ height: 9, width: "72%", borderRadius: 4, background: colors.panel2 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && !loading && (
        <>
          {result.seeds.length > 0 && (
            <div style={{ fontSize: 12.5, color: colors.muted }}>
              Based on your most-played:{" "}
              <span style={{ color: colors.text }}>
                {result.seeds.slice(0, 8).join(", ")}
              </span>
              {result.seeds.length > 8 ? "…" : ""}
            </div>
          )}

          {result.candidates.length === 0 ? (
            <p style={{ color: colors.muted, margin: 0 }}>
              No new artists surfaced — either nothing validated against Lidarr, or
              you already own the obvious neighbors. Try again for a different set.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {result.candidates.length} artists to explore{" "}
                  <span style={{ color: colors.muted, fontWeight: 400 }}>· not in your library</span>
                </div>
                <button
                  onClick={addAll}
                  disabled={addingAll}
                  className="rsn-btn"
                  style={{ ...ghostBtn, marginLeft: "auto" }}
                >
                  {addingAll ? "Adding…" : "Add all to basket"}
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {result.candidates.map((c) => (
                  <div key={c.mbid} className="rsn-row" style={row}>
                    <AlbumArt
                      album={c.artist}
                      artist={c.artist}
                      tint={colors.seedBg}
                      eyebrow="ARTIST"
                      line="Not in your library yet"
                      tone="missing"
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14 }}>
                        {c.artist}
                        {c.disambiguation && (
                          <span style={{ color: colors.faint, fontWeight: 400 }}>
                            {" "}· {c.disambiguation}
                          </span>
                        )}
                      </div>
                      {c.reason && <div style={sub}>{c.reason}</div>}
                    </div>
                    <AuditionLinks artist={c.artist} mbid={c.mbid} />
                    {added.has(c.mbid) ? (
                      <span style={{ fontSize: 11, color: colors.green }}>✓ in basket</span>
                    ) : (
                      <button onClick={() => add(c)} className="rsn-btn" style={addBtn}>
                        Add
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

const sub = { fontSize: 12, color: colors.muted };
const skeletonRow = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 9,
  background: fx.rowBg,
  border: `1px solid ${colors.border}`,
};
const row = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 9,
  background: fx.rowBg,
  border: `1px dashed #3a3550`,
  boxShadow: fx.rowShadow,
};
const addBtn = {
  font: "inherit",
  fontSize: 12,
  fontWeight: 600,
  background: "transparent",
  color: colors.accentLight,
  border: `1px solid ${colors.accent}`,
  borderRadius: 5,
  padding: "6px 13px",
  cursor: "pointer",
};
const ghostBtn = {
  font: "inherit",
  fontSize: 12,
  fontWeight: 600,
  background: "transparent",
  color: colors.accentLight,
  border: `1px solid ${colors.border}`,
  borderRadius: 5,
  padding: "6px 12px",
  cursor: "pointer",
};
function primaryBtn(disabled: boolean) {
  return {
    background: fx.btnBg,
    color: "white",
    border: "none",
    borderRadius: 8,
    padding: "10px 18px",
    boxShadow: fx.btnGlow,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}
