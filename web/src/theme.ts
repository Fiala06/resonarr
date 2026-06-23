// Shared palette, aligned with the Claude Design "Resonarr" system.
export const colors = {
  bg: "#0f1115",
  sidebar: "#14171d",
  panel: "#1a1d24",
  panel2: "#23262f",
  border: "#2a2e37",
  text: "#e8e8ea",
  muted: "#9aa0a6",
  faint: "#6a6f78",
  green: "#51cf66",
  red: "#ff6b6b",
  gold: "#c9a23a",
  accent: "#7c5cff",
  accentLight: "#9b86ff",
  seedBg: "#2a1d4a",
};

// --- Polish layer ---------------------------------------------------------
// Visual "pop" effects, kept separate so the base palette is untouched.
// Spread these into inline style objects, e.g.
//   style={{ background: fx.btnBg, boxShadow: fx.btnGlow }}
// They only reference existing brand colors - nothing new is invented.
export const fx = {
  // Ambient backdrop for the main content scroll area (App.tsx root).
  appBg:
    "radial-gradient(900px 440px at 80% -10%, rgba(124,92,255,0.13), transparent 60%)," +
    "radial-gradient(680px 360px at 4% 6%, rgba(81,207,102,0.045), transparent 58%)," +
    "#0f1115",
  // Primary buttons + badges
  btnBg: "linear-gradient(135deg, #8d6dff, #6b4cff)",
  btnGlow: "0 8px 22px -7px rgba(124,92,255,0.6)",
  // Sidebar active nav item
  navActiveBg:
    "linear-gradient(90deg, rgba(124,92,255,0.22), rgba(124,92,255,0.03))",
  accentBar: "linear-gradient(135deg, #8d6dff, #6b4cff)",
  // List rows
  rowBg:
    "linear-gradient(180deg, rgba(255,255,255,0.02), transparent), #1a1d24",
  rowShadow:
    "0 1px 0 rgba(255,255,255,0.02), 0 8px 20px -12px rgba(0,0,0,0.7)",
  rowHoverBorder: "rgba(124,92,255,0.55)",
  // Cards (mix tiles, seed card, settings panel)
  cardShadow: "0 10px 30px -16px rgba(0,0,0,0.8)",
  // Accents
  logoGlow: "drop-shadow(0 0 7px rgba(124,92,255,0.6))",
  seedGlow:
    "radial-gradient(480px 220px at 14% 50%, rgba(124,92,255,0.22), transparent 72%)",
  badgeHi:
    "linear-gradient(135deg, rgba(124,92,255,0.42), rgba(124,92,255,0.1))",
  lift: "translateY(-3px)",
};
