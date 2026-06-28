import { useState, type CSSProperties } from "react";
import { Logo } from "./Logo";
import { colors, fx } from "../theme";

/**
 * A one-time, three-step intro shown on a user's first visit. It explains the
 * library-first idea in ~15 seconds so the discovery tools make sense. The
 * "seen" flag lives in localStorage so it never reappears once dismissed.
 */

const SEEN_KEY = "resonarr.onboarded";

export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Private mode / storage disabled — treat as already seen so we don't nag.
    return true;
  }
}

function markOnboarded() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

type Step = { emoji: string; title: string; body: string };

const STEPS: Step[] = [
  {
    emoji: "🎵",
    title: "Playlists from music you own",
    body: "Resonarr builds every playlist from tracks already in your library — so everything it makes plays instantly, no waiting.",
  },
  {
    emoji: "🛒",
    title: "Missing something? Add it to your wishlist",
    body: "Anything it suggests that you don't own yet goes to your wishlist and starts downloading automatically. It lands in your library when it's ready.",
  },
  {
    emoji: "📅",
    title: "Set it and forget it",
    body: "Create a weekly playlist that refreshes itself — or just “Describe a Vibe” whenever you want something new. That's it. Enjoy the music.",
  },
];

export function Onboarding({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  function finish() {
    markOnboarded();
    onClose();
  }

  return (
    <div style={backdrop} onClick={finish}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <span style={{ display: "inline-flex", filter: fx.logoGlow }}>
            <Logo size={24} />
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.3px" }}>Welcome to Resonarr</span>
        </div>

        <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 14 }}>{step.emoji}</div>
        <h2 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.3px" }}>
          {step.title}
        </h2>
        <p style={{ fontSize: 14, color: colors.muted, lineHeight: 1.6, margin: 0 }}>{step.body}</p>

        {/* Step dots */}
        <div style={{ display: "flex", gap: 7, marginTop: 22 }}>
          {STEPS.map((_, idx) => (
            <span
              key={idx}
              style={{
                width: idx === i ? 22 : 7,
                height: 7,
                borderRadius: 4,
                background: idx === i ? fx.accentBar : colors.border,
                transition: "width .2s ease, background .2s ease",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22 }}>
          <button onClick={finish} style={skipBtn}>
            Skip
          </button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {i > 0 && (
              <button onClick={() => setI(i - 1)} style={backBtn}>
                Back
              </button>
            )}
            <button onClick={() => (last ? finish() : setI(i + 1))} className="rsn-btn" style={nextBtn}>
              {last ? "Get started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const backdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "rgba(0,0,0,0.62)",
};

const card: CSSProperties = {
  width: "100%",
  maxWidth: 440,
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: 16,
  padding: "26px 26px 22px",
  boxShadow: fx.cardShadow,
};

const skipBtn: CSSProperties = {
  background: "transparent",
  color: colors.muted,
  border: "none",
  cursor: "pointer",
  font: "inherit",
  fontSize: 13,
};

const backBtn: CSSProperties = {
  background: "transparent",
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: "9px 16px",
  cursor: "pointer",
  font: "inherit",
  fontSize: 13,
  fontWeight: 600,
};

const nextBtn: CSSProperties = {
  background: fx.btnBg,
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "9px 18px",
  boxShadow: fx.btnGlow,
  cursor: "pointer",
  font: "inherit",
  fontSize: 13,
  fontWeight: 600,
};
