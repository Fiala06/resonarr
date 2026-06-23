import { useEffect, useState } from "react";
import type { DiscoveryResult } from "@resonarr/shared";
import {
  bulkAddBasket,
  createPlaylist,
  getSettings,
  runSage,
} from "../api";
import { TrackRow } from "../components/TrackRow";
import { colors } from "../theme";

export function SageView() {
  const [prompt, setPrompt] = useState("");
  const [bias, setBias] = useState(false);
  const [provider, setProvider] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoveryResult | null>(null);

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [selectedMisses, setSelectedMisses] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);

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
    setAddMsg(null);
    try {
      const res = await runSage(p, bias);
      setResult(res);
      setName(`${p.slice(0, 40)} (Sage)`);
      setSelectedMisses(new Set(res.misses.map((_, i) => i)));
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
      setSaveMsg(`Created "${res.name}" (${res.trackCount} tracks) ✓`);
    } catch (e) {
      setSaveMsg(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  function toggleMiss(i: number) {
    setSelectedMisses((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function addMisses() {
    if (!result) return;
    const items = [...selectedMisses].map((i) => result.misses[i]).filter(Boolean);
    if (items.length === 0) return;
    setAdding(true);
    setAddMsg(null);
    try {
      const res = await bulkAddBasket(
        items.map((m) => ({
          artist: m!.artist,
          album: m!.album,
          source: "sonic-sage" as const,
        })),
      );
      setAddMsg(
        `Added ${res.added.length} to basket${res.failed.length ? `, ${res.failed.length} unmatched` : ""} ✓`,
      );
    } catch (e) {
      setAddMsg(`Add failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAdding(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 16, maxWidth: 600 }}>
      <div>
        <h2 style={{ fontSize: "1rem", margin: "0 0 4px" }}>Sonic Sage</h2>
        <p style={{ color: colors.muted, margin: 0, fontSize: "0.9rem" }}>
          Describe what you want. {provider && <>Using <strong>{provider}</strong>. </>}
          Tracks you own become a playlist; the rest go to the basket.
        </p>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g. mellow late-night indie for focus, or 90s alt-rock deep cuts like my Pearl Jam"
        rows={3}
        style={{
          background: colors.panel,
          color: colors.text,
          border: `1px solid ${colors.border}`,
          borderRadius: 6,
          padding: "10px 12px",
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />

      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <button
          onClick={generate}
          disabled={generating}
          style={{
            background: colors.accent,
            color: "white",
            border: "none",
            borderRadius: 6,
            padding: "9px 18px",
            cursor: generating ? "default" : "pointer",
            opacity: generating ? 0.7 : 1,
          }}
        >
          {generating ? "Thinking…" : "Generate"}
        </button>
        <label
          style={{ display: "flex", gap: 6, alignItems: "center", color: colors.muted }}
        >
          <input
            type="checkbox"
            checked={bias}
            onChange={(e) => setBias(e.target.checked)}
          />
          Bias toward artists I own
        </label>
      </div>

      {error && <p style={{ color: colors.red, margin: 0 }}>Error: {error}</p>}

      {result && (
        <>
          {/* Matches -> playlist */}
          <div style={{ display: "grid", gap: 8 }}>
            <h3 style={{ fontSize: "0.95rem", margin: 0 }}>
              In your library ({result.matches.length})
            </h3>
            {result.matches.length === 0 ? (
              <p style={{ color: colors.muted, margin: 0 }}>No owned matches.</p>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Playlist name"
                    style={fieldStyle}
                  />
                  <button
                    onClick={savePlaylist}
                    disabled={saving}
                    style={{ ...primaryBtn, whiteSpace: "nowrap" }}
                  >
                    {saving ? "Saving…" : `Save (${result.matches.length})`}
                  </button>
                </div>
                {saveMsg && (
                  <span
                    style={{
                      color: saveMsg.startsWith("Save failed")
                        ? colors.red
                        : colors.green,
                      fontSize: "0.85rem",
                    }}
                  >
                    {saveMsg}
                  </span>
                )}
                <div style={{ display: "grid", gap: 6 }}>
                  {result.matches.map((t) => (
                    <TrackRow key={t.id} track={t} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Misses -> basket */}
          <div style={{ display: "grid", gap: 8 }}>
            <h3 style={{ fontSize: "0.95rem", margin: 0 }}>
              Not owned ({result.misses.length})
            </h3>
            {result.misses.length === 0 ? (
              <p style={{ color: colors.muted, margin: 0 }}>
                You own everything suggested. Nice.
              </p>
            ) : (
              <>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button
                    onClick={addMisses}
                    disabled={adding || selectedMisses.size === 0}
                    style={{
                      ...primaryBtn,
                      opacity: selectedMisses.size === 0 ? 0.5 : 1,
                    }}
                  >
                    {adding
                      ? "Adding…"
                      : `Add ${selectedMisses.size} to basket`}
                  </button>
                  {addMsg && (
                    <span style={{ color: colors.muted, fontSize: "0.85rem" }}>
                      {addMsg}
                    </span>
                  )}
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {result.misses.map((m, i) => (
                    <label
                      key={`${m.artist}-${m.title}-${i}`}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        padding: "8px 10px",
                        borderRadius: 6,
                        background: colors.panel,
                        border: `1px solid ${colors.border}`,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMisses.has(i)}
                        onChange={() => toggleMiss(i)}
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {m.title ? `${m.title} — ` : ""}
                        {m.artist}
                        {m.album ? (
                          <span style={{ color: colors.muted }}> [{m.album}]</span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

const fieldStyle = {
  flex: 1,
  minWidth: 0,
  background: colors.panel,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "9px 12px",
};

const primaryBtn = {
  background: colors.accent,
  color: "white",
  border: "none",
  borderRadius: 6,
  padding: "9px 16px",
  cursor: "pointer",
};
