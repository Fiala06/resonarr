import { useEffect, useState } from "react";
import type { DiscoveryResult } from "@resonarr/shared";
import { bulkAddBasket, getSettings, runSage } from "../api";
import { AlbumArt } from "../components/AlbumArt";
import { AuditionLinks } from "../components/AuditionLinks";
import { InfoHint } from "../components/InfoHint";
import { SavePlaylistBar } from "../components/SavePlaylistBar";
import { colors, fx } from "../theme";

export function SageView() {
  const [prompt, setPrompt] = useState("");
  const [bias, setBias] = useState(false);
  const [count, setCount] = useState(25);
  const [provider, setProvider] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoveryResult | null>(null);

  const [name, setName] = useState("");
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [addingAll, setAddingAll] = useState(false);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setBias(s.ownArtistBias);
        setProvider(s.llmProvider);
      })
      .catch(() => {});
  }, []);

  async function generate() {
    const p = prompt.trim();
    if (!p) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    setAdded(new Set());
    try {
      const res = await runSage(p, bias, count);
      setResult(res);
      setName(`${p.slice(0, 40)} (Sage)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function addMiss(i: number) {
    if (!result) return;
    const m = result.misses[i];
    if (!m) return;
    try {
      await bulkAddBasket([
        { artist: m.artist, album: m.album, source: "sonic-sage" },
      ]);
      setAdded((prev) => new Set(prev).add(i));
    } catch {
      /* ignore — surfaced via the all-add path otherwise */
    }
  }

  async function addAll() {
    if (!result) return;
    setAddingAll(true);
    try {
      const remaining = result.misses
        .map((m, i) => ({ m, i }))
        .filter(({ i }) => !added.has(i));
      await bulkAddBasket(
        remaining.map(({ m }) => ({
          artist: m.artist,
          album: m.album,
          source: "sonic-sage" as const,
        })),
      );
      setAdded(new Set(result.misses.map((_, i) => i)));
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
          SONIC SAGE
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", letterSpacing: "-0.4px" }}>
          Discovery that reaches past your shelves
        </h1>
        <div style={{ width: 42, height: 3, borderRadius: 3, background: fx.accentBar, marginTop: 12 }} />
        <div style={{ fontSize: 13.5, color: colors.muted, marginTop: 12 }}>
          {provider && (
            <>
              Using <strong style={{ color: colors.text }}>{provider}</strong>.{" "}
            </>
          )}
          Plays what you own, and turns the gaps into Lidarr requests.
        </div>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe a vibe — e.g. mellow late-night indie for focus, or 90s alt-rock deep cuts like my Pearl Jam"
        rows={3}
        style={{
          background: colors.panel,
          color: colors.text,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          padding: "12px 14px",
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <button
          onClick={generate}
          disabled={generating}
          className="rsn-btn"
          style={primaryBtn(generating)}
        >
          {generating ? "Thinking…" : "Generate"}
        </button>
        <label style={{ display: "flex", gap: 6, alignItems: "center", color: colors.muted }}>
          Songs
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
            {[10, 25, 50, 75, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", color: colors.muted }}>
          <input type="checkbox" checked={bias} onChange={(e) => setBias(e.target.checked)} />
          Bias toward artists I own
          <InfoHint text="Nudges suggestions toward artists already in your library, so you get more playable tracks now and fewer items to download." />
        </label>
      </div>

      {error && <p style={{ color: colors.red, margin: 0 }}>Error: {error}</p>}

      {result && (
        <>
          {/* In library */}
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                From your library{" "}
                <span style={{ color: colors.green }}>· {result.matches.length} ready</span>
              </div>
            </div>
            {result.matches.length === 0 ? (
              <p style={{ color: colors.muted, margin: 0, fontSize: 13 }}>No owned matches.</p>
            ) : (
              <>
                <SavePlaylistBar defaultName={name} trackIds={result.matches.map((t) => t.id)} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {result.matches.map((t) => (
                    <div key={t.id} className="rsn-row" style={ownedRow}>
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
                      <span style={{ fontSize: 11, color: colors.green }}>✓ In library</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Not in library */}
          {result.misses.length > 0 && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  Not in your library <span style={{ color: colors.muted }}>· {result.misses.length}</span>
                </div>
                <div style={{ fontSize: 12, color: colors.muted }}>
                  — one click sends these to Lidarr; tracked in your Basket, never dropped.
                </div>
                <button
                  onClick={addAll}
                  disabled={addingAll}
                  className="rsn-btn"
                  style={{ ...ghostBtn, marginLeft: "auto" }}
                >
                  {addingAll ? "Adding…" : "Add all"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {result.misses.map((m, i) => (
                  <div key={`${m.artist}-${m.title}-${i}`} className="rsn-row" style={missRow}>
                    <AlbumArt
                      album={m.album ?? m.artist}
                      artist={m.artist}
                      tint={colors.seedBg}
                      line="Not in your library yet"
                      tone="missing"
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14 }}>
                        {m.title ? `${m.title} — ` : ""}
                        {m.artist}
                      </div>
                      {m.album && <div style={sub}>{m.album}</div>}
                    </div>
                    <AuditionLinks artist={m.artist} album={m.album} title={m.title} />
                    {added.has(i) ? (
                      <span style={{ fontSize: 11, color: colors.green }}>✓ in basket</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 11, color: colors.gold }}>not owned</span>
                        <button onClick={() => addMiss(i)} className="rsn-btn" style={requestBtn}>Request</button>
                      </>
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
const ownedRow = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 9,
  background: fx.rowBg,
  border: `1px solid ${colors.border}`,
  boxShadow: fx.rowShadow,
};
const missRow = { ...ownedRow, border: `1px dashed #3a3550` };
const requestBtn = {
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
