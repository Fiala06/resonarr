import { useState } from "react";
import type { DiscoveryResult } from "@resonarr/shared";
import { runSage } from "../api";
import { TrackRow } from "../components/TrackRow";
import { SavePlaylistBar } from "../components/SavePlaylistBar";
import { colors, fx } from "../theme";

interface Mood {
  key: string;
  label: string;
  emoji: string;
  blurb: string;
  prompt: string;
}

// One-click moods → a Sage generation tuned to favor owned, playable tracks.
const MOODS: Mood[] = [
  {
    key: "focus",
    label: "Focus",
    emoji: "🎧",
    blurb: "Low-distraction deep work",
    prompt:
      "calm, low-distraction, mostly instrumental or mellow tracks for deep focus and concentration",
  },
  {
    key: "workout",
    label: "Workout",
    emoji: "🔥",
    blurb: "High-energy and driving",
    prompt: "high-energy, driving, motivating tracks for an intense workout",
  },
  {
    key: "winddown",
    label: "Wind-down",
    emoji: "🌙",
    blurb: "Soft and soothing",
    prompt: "soft, soothing, mellow tracks to relax and wind down late at night",
  },
  {
    key: "dinner",
    label: "Dinner",
    emoji: "🍷",
    blurb: "Warm background music",
    prompt:
      "warm, mellow, sophisticated background music for a relaxed dinner with friends",
  },
  {
    key: "roadtrip",
    label: "Road trip",
    emoji: "🚗",
    blurb: "Anthemic sing-alongs",
    prompt: "anthemic, sing-along, feel-good tracks for a long road trip",
  },
  {
    key: "rainy",
    label: "Rainy day",
    emoji: "🌧️",
    blurb: "Moody and atmospheric",
    prompt: "moody, atmospheric, contemplative tracks for a rainy afternoon",
  },
];

const COUNT = 30;

export function MoodsView() {
  const [active, setActive] = useState<Mood | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoveryResult | null>(null);

  async function pick(mood: Mood) {
    setActive(mood);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // Bias toward owned artists so a mood yields an instantly playable set.
      setResult(await runSage(mood.prompt, true, COUNT));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rsn-rise" style={{ display: "grid", gap: 18 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 1.4, fontWeight: 700, color: colors.accentLight }}>
          MOODS
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", letterSpacing: "-0.4px" }}>
          A playlist for the moment
        </h1>
        <div style={{ width: 42, height: 3, borderRadius: 3, background: fx.accentBar, marginTop: 12 }} />
        <div style={{ fontSize: 13.5, color: colors.muted, marginTop: 12 }}>
          One click, no typing — pick a mood and Resonarr pulls an owned,
          ready-to-play set from your library.
        </div>
      </div>

      {/* Mood grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        {MOODS.map((m) => {
          const on = active?.key === m.key;
          return (
            <button
              key={m.key}
              onClick={() => pick(m)}
              disabled={loading}
              className="rsn-card"
              style={{
                textAlign: "left",
                display: "grid",
                gap: 4,
                padding: 14,
                borderRadius: 11,
                cursor: loading ? "default" : "pointer",
                background: on ? `${fx.seedGlow}, ${colors.panel}` : colors.panel,
                border: `1px solid ${on ? colors.accent : colors.border}`,
                boxShadow: fx.cardShadow,
                color: colors.text,
                font: "inherit",
              }}
            >
              <span style={{ fontSize: 22 }}>{m.emoji}</span>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{m.label}</span>
              <span style={{ fontSize: 12, color: colors.muted }}>{m.blurb}</span>
            </button>
          );
        })}
      </div>

      {loading && (
        <p style={{ color: colors.muted, margin: 0 }}>
          Building your {active?.label.toLowerCase()} set…
        </p>
      )}
      {error && <p style={{ color: colors.red, margin: 0 }}>Error: {error}</p>}

      {result && !loading && active && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {active.emoji} {active.label}{" "}
            <span style={{ color: colors.green, fontWeight: 400 }}>
              · {result.matches.length} from your library
            </span>
            {result.misses.length > 0 && (
              <span style={{ color: colors.muted, fontWeight: 400 }}>
                {" "}· {result.misses.length} suggestions you don’t own
              </span>
            )}
          </div>

          {result.matches.length === 0 ? (
            <p style={{ color: colors.muted, margin: 0 }}>
              Nothing owned matched this mood — try “Bias toward artists I own” in
              Describe a Vibe, or add the misses to your wishlist there.
            </p>
          ) : (
            <>
              <SavePlaylistBar
                defaultName={`${active.label} · Resonarr`}
                trackIds={result.matches.map((t) => t.id)}
              />
              <div style={{ display: "grid", gap: 6 }}>
                {result.matches.map((t) => (
                  <TrackRow key={t.id} track={t} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
