import { useEffect, useState } from "react";
import type { HealthResponse, ServiceStatus } from "@resonarr/shared";
import { getHealth } from "../api";
import { colors } from "../theme";

export function StatusView() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealth().then(setHealth).catch((e) => setError(String(e)));
  }, []);

  return (
    <section>
      <h2 style={{ fontSize: "1rem" }}>Service status</h2>
      {error && <p style={{ color: colors.red }}>Error: {error}</p>}
      {!health && !error && <p style={{ color: colors.muted }}>Checking…</p>}
      {health && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          <StatusRow label="App" status={{ configured: true, ok: true }} />
          <StatusRow label="Plex" status={health.plex} />
          <StatusRow label="Lidarr" status={health.lidarr} />
        </ul>
      )}
    </section>
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
  let color = colors.muted;
  let detail = "not configured";

  if (status.configured) {
    if (status.ok) {
      icon = "✓";
      color = colors.green;
      detail = status.detail ?? "ok";
    } else {
      icon = "✗";
      color = colors.red;
      detail = status.error;
    }
  }

  return (
    <li style={{ padding: "6px 0", display: "flex", gap: 8 }}>
      <span style={{ color, width: 16 }}>{icon}</span>
      <strong style={{ width: 72 }}>{label}</strong>
      <span style={{ color: colors.muted }}>{detail}</span>
    </li>
  );
}
