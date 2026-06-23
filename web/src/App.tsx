import { useEffect, useState } from "react";
import type { HealthResponse, ServiceStatus } from "@resonarr/shared";

// Phase 0 placeholder UI: confirms the web<->/api round-trip and shows whether
// Plex and Lidarr are reachable. Real components arrive in Phase 2, authored in
// the Claude Design system and synced into src/components/.
export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 640,
        margin: "4rem auto",
        padding: "0 1rem",
        color: "#e8e8ea",
        background: "transparent",
      }}
    >
      <h1 style={{ marginBottom: 4 }}>Resonarr</h1>
      <p style={{ color: "#9aa0a6", marginTop: 0 }}>
        Library-first music discovery · Phase 0 skeleton
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1rem" }}>Service status</h2>
        {error && <p style={{ color: "#ff6b6b" }}>Error: {error}</p>}
        {!health && !error && <p>Checking…</p>}
        {health && (
          <ul style={{ listStyle: "none", padding: 0 }}>
            <StatusRow label="App" status={{ configured: true, ok: true }} />
            <StatusRow label="Plex" status={health.plex} />
            <StatusRow label="Lidarr" status={health.lidarr} />
          </ul>
        )}
      </section>
    </main>
  );
}

function StatusRow({
  label,
  status,
}: {
  label: string;
  status: ServiceStatus;
}) {
  let icon = "•";
  let color = "#9aa0a6";
  let detail = "not configured";

  if (status.configured) {
    if (status.ok) {
      icon = "✓";
      color = "#51cf66";
      detail = status.detail ?? "ok";
    } else {
      icon = "✗";
      color = "#ff6b6b";
      detail = status.error;
    }
  }

  return (
    <li style={{ padding: "6px 0", display: "flex", gap: 8 }}>
      <span style={{ color, width: 16 }}>{icon}</span>
      <strong style={{ width: 64 }}>{label}</strong>
      <span style={{ color: "#9aa0a6" }}>{detail}</span>
    </li>
  );
}
