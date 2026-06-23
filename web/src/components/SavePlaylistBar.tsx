import { useEffect, useState } from "react";
import { createPlaylist } from "../api";
import { colors } from "../theme";

/** Name input + Save button that creates a Plex playlist from track ids. */
export function SavePlaylistBar({
  defaultName,
  trackIds,
}: {
  defaultName: string;
  trackIds: string[];
}) {
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setName(defaultName);
    setMsg(null);
  }, [defaultName]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await createPlaylist(name.trim() || defaultName, trackIds);
      setMsg(`Created "${r.name}" (${r.trackCount} tracks) ✓`);
    } catch (e) {
      setMsg(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Playlist name"
          style={{
            flex: 1,
            minWidth: 0,
            background: colors.panel,
            color: colors.text,
            border: `1px solid ${colors.border}`,
            borderRadius: 6,
            padding: "9px 12px",
          }}
        />
        <button
          onClick={save}
          disabled={saving || trackIds.length === 0}
          style={{
            background: colors.accent,
            color: "white",
            border: "none",
            borderRadius: 6,
            padding: "9px 16px",
            cursor: saving ? "default" : "pointer",
            opacity: saving || trackIds.length === 0 ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {saving ? "Saving…" : `Save (${trackIds.length})`}
        </button>
      </div>
      {msg && (
        <span
          style={{
            color: msg.startsWith("Save failed") ? colors.red : colors.green,
            fontSize: "0.85rem",
          }}
        >
          {msg}
        </span>
      )}
    </div>
  );
}
