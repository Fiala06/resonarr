import { useEffect, useState } from "react";
import type { AuthStatus } from "@resonarr/shared";
import { getAuthStatus } from "../api";
import { App } from "../App";
import { LoginScreen } from "./LoginScreen";
import { colors } from "../theme";

/**
 * Decides whether to show the login wall or the app. When AUTH_PLEX is off the
 * server reports authRequired=false and we render the app directly.
 */
export function AuthGate() {
  const [status, setStatus] = useState<AuthStatus | null>(null);

  useEffect(() => {
    getAuthStatus()
      .then(setStatus)
      .catch(() => setStatus({ authRequired: true }));
  }, []);

  if (!status) {
    return <div style={{ height: "100%", background: colors.bg }} />;
  }

  if (status.authRequired && !status.user) {
    // Reload after sign-in so the session cookie is used for every request.
    return <LoginScreen onSignedIn={() => window.location.reload()} />;
  }

  return <App authUser={status.user} />;
}
