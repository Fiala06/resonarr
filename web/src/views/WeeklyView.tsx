import { useEffect, useState } from "react";
import type {
  AutoPlaylist,
  AutoPlaylistMode,
} from "@resonarr/shared";
import {
  createAutoPlaylist,
  deleteAutoPlaylist,
  getAutoPlaylists,
  runAutoPlaylist,
  updateAutoPlaylist,
} from "../api";
import { InfoHint } from "../components/InfoHint";
import { colors, fx } from "../theme";

export function WeeklyView() {
  const [items, setItems] = useState<AutoPlaylist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  // Create form
  const [name, setName] = useState("Discover Weekly");
  const [size, setSize] = useState(30);
  const [intervalDays, setIntervalDays] = useState(7);
  const [mode, setMode] = useState<AutoPlaylistMode>("replace");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getAutoPlaylists()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  function setBusyFor(id: string, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const made = await createAutoPlaylist({ name, size, intervalDays, mode });
      setItems((prev) => [...(prev ?? []), made]);
      // Build it immediately so there's something to look at right away.
      void refresh(made.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function refresh(id: string) {
    setBusyFor(id, true);
    setError(null);
    try {
      const updated = await runAutoPlaylist(id);
      setItems((prev) => prev?.map((p) => (p.id === id ? updated : p)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyFor(id, false);
    }
  }

  async function toggle(ap: AutoPlaylist) {
    const updated = await updateAutoPlaylist(ap.id, { enabled: !ap.enabled });
    setItems((prev) => prev?.map((p) => (p.id === ap.id ? updated : p)) ?? null);
  }

  async function remove(id: string) {
    await deleteAutoPlaylist(id);
    setItems((prev) => prev?.filter((p) => p.id !== id) ?? null);
  }

  return (
    <section className="rsn-rise" style={{ display: "grid", gap: 18, maxWidth: 680 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 1.4, fontWeight: 700, color: colors.accentLight }}>
          SCHEDULED PLAYLISTS
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", letterSpacing: "-0.4px" }}>
          Your week in new music, on a schedule
        </h1>
        <div style={{ width: 42, height: 3, borderRadius: 3, background: fx.accentBar, marginTop: 12 }} />
        <div style={{ fontSize: 13.5, color: colors.muted, marginTop: 12 }}>
          A Discover-Weekly-style playlist that rebuilds itself on a cadence —
          seeded from what you’ve been playing, expanded by sonic similarity, and
          biased toward music newly added to Plex and tracks you haven’t heard
          lately. It avoids repeating recent weeks.
        </div>
      </div>

      {error && <p style={{ color: colors.red, margin: 0 }}>Error: {error}</p>}

      {/* Existing definitions */}
      {items === null ? (
        <p style={{ color: colors.muted, margin: 0 }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ color: colors.muted, margin: 0 }}>
          No scheduled playlists yet — create one below.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((ap) => (
            <div key={ap.id} className="rsn-card" style={card}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{ap.name}</div>
                <div style={{ fontSize: 12, color: colors.muted }}>
                  every {ap.intervalDays}d · {ap.mode} · {ap.size} tracks
                </div>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    fontWeight: 600,
                    color: ap.enabled ? colors.green : colors.faint,
                  }}
                >
                  {ap.enabled ? "● scheduled" : "○ paused"}
                </span>
              </div>

              <div style={{ fontSize: 12.5, color: colors.muted }}>
                {ap.lastStatus ? (
                  <>
                    <span style={{ color: statusColor(ap.lastStatus) }}>{ap.lastStatus}</span>
                    {ap.lastRunAt ? ` · ${ago(ap.lastRunAt)}` : ""}
                  </>
                ) : (
                  "Not built yet"
                )}
                {ap.enabled && <> · next {when(ap.nextRunAt)}</>}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                <button
                  onClick={() => refresh(ap.id)}
                  disabled={busy.has(ap.id)}
                  className="rsn-btn"
                  style={primaryBtnSm(busy.has(ap.id))}
                >
                  {busy.has(ap.id) ? "Refreshing…" : "Refresh now"}
                </button>
                <button onClick={() => toggle(ap)} className="rsn-btn" style={ghostBtn}>
                  {ap.enabled ? "Pause" : "Resume"}
                </button>
                <button
                  onClick={() => remove(ap.id)}
                  className="rsn-btn"
                  style={{ ...ghostBtn, color: colors.muted, marginLeft: "auto" }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      <div style={{ ...card, gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>New scheduled playlist</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Playlist name"
            style={{ ...input, flex: 1, minWidth: 180 }}
          />
          <label style={label}>
            Songs
            <select value={size} onChange={(e) => setSize(Number(e.target.value))} style={select}>
              {[20, 30, 50, 75].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label style={label}>
            Every
            <select
              value={intervalDays}
              onChange={(e) => setIntervalDays(Number(e.target.value))}
              style={select}
            >
              {[1, 3, 7, 14].map((n) => (
                <option key={n} value={n}>{n}d</option>
              ))}
            </select>
          </label>
          <label style={label}>
            Mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as AutoPlaylistMode)}
              style={select}
            >
              <option value="replace">replace</option>
              <option value="append">append</option>
            </select>
            <InfoHint text="Replace builds a fresh set each cycle (like Discover Weekly). Append keeps growing one playlist as new matches appear." />
          </label>
          <button
            onClick={create}
            disabled={creating}
            className="rsn-btn"
            style={primaryBtnSm(creating)}
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </section>
  );
}

function statusColor(status: string): string {
  return status.startsWith("Failed") ? colors.red : colors.green;
}

/** "in 6d" / "now" for a future epoch-ms timestamp. */
function when(epochMs: number): string {
  const mins = Math.round((epochMs - Date.now()) / 60000);
  if (mins <= 1) return "now";
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

/** "6d ago" for a past epoch-ms timestamp. */
function ago(epochMs: number): string {
  const mins = Math.round((Date.now() - epochMs) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const card = {
  display: "grid",
  gap: 8,
  padding: 14,
  borderRadius: 10,
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  boxShadow: fx.cardShadow,
};
const input = {
  background: colors.bg,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "9px 12px",
};
const select = {
  background: colors.bg,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "7px 9px",
};
const label = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  color: colors.muted,
  fontSize: 13,
};
const ghostBtn = {
  font: "inherit",
  fontSize: 12,
  fontWeight: 600,
  background: "transparent",
  color: colors.accentLight,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "7px 13px",
  cursor: "pointer",
};
function primaryBtnSm(disabled: boolean) {
  return {
    font: "inherit",
    fontSize: 12,
    fontWeight: 600,
    background: fx.btnBg,
    color: "white",
    border: "none",
    borderRadius: 6,
    padding: "8px 14px",
    boxShadow: fx.btnGlow,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}
