import { useEffect, useState } from "react";
import type { PlaylistSummary } from "@resonarr/shared";
import { addToPlaylist, createPlaylist, getPlaylists } from "../api";
import { colors, fx } from "../theme";

/** Save tracks to a NEW Plex playlist or append to an EXISTING one. */
export function SavePlaylistBar({
  defaultName,
  trackIds,
}: {
  defaultName: string;
  trackIds: string[];
}) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [target, setTarget] = useState("new"); // "new" or a playlist id
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setName(defaultName);
    setMsg(null);
  }, [defaultName]);

  useEffect(() => {
    getPlaylists()
      .then(setPlaylists)
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      if (target === "new") {
        const r = await createPlaylist(name.trim() || defaultName, trackIds);
        setMsg(`Created "${r.name}" (${r.trackCount} tracks) ✓`);
      } else {
        const pl = playlists.find((p) => p.id === target);
        const r = await addToPlaylist(target, trackIds);
        setMsg(`Added ${r.added} to "${pl?.title ?? "playlist"}" ✓`);
      }
    } catch (e) {
      setMsg(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <select value={target} onChange={(e) => setTarget(e.target.value)} style={selectStyle}>
          <option value="new">➕ New playlist…</option>
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} ({p.trackCount})
            </option>
          ))}
        </select>
        {target === "new" && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Playlist name"
            style={inputStyle}
          />
        )}
        <button
          onClick={save}
          disabled={saving || trackIds.length === 0}
          className="rsn-btn"
          style={{
            background: fx.btnBg,
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "10px 16px",
            boxShadow: fx.btnGlow,
            cursor: saving ? "default" : "pointer",
            opacity: saving || trackIds.length === 0 ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {saving
            ? "Saving…"
            : target === "new"
              ? `Create (${trackIds.length})`
              : `Add (${trackIds.length})`}
        </button>
      </div>
      {msg && (
        <span
          style={{
            color: msg.startsWith("Failed") ? colors.red : colors.green,
            fontSize: "0.85rem",
          }}
        >
          {msg}
        </span>
      )}
    </div>
  );
}

const inputStyle = {
  flex: 1,
  minWidth: 0,
  background: colors.panel,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "9px 12px",
};
const selectStyle = {
  background: colors.panel,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "9px 10px",
  maxWidth: 220,
};
