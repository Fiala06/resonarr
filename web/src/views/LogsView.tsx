import { useEffect, useState, type CSSProperties } from "react";
import type { LogEntry, LogLevel } from "@resonarr/shared";
import { clearLogs, getLogs } from "../api";
import { colors, fx } from "../theme";

const LEVEL_COLOR: Record<LogLevel, string> = {
  info: colors.muted,
  warn: colors.gold,
  error: colors.red,
};

// Friendly name + icon for each originating feature, so the simple feed reads
// like plain activity instead of subsystem tags. Unknown sources fall back to a
// neutral dot and the raw source name.
const SOURCE_META: Record<string, { emoji: string; label: string }> = {
  sage: { emoji: "🎵", label: "Describe a Vibe" },
  radio: { emoji: "📻", label: "Radio" },
  mixes: { emoji: "🎚️", label: "Mixes" },
  moods: { emoji: "🎭", label: "Moods" },
  loved: { emoji: "❤️", label: "Loved" },
  discover: { emoji: "🧭", label: "Discover" },
  deepcuts: { emoji: "💎", label: "Deep Cuts" },
  artists: { emoji: "✨", label: "Artists" },
  "artist-discovery": { emoji: "✨", label: "Artists" },
  adventure: { emoji: "🧭", label: "Adventure" },
  weekly: { emoji: "📅", label: "Weekly" },
  "auto-playlist": { emoji: "📅", label: "Weekly" },
  basket: { emoji: "🛒", label: "Wishlist" },
  spotify: { emoji: "🟢", label: "Spotify" },
  profile: { emoji: "📊", label: "Taste Profile" },
  taste: { emoji: "📊", label: "Taste Profile" },
  playlist: { emoji: "💾", label: "Playlist" },
  timemachine: { emoji: "🕰️", label: "Time Machine" },
};

function sourceMeta(source: string): { emoji: string; label: string } {
  return SOURCE_META[source.toLowerCase()] ?? { emoji: "•", label: source };
}

// "just now" / "5m ago" / "3h ago" / "2d ago" / a date for anything older.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso.slice(0, 19).replace("T", " ");
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

type Mode = "simple" | "advanced";

export function LogsView() {
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("simple");

  function load() {
    setLoading(true);
    setError(null);
    getLogs(300)
      .then(setLogs)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function clear() {
    await clearLogs();
    load();
  }

  return (
    <section className="rsn-rise" style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.4, fontWeight: 700, color: colors.accentLight }}>
            ACTIVITY
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", letterSpacing: "-0.4px" }}>
            Recent activity
          </h1>
          <div style={{ width: 42, height: 3, borderRadius: 3, background: fx.accentBar, marginTop: 12 }} />
          <div style={{ fontSize: 13.5, color: colors.muted, marginTop: 12 }}>
            What Resonarr has been up to — discovery runs, playlist saves, and
            anything that needed your attention. Switch to Advanced for the full
            technical log.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} disabled={loading} style={ghostBtn}>
            {loading ? "…" : "Refresh"}
          </button>
          <button onClick={clear} disabled={!logs || logs.length === 0} style={ghostBtn}>
            Clear
          </button>
        </div>
      </div>

      {/* Simple / Advanced toggle */}
      <div style={{ display: "flex", gap: 6 }}>
        {(["simple", "advanced"] as Mode[]).map((m) => {
          const on = m === mode;
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                font: "inherit",
                fontSize: 13,
                fontWeight: on ? 600 : 500,
                textTransform: "capitalize",
                padding: "6px 14px",
                borderRadius: 999,
                cursor: "pointer",
                border: `1px solid ${on ? "transparent" : colors.border}`,
                background: on ? fx.navActiveBg : "transparent",
                color: on ? colors.text : colors.muted,
              }}
            >
              {m}
            </button>
          );
        })}
      </div>

      {error && <p style={{ color: colors.red, margin: 0 }}>Error: {error}</p>}

      {logs && logs.length === 0 && (
        <p style={{ color: colors.muted }}>No activity recorded yet.</p>
      )}

      {logs && logs.length > 0 && (
        <div style={{ display: "grid", gap: 4 }}>
          {logs.map((e) =>
            mode === "simple" ? <SimpleRow key={e.id} entry={e} /> : <RawRow key={e.id} entry={e} />,
          )}
        </div>
      )}
    </section>
  );
}

function SimpleRow({ entry }: { entry: LogEntry }) {
  const { emoji, label } = sourceMeta(entry.source);
  const attention = entry.level !== "info";
  return (
    <div style={{ ...rowBase, alignItems: "center" }}>
      <span style={{ fontSize: 16, width: 22, flex: "none", textAlign: "center" }}>{emoji}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color: colors.muted }}> — {entry.message}</span>
        {attention && (
          <span style={{ color: LEVEL_COLOR[entry.level], marginLeft: 8, fontSize: 11, fontWeight: 700 }}>
            {entry.level === "error" ? "needs attention" : "heads up"}
          </span>
        )}
      </span>
      <span style={{ color: colors.faint, fontSize: 12, flex: "none", whiteSpace: "nowrap" }}>
        {relativeTime(entry.ts)}
      </span>
    </div>
  );
}

function RawRow({ entry }: { entry: LogEntry }) {
  const time = entry.ts.slice(0, 19).replace("T", " ");
  return (
    <div style={{ ...rowBase, alignItems: "baseline", fontSize: 13 }}>
      <span style={{ color: colors.faint, fontFamily: "monospace", fontSize: 12, flex: "none" }}>
        {time}
      </span>
      <span
        style={{
          color: LEVEL_COLOR[entry.level],
          textTransform: "uppercase",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          width: 42,
          flex: "none",
        }}
      >
        {entry.level}
      </span>
      <span style={{ color: colors.accentLight, fontSize: 11, fontWeight: 600, width: 70, flex: "none" }}>
        {entry.source}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {entry.message}
        {entry.detail && (
          <span style={{ color: colors.faint, marginLeft: 8, fontFamily: "monospace", fontSize: 11 }}>
            {entry.detail}
          </span>
        )}
      </span>
    </div>
  );
}

const rowBase: CSSProperties = {
  display: "flex",
  gap: 12,
  padding: "8px 12px",
  borderRadius: 9,
  background: fx.rowBg,
  border: `1px solid ${colors.border}`,
  boxShadow: fx.rowShadow,
  fontSize: 13,
};

const ghostBtn: CSSProperties = {
  font: "inherit",
  fontSize: 13,
  background: "transparent",
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "7px 13px",
  cursor: "pointer",
};
