import { useEffect, useState } from "react";
import type { TasteProfile } from "@resonarr/shared";
import { getTasteProfile } from "../api";
import { colors, fx } from "../theme";

export function ProfileView() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<TasteProfile | null>(null);

  async function run(refresh = false) {
    setLoading(true);
    setError(null);
    try {
      setProfile(await getTasteProfile(refresh));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Load once on first visit (cached); the Regenerate button forces a rebuild.
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxPlays = profile?.topArtists[0]?.plays ?? 1;

  return (
    <section className="rsn-rise" style={{ display: "grid", gap: 18, maxWidth: 720 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 1.4, fontWeight: 700, color: colors.accentLight }}>
          TASTE PROFILE
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", letterSpacing: "-0.4px" }}>
          Your sound, in your own data
        </h1>
        <div style={{ width: 42, height: 3, borderRadius: 3, background: fx.accentBar, marginTop: 12 }} />
        <div style={{ fontSize: 13.5, color: colors.muted, marginTop: 12 }}>
          A read on your listening — drawn from your most-played artists and
          written up by your LLM.
        </div>
      </div>

      <div>
        <button onClick={() => run(true)} disabled={loading} className="rsn-btn" style={primaryBtn(loading)}>
          {loading ? "Reading your library…" : profile ? "Regenerate" : "Generate"}
        </button>
      </div>

      {error && <p style={{ color: colors.red, margin: 0 }}>Error: {error}</p>}

      {profile && !loading && (
        <>
          {/* Hero soundline */}
          <div style={heroCard}>
            <div style={{ fontSize: 11, letterSpacing: 1.2, fontWeight: 700, color: colors.accentLight }}>
              YOUR SOUND
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, marginTop: 8 }}>
              {profile.soundline}
            </div>
            {profile.summary && (
              <p style={{ color: colors.muted, fontSize: 14, lineHeight: 1.55, margin: "12px 0 0" }}>
                {profile.summary}
              </p>
            )}
          </div>

          {/* Chip groups */}
          <div style={{ display: "grid", gap: 12 }}>
            <ChipRow label="Genres" items={profile.genres} tone="accent" />
            <ChipRow label="Eras" items={profile.eras} tone="plain" />
            <ChipRow label="Vibes" items={profile.vibes} tone="plain" />
          </div>

          {/* Top artists */}
          {profile.topArtists.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                Most played{" "}
                <span style={{ color: colors.muted, fontWeight: 400 }}>· by play count</span>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {profile.topArtists.slice(0, 15).map((a, i) => (
                  <div key={a.artist} style={artistRow}>
                    <span style={{ width: 18, color: colors.faint, fontSize: 12, textAlign: "right" }}>
                      {i + 1}
                    </span>
                    <span style={{ width: 150, flex: "none", fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {a.artist}
                    </span>
                    <span style={{ flex: 1, height: 7, borderRadius: 4, background: colors.panel2, overflow: "hidden" }}>
                      <span
                        style={{
                          display: "block",
                          height: "100%",
                          width: `${Math.max(4, (a.plays / maxPlays) * 100)}%`,
                          background: fx.btnBg,
                          borderRadius: 4,
                        }}
                      />
                    </span>
                    <span style={{ width: 48, textAlign: "right", color: colors.muted, fontSize: 12 }}>
                      {a.plays}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: colors.faint }}>
            From a library of {profile.stats.tracks.toLocaleString()} tracks ·{" "}
            {profile.stats.artists.toLocaleString()} artists ·{" "}
            {profile.stats.albums.toLocaleString()} albums.
          </div>
        </>
      )}
    </section>
  );
}

function ChipRow({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "accent" | "plain";
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: colors.muted, width: 56, flex: "none" }}>
        {label}
      </span>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {items.map((it) => (
          <span
            key={it}
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              padding: "5px 11px",
              borderRadius: 999,
              color: tone === "accent" ? "#fff" : colors.text,
              background: tone === "accent" ? fx.badgeHi : colors.panel2,
              border: `1px solid ${tone === "accent" ? colors.accent : colors.border}`,
            }}
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

const heroCard = {
  padding: 20,
  borderRadius: 12,
  background: `${fx.seedGlow}, ${colors.panel}`,
  border: `1px solid ${colors.border}`,
  boxShadow: fx.cardShadow,
};
const artistRow = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 10px",
  borderRadius: 8,
  background: fx.rowBg,
  border: `1px solid ${colors.border}`,
};
function primaryBtn(disabled: boolean) {
  return {
    background: fx.btnBg,
    color: "white",
    border: "none",
    borderRadius: 8,
    padding: "10px 18px",
    boxShadow: fx.btnGlow,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}
