import { useEffect, useState } from "react";
import type { LogEntry, LogLevel } from "@resonarr/shared";
import { clearLogs, getLogs } from "../api";
import { colors, fx } from "../theme";

const LEVEL_COLOR: Record<LogLevel, string> = {
  info: colors.muted,
  warn: colors.gold,
  error: colors.red,
};

export function LogsView() {
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
            ACTIVITY LOG
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", letterSpacing: "-0.4px" }}>
            What each run did, and why
          </h1>
          <div style={{ width: 42, height: 3, borderRadius: 3, background: fx.accentBar, marginTop: 12 }} />
          <div style={{ fontSize: 13.5, color: colors.muted, marginTop: 12 }}>
            What Resonarr has been doing — discovery runs, playlist saves, and
            why any Lidarr requests failed. Also mirrored to the container logs.
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

      {error && <p style={{ color: colors.red, margin: 0 }}>Error: {error}</p>}

      {logs && logs.length === 0 && (
        <p style={{ color: colors.muted }}>No activity recorded yet.</p>
      )}

      {logs && logs.length > 0 && (
        <div style={{ display: "grid", gap: 4 }}>
          {logs.map((e) => (
            <LogRow key={e.id} entry={e} />
          ))}
        </div>
      )}
    </section>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const time = entry.ts.slice(0, 19).replace("T", " ");
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "8px 12px",
        borderRadius: 9,
        background: fx.rowBg,
        border: `1px solid ${colors.border}`,
        boxShadow: fx.rowShadow,
        fontSize: 13,
        alignItems: "baseline",
      }}
    >
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
      <span
        style={{
          color: colors.accentLight,
          fontSize: 11,
          fontWeight: 600,
          width: 70,
          flex: "none",
        }}
      >
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

const ghostBtn = {
  font: "inherit",
  fontSize: 13,
  background: "transparent",
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "7px 13px",
  cursor: "pointer",
};
