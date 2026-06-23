import { useState } from "react";
import type { UserProfile } from "@resonarr/shared";
import {
  pollPlexPin,
  removeProfile,
  setActiveProfile,
  startPlexPin,
} from "../api";
import { colors } from "../theme";

const POLL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Compact "acting as" switcher in the sidebar. Lets you switch between the
 * owner and connected Plex users, and connect a new user via Plex login.
 * Calls onChanged after any change so the app can reload + remount views.
 */
export function ProfileSwitcher({
  profiles,
  onChanged,
}: {
  profiles: UserProfile[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = profiles.find((p) => p.active) ?? profiles[0];

  async function switchTo(id: string) {
    setOpen(false);
    if (id === active?.id) return;
    await setActiveProfile(id);
    onChanged();
  }

  async function remove(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await removeProfile(id);
    onChanged();
  }

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      const { pinId, authUrl } = await startPlexPin();
      const popup = window.open(authUrl, "plex-auth", "width=600,height=720");
      const start = Date.now();
      await new Promise<void>((resolve, reject) => {
        const timer = setInterval(async () => {
          if (Date.now() - start > POLL_TIMEOUT_MS) {
            clearInterval(timer);
            reject(new Error("Login timed out — please try again."));
            return;
          }
          try {
            const status = await pollPlexPin(pinId);
            if (!status.pending) {
              clearInterval(timer);
              popup?.close();
              resolve();
            }
          } catch (err) {
            clearInterval(timer);
            reject(err);
          }
        }, POLL_MS);
      });
      onChanged();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div style={{ position: "relative", padding: "0 8px 14px" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: colors.panel,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          padding: "8px 10px",
          cursor: "pointer",
          color: colors.text,
          font: "inherit",
        }}
      >
        <Avatar name={active?.name ?? "?"} />
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <div style={{ fontSize: 10, color: colors.faint, letterSpacing: 0.5 }}>
            ACTING AS
          </div>
          <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {active?.name}
          </div>
        </div>
        <span style={{ color: colors.faint, fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            left: 8,
            right: 8,
            top: "calc(100% - 8px)",
            background: colors.panel2,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            boxShadow: "0 10px 30px rgba(0,0,0,.5)",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          {profiles.map((p) => (
            <div
              key={p.id}
              onClick={() => switchTo(p.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                cursor: "pointer",
                background: p.active ? "rgba(124,92,255,0.12)" : "transparent",
              }}
            >
              <Avatar name={p.name} />
              <span style={{ flex: 1, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.name}
              </span>
              {p.active && <span style={{ color: colors.accentLight, fontSize: 11 }}>✓</span>}
              {!p.isOwner && (
                <button
                  onClick={(e) => remove(e, p.id)}
                  title="Disconnect"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: colors.faint,
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <div style={{ height: 1, background: colors.border }} />
          <div
            onClick={connecting ? undefined : connect}
            style={{
              padding: "9px 10px",
              cursor: connecting ? "default" : "pointer",
              fontSize: 13,
              color: connecting ? colors.faint : colors.accentLight,
            }}
          >
            {connecting ? "Waiting for Plex login…" : "+ Connect Plex user"}
          </div>
          {error && (
            <div style={{ padding: "0 10px 9px", fontSize: 11, color: colors.red }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      style={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: colors.accent,
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
      }}
    >
      {initial}
    </span>
  );
}
