import type { ReactNode } from "react";
import type { Track } from "@resonarr/shared";
import { AlbumArt } from "./AlbumArt";
import { colors, fx } from "../theme";

// Reusable track row. (Phase 2 lives in-repo; this is a prime candidate to move
// into the Claude Design system later.)
export function TrackRow({
  track,
  onClick,
  right,
}: {
  track: Track;
  onClick?: () => void;
  right?: ReactNode;
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
    </div>
  );
}
