import { useState } from "react";
import { StatusView } from "./views/StatusView";
import { SettingsView } from "./views/SettingsView";
import { colors } from "./theme";

type Tab = "status" | "settings";

export function App() {
  const [tab, setTab] = useState<Tab>("status");

  return (
    <div style={{ maxWidth: 720, margin: "3rem auto", padding: "0 1rem" }}>
      <header>
        <h1 style={{ marginBottom: 4 }}>Resonarr</h1>
        <p style={{ color: colors.muted, marginTop: 0 }}>
          Library-first music discovery
        </p>
        <nav style={{ display: "flex", gap: 6, marginTop: 16 }}>
          <TabButton active={tab === "status"} onClick={() => setTab("status")}>
            Status
          </TabButton>
          <TabButton
            active={tab === "settings"}
            onClick={() => setTab("settings")}
          >
            Settings
          </TabButton>
        </nav>
      </header>

      <main style={{ marginTop: "1.5rem" }}>
        {tab === "status" ? <StatusView /> : <SettingsView />}
      </main>
    </div>
  );
}

function TabButton({
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
        background: active ? colors.panel : "transparent",
        color: active ? colors.text : colors.muted,
        border: `1px solid ${active ? colors.border : "transparent"}`,
        borderRadius: 6,
        padding: "6px 14px",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
