import type { ReactNode } from "react";
import type { Track } from "@resonarr/shared";
import { AlbumArt } from "./AlbumArt";
import { rateTrack, useFeedbackMap } from "../feedback";
import { colors, fx } from "../theme";

// Reusable track row. (Phase 2 lives in-repo; this is a prime candidate to move
// into the Claude Design system later.)
export function TrackRow({
  track,
  onClick,
  right,
  feedback = true,
}: {
  track: Track;
  onClick?: () => void;
  right?: ReactNode;
  /** Show thumbs up/down (default on). */
  feedback?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className="rsn-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 9,
        cursor: onClick ? "pointer" : "default",
        border: `1px solid ${colors.border}`,
        background: fx.rowBg,
        boxShadow: fx.rowShadow,
      }}
    >
      <AlbumArt
        thumb={track.thumb}
        tint={colors.seedBg}
        album={track.album}
        artist={track.artist}
        line="In your library"
        tone="owned"
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {track.title}
        </div>
        <div
          style={{
            color: colors.muted,
            fontSize: "0.85rem",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {track.artist}
          {track.album ? ` — ${track.album}` : ""}
        </div>
      </div>
      {right}
      {feedback && <Thumbs track={track} />}
    </div>
  );
}

/** Thumbs up/down for a track; click the active one to clear. */
function Thumbs({ track }: { track: Track }) {
  const map = useFeedbackMap();
  const rating = map.get(track.id);
  return (
    <span
      style={{ display: "inline-flex", gap: 2, flex: "none" }}
      onClick={(e) => e.stopPropagation()}
    >
      <ThumbBtn
        label="Thumbs up"
        active={rating === "up"}
        activeColor={colors.green}
        onClick={() => rateTrack(track, "up")}
      >
        <path
          d="M5 7 V12.5 H3 V7 Z M5 7 L7.2 2.5 C8.1 2.5 8.6 3.2 8.4 4 L8 6 H11.4 C12.1 6 12.6 6.7 12.4 7.4 L11.4 11.6 C11.3 12.1 10.8 12.5 10.3 12.5 H5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
          fill="none"
        />
      </ThumbBtn>
      <ThumbBtn
        label="Thumbs down"
        active={rating === "down"}
        activeColor={colors.red}
        onClick={() => rateTrack(track, "down")}
      >
        <path
          d="M5 9 V3.5 H3 V9 Z M5 9 L7.2 13.5 C8.1 13.5 8.6 12.8 8.4 12 L8 10 H11.4 C12.1 10 12.6 9.3 12.4 8.6 L11.4 4.4 C11.3 3.9 10.8 3.5 10.3 3.5 H5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
          fill="none"
        />
      </ThumbBtn>
    </span>
  );
}

function ThumbBtn({
  label,
  active,
  activeColor,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  activeColor: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 30,
        height: 30,
        borderRadius: 6,
        border: "none",
        background: "transparent",
        color: active ? activeColor : colors.faint,
        cursor: "pointer",
        opacity: active ? 1 : 0.65,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16">{children}</svg>
    </button>
  );
}
