import { useState } from "react";
import { pollLogin, startLogin } from "../api";
import { Logo } from "./Logo";
import { colors } from "../theme";

const POLL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

/** Full-screen Plex login wall shown when AUTH_PLEX is on and no session. */
export function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login() {
    setBusy(true);
    setError(null);
    try {
      const { pinId, authUrl } = await startLogin();
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
            const status = await pollLogin(pinId);
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
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: colors.bg,
      }}
    >
      <div
        style={{
          width: 340,
          background: colors.sidebar,
          border: `1px solid ${colors.border}`,
          borderRadius: 14,
          padding: "32px 28px",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <Logo size={40} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Resonarr</div>
        <div style={{ fontSize: 13, color: colors.muted, margin: "8px 0 22px" }}>
          Sign in with the Plex account you use for this server.
        </div>
        <button
          onClick={login}
          disabled={busy}
          style={{
            width: "100%",
            background: colors.accent,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "11px 16px",
            fontSize: 14,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "Waiting for Plex…" : "Log in with Plex"}
        </button>
        {error && (
          <div style={{ marginTop: 14, fontSize: 12, color: colors.red }}>{error}</div>
        )}
      </div>
    </div>
  );
}
