import { useEffect, useState } from "react";
import type { OnThisDayResponse, TimeMachineGroup, YearInReviewResponse } from "@resonarr/shared";
import { getOnThisDay, getYearInReview } from "../api";
import { TrackRow } from "../components/TrackRow";
import { SavePlaylistBar } from "../components/SavePlaylistBar";
import { colors, fx } from "../theme";

// ── helpers ───────────────────────────────────────────────────────────────────

function yearsAgoLabel(year: number): string {
  const diff = new Date().getFullYear() - year;
  if (diff === 1) return "1 year ago";
  return `${diff} years ago`;
}

// ── year group ────────────────────────────────────────────────────────────────

function YearGroup({ group, label }: { group: TimeMachineGroup; label: string }) {
  const [open, setOpen] = useState(true);
  const playlistName = `${label} ${group.year}`;

  return (
    <div
      style={{
        borderRadius: 12,
        background: colors.panel,
        border: `1px solid ${colors.border}`,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>{group.year}</span>
          <span style={{ fontSize: 13, color: colors.muted }}>{yearsAgoLabel(group.year)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: colors.faint }}>{group.tracks.length} tracks</span>
          <span style={{ fontSize: 11, color: colors.faint, transform: open ? "rotate(180deg)" : "none", display: "inline-block" }}>
            ▼
          </span>
        </div>
      </div>

      {/* Tracks + save bar */}
      {open && (
        <div style={{ borderTop: `1px solid ${colors.border}`, padding: "12px 14px 16px" }}>
          <div style={{ display: "grid", gap: 5, marginBottom: 12 }}>
            {group.tracks.map((track) => (
              <TrackRow key={track.id} track={track} />
            ))}
          </div>
          <SavePlaylistBar
            trackIds={group.tracks.map((t) => t.id)}
            defaultName={playlistName}
          />
        </div>
      )}
    </div>
  );
}

// ── main view ─────────────────────────────────────────────────────────────────

type Mode = "onthisday" | "year";

export function TimeMachineView() {
  const [mode, setMode] = useState<Mode>("onthisday");
  const [onThisDay, setOnThisDay] = useState<OnThisDayResponse | null>(null);
  const [yearData, setYearData] = useState<YearInReviewResponse | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear() - 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load "on this day" on mount.
  useEffect(() => {
    setLoading(true);
    setError(null);
    getOnThisDay()
      .then(setOnThisDay)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function loadYear(year: number) {
    setLoading(true);
    setError(null);
    setYearData(null);
    try {
      setYearData(await getYearInReview(year));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Build year options: last year back to 6 years ago.
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - 1 - i);

  return (
    <section style={{ display: "grid", gap: 22 }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700 }}>Time Machine</h2>
        <p style={{ margin: 0, color: colors.muted, lineHeight: 1.6, fontSize: 14 }}>
          Nostalgia on demand — revisit what you were playing on this date in
          past years, or dial up any year to see your soundtrack for that time.
        </p>
      </div>

      {/* Mode switcher */}
      <div style={{ display: "flex", gap: 4 }}>
        <ModeButton active={mode === "onthisday"} onClick={() => setMode("onthisday")}>
          On this day
        </ModeButton>
        <ModeButton active={mode === "year"} onClick={() => setMode("year")}>
          Year in review
        </ModeButton>
      </div>

      {/* ── On this day ── */}
      {mode === "onthisday" && (
        <>
          {loading && <p style={{ margin: 0, color: colors.muted, fontSize: 14 }}>Loading…</p>}
          {error && <p style={{ margin: 0, color: colors.red, fontSize: 13 }}>{error}</p>}
          {onThisDay && (
            <>
              <p style={{ margin: 0, color: colors.muted, fontSize: 13 }}>
                Tracks you played around{" "}
                <strong style={{ color: colors.text }}>{onThisDay.label}</strong>{" "}
                in past years, sorted by how often you played them.
              </p>
              {onThisDay.groups.length === 0 ? (
                <div
                  style={{
                    padding: "24px",
                    borderRadius: 12,
                    background: colors.panel,
                    border: `1px solid ${colors.border}`,
                    color: colors.muted,
                    fontSize: 14,
                    textAlign: "center",
                  }}
                >
                  No play history found for this date in past years.
                  <br />
                  <span style={{ fontSize: 12, color: colors.faint }}>
                    This uses Plex's lastViewedAt field — tracks need to have been
                    played to appear here.
                  </span>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 14 }}>
                  {onThisDay.groups.map((g) => (
                    <YearGroup key={g.year} group={g} label={onThisDay.label} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Year in review ── */}
      {mode === "year" && (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{
                padding: "9px 12px",
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                background: colors.panel2,
                color: colors.text,
                fontSize: 14,
                outline: "none",
                cursor: "pointer",
              }}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              onClick={() => void loadYear(selectedYear)}
              disabled={loading}
              style={{
                padding: "9px 22px",
                borderRadius: 9,
                border: "none",
                background: loading ? colors.panel2 : fx.btnBg,
                color: loading ? colors.faint : "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading ? "none" : fx.btnGlow,
                transition: "background .2s, color .2s",
              }}
            >
              {loading ? "Loading…" : "Go"}
            </button>
          </div>

          {error && <p style={{ margin: 0, color: colors.red, fontSize: 13 }}>{error}</p>}

          {yearData && (
            <>
              <p style={{ margin: 0, color: colors.muted, fontSize: 13 }}>
                Top {yearData.tracks.length} most-played tracks last touched in{" "}
                <strong style={{ color: colors.text }}>{yearData.year}</strong>.
              </p>
              {yearData.tracks.length === 0 ? (
                <p style={{ margin: 0, color: colors.muted, fontSize: 14 }}>
                  No tracks found with plays in {yearData.year}.
                </p>
              ) : (
                <>
                  <div style={{ display: "grid", gap: 5 }}>
                    {yearData.tracks.map((track) => (
                      <TrackRow key={track.id} track={track} />
                    ))}
                  </div>
                  <SavePlaylistBar
                    trackIds={yearData.tracks.map((t) => t.id)}
                    defaultName={`${yearData.year} in review`}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 18px",
        borderRadius: 9,
        border: `1px solid ${active ? colors.accent : colors.border}`,
        background: active ? fx.navActiveBg : "transparent",
        color: active ? colors.text : colors.muted,
        fontWeight: active ? 600 : 400,
        fontSize: 14,
        cursor: "pointer",
        transition: "border-color .15s, background .15s, color .15s",
      }}
    >
      {children}
    </button>
  );
}
