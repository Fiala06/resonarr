import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type {
  AppSettings,
  LidarrOptions,
  LlmProvider,
} from "@resonarr/shared";
import { getLidarrOptions, getSettings, putSettings } from "../api";
import { InfoHint } from "../components/InfoHint";
import { colors, fx } from "../theme";

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
    <section className="rsn-rise" style={{ display: "grid", gap: 18, maxWidth: 560 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 1.4, fontWeight: 700, color: colors.accentLight }}>
          SETTINGS
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", letterSpacing: "-0.4px" }}>
          Preferences
        </h1>
        <div style={{ width: 42, height: 3, borderRadius: 3, background: fx.accentBar, marginTop: 12 }} />
        <div style={{ fontSize: 13.5, color: colors.muted, marginTop: 12 }}>
          Your library, your Lidarr, your rules for what Resonarr recommends.
        </div>
      </div>

      <Card title="Discovery">
      <Field
        label="LLM provider (Sonic Sage)"
        hint="The AI that turns your prompt into song suggestions. Claude and OpenAI run in the cloud (need an API key); Ollama runs on your own machine."
      >
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

      <Field
        label="Root folder"
        hint="Where Lidarr saves music it downloads for you. Pick the same folder Lidarr already manages your library in."
      >
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

      <Field
        label="Quality profile"
        hint="Lidarr's rule for what audio quality to grab (e.g. MP3 vs. lossless). Uses the profiles you set up in Lidarr."
      >
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

      <Field
        label="Metadata profile"
        hint="Lidarr's rule for which album types to track (studio albums, EPs, singles…). Uses the profiles you set up in Lidarr."
      >
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
          className="rsn-btn"
          style={{
            background: fx.btnBg,
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "10px 18px",
            boxShadow: fx.btnGlow,
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
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: fx.cardShadow,
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
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ color: colors.muted, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 6 }}>
        {label}
        {hint && <InfoHint text={hint} />}
      </span>
      {children}
    </label>
  );
}
