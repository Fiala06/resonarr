// Resonance-arcs mark (from the Claude Design "Resonarr" system).
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="13" cy="20" r="3.2" fill="#7c5cff" />
      <path
        d="M19 11 a 10 10 0 0 1 0 18"
        stroke="#7c5cff"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M24.5 6.5 a 16 16 0 0 1 0 27"
        stroke="#7c5cff"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
