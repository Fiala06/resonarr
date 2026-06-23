import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type {
  AppSettings,
  LidarrOptions,
  LlmProvider,
} from "@resonarr/shared";
import { getLidarrOptions, getSettings, putSettings } from "../api";
import { colors } from "../theme";

const inputStyle: CSSProperties = {
  background: colors.panel,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "8px 10px",
  width: "100%",
};

export function SettingsView() {
  const [form, setForm] = useState<AppSettings | null>(null);
  const [options, setOptions] = useState<LidarrOptions | null>(null);
  const [lidarrError, setLidarrError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(setForm).catch((e) => setLoadError(String(e)));
    getLidarrOptions()
      .then(setOptions)
      .catch((e) => setLidarrError(e instanceof Error ? e.message : String(e)));
  }, []);

  function patch<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaveMsg(null);
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await putSettings(form);
      setForm(updated);
      setSaveMsg("Saved ✓");
    } catch (e) {
      setSaveMsg(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <p style={{ color: colors.red }}>Error: {loadError}</p>;
  if (!form) return <p style={{ color: colors.muted }}>Loading settings…</p>;

  return (
    <section style={{ display: "grid", gap: 18, maxWidth: 560 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Settings</h1>
        <div style={{ fontSize: 13, color: colors.muted, marginTop: 3 }}>
          Your library, your Lidarr, your rules for what Resonarr recommends.
        </div>
      </div>

      <Card title="Discovery">
      <Field label="LLM provider (Sonic Sage)">
        <select
          style={inputStyle}
          value={form.llmProvider}
          onChange={(e) => patch("llmProvider", e.target.value as LlmProvider)}
        >
          <option value="claude">Claude</option>
          <option value="openai">OpenAI</option>
          <option value="ollama">Local (Ollama)</option>
        </select>
      </Field>

      <Field label="LLM model (blank = provider default)">
        <input
          style={inputStyle}
          value={form.llmModel}
          placeholder="e.g. claude-opus-4-8"
          onChange={(e) => patch("llmModel", e.target.value)}
        />
      </Field>

      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={form.ownArtistBias}
          onChange={(e) => patch("ownArtistBias", e.target.checked)}
        />
        Bias recommendations toward artists I own (default)
      </label>
      </Card>

      <Card title="Lidarr request target">
      {lidarrError && (
        <p style={{ color: colors.red, margin: 0 }}>
          Couldn’t load Lidarr options: {lidarrError}
        </p>
      )}

      <Field label="Root folder">
        <select
          style={inputStyle}
          disabled={!options}
          value={form.lidarrRootFolderPath}
          onChange={(e) => patch("lidarrRootFolderPath", e.target.value)}
        >
          <option value="">— select —</option>
          {options?.rootFolders.map((r) => (
            <option key={r.id} value={r.path}>
              {r.path}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Quality profile">
        <select
          style={inputStyle}
          disabled={!options}
          value={form.lidarrQualityProfileId ?? ""}
          onChange={(e) =>
            patch(
              "lidarrQualityProfileId",
              e.target.value === "" ? null : Number(e.target.value),
            )
          }
        >
          <option value="">— select —</option>
          {options?.qualityProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Metadata profile">
        <select
          style={inputStyle}
          disabled={!options}
          value={form.lidarrMetadataProfileId ?? ""}
          onChange={(e) =>
            patch(
              "lidarrMetadataProfileId",
              e.target.value === "" ? null : Number(e.target.value),
            )
          }
        >
          <option value="">— select —</option>
          {options?.metadataProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      </Card>

      <Card title="Playlists">
      <Field label="Playlist name prefix">
        <input
          style={inputStyle}
          value={form.playlistPrefix}
          onChange={(e) => patch("playlistPrefix", e.target.value)}
        />
      </Field>
      </Card>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            background: colors.accent,
            color: "white",
            border: "none",
            borderRadius: 6,
            padding: "9px 18px",
            cursor: saving ? "default" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saveMsg && (
          <span
            style={{
              color: saveMsg.startsWith("Save failed")
                ? colors.red
                : colors.green,
            }}
          >
            {saveMsg}
          </span>
        )}
      </div>
    </section>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        background: colors.sidebar,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "13px 16px",
          borderBottom: `1px solid ${colors.border}`,
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      <div style={{ padding: 16, display: "grid", gap: 14 }}>{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ color: colors.muted, fontSize: "0.85rem" }}>{label}</span>
      {children}
    </label>
  );
}
