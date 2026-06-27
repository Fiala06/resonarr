import type { ReactNode } from "react";
import type { AppVersion, AuthUser, LibraryStats } from "@resonarr/shared";
import { Logo } from "./Logo";
import { colors, fx } from "../theme";

export type Tab =
  | "sage"
  | "radio"
  | "mixes"
  | "moods"
  | "discover"
  | "deepcuts"
  | "artists"
  | "weekly"
  | "profile"
  | "timemachine"
  | "adventure"
  | "spotify"
  | "basket"
  | "logs"
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
  moods: (
    <>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.6 9.3 a 2.8 2.8 0 0 0 4.8 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <circle cx="6" cy="6.3" r="0.9" fill="currentColor" />
      <circle cx="10" cy="6.3" r="0.9" fill="currentColor" />
    </>
  ),
  discover: (
    <>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 5.5 L9 9 L5.5 10.5 L7 7 Z" fill="currentColor" />
    </>
  ),
  deepcuts: (
    <>
      <path d="M2.5 5 L13.5 5 M2.5 8 L13.5 8 M2.5 11 L9.5 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="12" cy="11" r="2" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  artists: (
    <>
      <circle cx="8" cy="5.5" r="2.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.2 13 a4.8 4.8 0 0 1 9.6 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  weekly: (
    <>
      <rect x="2.5" y="3" width="11" height="10.5" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 6 H13.5 M5.5 1.8 V4 M10.5 1.8 V4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="9.5" r="1.5" fill="currentColor" />
    </>
  ),
  profile: (
    <path
      d="M2 8 H4 L5.5 4 L7.5 12 L9.5 6 L11 8 H14"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  timemachine: (
    <>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.5 V8 L10.5 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3 L1.5 1.5 M2.5 5.5 L1 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  adventure: (
    <path d="M8 2 L13.5 13 L8 10.5 L2.5 13 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  ),
  spotify: (
    <>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 6.3 a 5 5 0 0 1 6 0.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M5.6 8.3 a 3.5 3.5 0 0 1 4.6 0.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6.2 10.2 a 2 2 0 0 1 3.2 0.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  basket: (
    <>
      <path d="M3 5 H13 L12 13 H4 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6 5 V4 a2 2 0 0 1 4 0 V5" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  logs: (
    <>
      <rect x="3" y="2.5" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 6 H10.5 M5.5 8.5 H10.5 M5.5 11 H8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
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
  { key: "moods", label: "Moods" },
  { key: "discover", label: "Discover" },
  { key: "deepcuts", label: "Deep Cuts" },
  { key: "artists", label: "Artists" },
  { key: "weekly", label: "Weekly" },
  { key: "profile", label: "Taste Profile" },
  { key: "timemachine", label: "Time Machine" },
  { key: "adventure", label: "Adventure" },
  { key: "spotify", label: "Spotify Import" },
  { key: "basket", label: "Basket" },
];

// "38,412" -> "38.4k" for the compact footer label.
function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

export function Sidebar({
  active,
  onNavigate,
  basketCount,
  stats,
  lidarrOk,
  version,
  authUser,
  onLogout,
}: {
  active: Tab;
  onNavigate: (t: Tab) => void;
  basketCount: number;
  stats: LibraryStats | null;
  lidarrOk: boolean | null;
  version: AppVersion | null;
  authUser?: AuthUser;
  onLogout?: () => void;
}) {
  return (
    <div
      style={{
        width: 236,
        flex: "none",
        background: colors.sidebar,
        borderRight: `1px solid ${colors.border}`,
        display: "flex",
        flexDirection: "column",
        padding: "20px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "4px 8px 22px" }}>
        {/* glow on the resonance mark */}
        <span style={{ display: "inline-flex", filter: fx.logoGlow }}>
          <Logo size={28} />
        </span>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px" }}>Resonarr</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
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

      {/* Cleaned-up footer: secondary nav + one compact status row.
          Library breakdown moved into a hover tooltip. */}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
        <NavItem tab="logs" label="Activity log" active={active === "logs"} onClick={() => onNavigate("logs")} />
        <NavItem tab="settings" label="Settings" active={active === "settings"} onClick={() => onNavigate("settings")} />

        <div
          style={{
            marginTop: 13,
            paddingTop: 13,
            borderTop: `1px solid ${colors.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ position: "relative", width: 7, height: 7, flex: "none" }}>
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background: lidarrOk ? colors.green : colors.faint,
                }}
              />
              {lidarrOk && (
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    background: colors.green,
                    animation: "resonarr-pulse 3.4s ease-in-out infinite",
                  }}
                />
              )}
            </span>
            <span style={{ fontSize: 12, color: colors.muted, whiteSpace: "nowrap" }}>
              {lidarrOk === null ? "Checking…" : lidarrOk ? "Lidarr connected" : "Lidarr offline"}
            </span>
          </div>

          {stats && (
            <span
              data-tip="1"
              style={{
                position: "relative",
                fontSize: 12,
                color: colors.faint,
                whiteSpace: "nowrap",
                cursor: "default",
              }}
            >
              {compact(stats.tracks)} tracks
              <span
                className="tip"
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 9px)",
                  right: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  background: colors.panel2,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 9,
                  padding: "10px 13px",
                  boxShadow:
                    "0 10px 26px -8px rgba(0,0,0,0.85), 0 0 0 1px rgba(124,92,255,0.12)",
                  zIndex: 10,
                  textAlign: "right",
                }}
              >
                <span style={{ fontSize: 10, letterSpacing: 1, fontWeight: 700, color: colors.accentLight }}>
                  LIBRARY
                </span>
                <span style={{ fontSize: 12, color: colors.text, whiteSpace: "nowrap" }}>
                  {stats.tracks.toLocaleString()} tracks
                </span>
                <span style={{ fontSize: 12, color: colors.muted, whiteSpace: "nowrap" }}>
                  {stats.albums.toLocaleString()} albums
                </span>
                <span style={{ fontSize: 12, color: colors.muted, whiteSpace: "nowrap" }}>
                  {stats.artists.toLocaleString()} artists
                </span>
              </span>
            </span>
          )}
        </div>

        {authUser && onLogout && (
          <div style={{ marginTop: 12, padding: "0 4px" }}>
            <div
              style={{
                fontSize: 11,
                color: colors.faint,
                marginBottom: 6,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Signed in as {authUser.name}
            </div>
            <button
              onClick={onLogout}
              style={{
                width: "100%",
                background: "transparent",
                color: colors.text,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Log out
            </button>
          </div>
        )}

        {version && (
          <div
            title={
              version.builtAt
                ? `Built ${new Date(version.builtAt).toLocaleString()}`
                : "Local dev build"
            }
            style={{
              marginTop: 10,
              padding: "0 4px",
              fontSize: 10,
              color: colors.faint,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {version.commit === "dev" ? "dev build" : `v ${version.commit}`}
            {version.builtAt ? ` · ${version.builtAt.slice(0, 10)}` : ""}
          </div>
        )}
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
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "9px 11px",
        borderRadius: 8,
        fontSize: 14,
        cursor: "pointer",
        background: active ? fx.navActiveBg : "transparent",
        color: active ? colors.text : colors.muted,
        transition: "background .2s ease, color .2s ease",
      }}
    >
      {/* left accent bar on the active item */}
      <span
        style={{
          position: "absolute",
          left: -4,
          top: 8,
          bottom: 8,
          width: 3,
          borderRadius: 3,
          background: fx.accentBar,
          opacity: active ? 1 : 0,
          transition: "opacity .2s ease",
        }}
      />
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flex: "none" }}>
        {ICONS[tab]}
      </svg>
      <span style={{ flex: 1 }}>{label}</span>
      {badge !== undefined && (
        <span
          style={{
            background: fx.btnBg,
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 10,
            padding: "1px 8px",
            boxShadow: fx.btnGlow,
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}
