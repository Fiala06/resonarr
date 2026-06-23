import { useState } from "react";
import { colors } from "../theme";

/**
 * Small "?" badge that reveals a short explanation on hover/focus. Meant for
 * the jargon-y bits of the UI (own-artist bias, Sonic Sage, Lidarr profiles…)
 * so less technical users aren't left guessing. Keep the text to one sentence.
 */
export function InfoHint({ text, width = 220 }: { text: string; width?: number }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        tabIndex={0}
        role="button"
        aria-label={text}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          width: 15,
          height: 15,
          borderRadius: "50%",
          border: `1px solid ${colors.faint}`,
          color: colors.muted,
          fontSize: 10,
          fontWeight: 700,
          lineHeight: "13px",
          textAlign: "center",
          cursor: "help",
          userSelect: "none",
          flex: "none",
        }}
      >
        ?
      </span>
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            width,
            background: colors.panel2,
            color: colors.text,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 12,
            lineHeight: 1.4,
            fontWeight: 400,
            boxShadow: "0 8px 24px rgba(0,0,0,.5)",
            zIndex: 9999,
            whiteSpace: "normal",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
