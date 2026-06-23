import { useEffect, useState } from "react";
import type { DiscoveryResult } from "@resonarr/shared";
import {
  bulkAddBasket,
  createPlaylist,
  getSettings,
  runSage,
} from "../api";
import { colors } from "../theme";

export function SageView() {
  const [prompt, setPrompt] = useState("");
  const [bias, setBias] = useState(false);
  const [provider, setProvider] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoveryResult | null>(null);

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

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
    setSaveMsg(null);
    setAdded(new Set());
    try {
      const res = await runSage(p, bias);
      setResult(res);
      setName(`${p.slice(0, 40)} (Sage)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function savePlaylist() {
    if (!result || result.matches.length === 0) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await createPlaylist(
        name.trim() || "Sage",
        result.matches.map((t) => t.id),
      );
      setSaveMsg(`Saved "${res.name}" (${res.trackCount} tracks) ✓`);
    } catch (e) {
      setSaveMsg(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
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
    <section style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Sonic Sage</h1>
        <div style={{ fontSize: 13, color: colors.muted, marginTop: 3 }}>
          Discovery that reaches past your shelves.{" "}
          {provider && (
            <>
              Using <strong>{provider}</strong>.{" "}
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
        <button onClick={generate} disabled={generating} style={primaryBtn(generating)}>
          {generating ? "Thinking…" : "Generate"}
        </button>
        <label style={{ display: "flex", gap: 6, alignItems: "center", color: colors.muted }}>
          <input type="checkbox" checked={bias} onChange={(e) => setBias(e.target.checked)} />
          Bias toward artists I own
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
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={name} onChange={(e) => setName(e.target.value)} style={field} />
                  <button onClick={savePlaylist} disabled={saving} style={{ ...primaryBtn(saving), whiteSpace: "nowrap" }}>
                    {saving ? "Saving…" : `Save playlist (${result.matches.length})`}
                  </button>
                </div>
                {saveMsg && (
                  <span style={{ color: saveMsg.startsWith("Save failed") ? colors.red : colors.green, fontSize: 13 }}>
                    {saveMsg}
                  </span>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {result.matches.map((t) => (
                    <div key={t.id} style={ownedRow}>
                      <div style={art} />
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
                <button onClick={addAll} disabled={addingAll} style={{ ...ghostBtn, marginLeft: "auto" }}>
                  {addingAll ? "Adding…" : "Add all"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {result.misses.map((m, i) => (
                  <div key={`${m.artist}-${m.title}-${i}`} style={missRow}>
                    <div style={{ ...art, background: "#1f2330" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14 }}>
                        {m.title ? `${m.title} — ` : ""}
                        {m.artist}
                      </div>
                      {m.album && <div style={sub}>{m.album}</div>}
                    </div>
                    {added.has(i) ? (
                      <span style={{ fontSize: 11, color: colors.green }}>✓ in basket</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 11, color: colors.gold }}>not owned</span>
                        <button onClick={() => addMiss(i)} style={requestBtn}>Request</button>
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

const field = {
  flex: 1,
  minWidth: 0,
  background: colors.panel,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "9px 12px",
};
const art = {
  width: 32,
  height: 32,
  borderRadius: 4,
  background: colors.panel2,
  flex: "none" as const,
};
const sub = { fontSize: 12, color: colors.muted };
const ownedRow = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "9px 11px",
  borderRadius: 6,
  background: colors.panel,
  border: `1px solid ${colors.border}`,
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
    background: colors.accent,
    color: "white",
    border: "none",
    borderRadius: 6,
    padding: "9px 18px",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}
