import type { ReactNode } from "react";
import type { LibraryStats } from "@resonarr/shared";
import { Logo } from "./Logo";
import { colors } from "../theme";

export type Tab =
  | "sage"
  | "radio"
  | "mixes"
  | "discover"
  | "adventure"
  | "basket"
  | "settings";

const ICONS: Record<Tab, ReactNode> = {
  sage: (
    <path d="M8 1.5 L9.4 6.6 L14.5 8 L9.4 9.4 L8 14.5 L6.6 9.4 L1.5 8 L6.6 6.6 Z" fill="currentColor" />
  ),
  radio: (
    <>
      <circle cx="4" cy="12" r="1.6" fill="currentColor" />
      <path d="M7 12 a 5 5 0 0 0 -3-4.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 12 a 8.5 8.5 0 0 0 -5-7.8" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  mixes: (
    <>
      <rect x="3" y="8" width="2.2" height="5" rx="1" fill="currentColor" />
      <rect x="7" y="4" width="2.2" height="9" rx="1" fill="currentColor" />
      <rect x="11" y="6" width="2.2" height="7" rx="1" fill="currentColor" />
    </>
  ),
  discover: (
    <>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 5.5 L9 9 L5.5 10.5 L7 7 Z" fill="currentColor" />
    </>
  ),
  adventure: (
    <path d="M8 2 L13.5 13 L8 10.5 L2.5 13 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  ),
  basket: (
    <>
      <path d="M3 5 H13 L12 13 H4 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6 5 V4 a2 2 0 0 1 4 0 V5" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  settings: (
    <>
      <circle cx="8" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.5 V3 M8 13 V14.5 M1.5 8 H3 M13 8 H14.5 M3.4 3.4 L4.4 4.4 M11.6 11.6 L12.6 12.6 M12.6 3.4 L11.6 4.4 M4.4 11.6 L3.4 12.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </>
  ),
};

const MAIN_TABS: { key: Tab; label: string }[] = [
  { key: "sage", label: "Sonic Sage" },
  { key: "radio", label: "Radio" },
  { key: "mixes", label: "Mixes" },
  { key: "discover", label: "Discover" },
  { key: "adventure", label: "Adventure" },
  { key: "basket", label: "Basket" },
];

export function Sidebar({
  active,
  onNavigate,
  basketCount,
  stats,
  lidarrOk,
}: {
  active: Tab;
  onNavigate: (t: Tab) => void;
  basketCount: number;
  stats: LibraryStats | null;
  lidarrOk: boolean | null;
}) {
  return (
    <div
      style={{
        width: 232,
        flex: "none",
        background: colors.sidebar,
        borderRight: `1px solid ${colors.border}`,
        display: "flex",
        flexDirection: "column",
        padding: "20px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 22px" }}>
        <Logo size={28} />
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px" }}>
          Resonarr
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {MAIN_TABS.map((t) => (
          <NavItem
            key={t.key}
            tab={t.key}
            label={t.label}
            active={active === t.key}
            onClick={() => onNavigate(t.key)}
            badge={t.key === "basket" && basketCount > 0 ? basketCount : undefined}
          />
        ))}
      </div>

      <div style={{ marginTop: "auto" }}>
        <div style={{ padding: "0 8px 14px" }}>
          <div style={{ fontSize: 11, letterSpacing: 1, color: colors.faint, fontWeight: 600 }}>
            LIBRARY
          </div>
          {stats ? (
            <>
              <div style={{ fontSize: 13, color: colors.muted, marginTop: 8 }}>
                {stats.tracks.toLocaleString()} tracks
              </div>
              <div style={{ fontSize: 13, color: colors.muted }}>
                {stats.albums.toLocaleString()} albums · {stats.artists.toLocaleString()} artists
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: colors.muted, marginTop: 8 }}>—</div>
          )}
        </div>

        <div style={{ height: 1, background: colors.border, margin: "0 6px 12px" }} />

        <NavItem
          tab="settings"
          label="Settings"
          active={active === "settings"}
          onClick={() => onNavigate("settings")}
        />
        <div style={{ marginTop: 12, padding: "0 8px", display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: lidarrOk ? colors.green : colors.faint,
            }}
          />
          <span style={{ fontSize: 12, color: colors.muted }}>
            {lidarrOk === null
              ? "Checking…"
              : lidarrOk
                ? "Lidarr connected"
                : "Lidarr offline"}
          </span>
        </div>
      </div>
    </div>
  );
}

function NavItem({
  tab,
  label,
  active,
  onClick,
  badge,
}: {
  tab: Tab;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "9px 11px",
        borderRadius: 6,
        fontSize: 14,
        cursor: "pointer",
        background: active ? "rgba(124,92,255,0.13)" : "transparent",
        color: active ? colors.text : colors.muted,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flex: "none" }}>
        {ICONS[tab]}
      </svg>
      <span style={{ flex: 1 }}>{label}</span>
      {badge !== undefined && (
        <span
          style={{
            background: colors.accent,
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 10,
            padding: "1px 7px",
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}
