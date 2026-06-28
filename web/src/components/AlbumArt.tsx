import { colors } from "../theme";

type Tone = "owned" | "missing" | "info";

/**
 * Album artwork thumbnail with a hover preview card.
 *
 * Drop-in replacement for the inline `<Art>` / art `<span>` used in the
 * track rows and basket rows. On hover the thumbnail enlarges and a detail
 * card pops up (larger cover + album, artist + year, and a status line).
 *
 * Requires the `[data-art]` rules from index.css (polish layer).
 *
 *   <AlbumArt
 *     thumb={t.thumb}
 *     tint={colors.seedBg}
 *     album={t.album}
 *     artist={t.artist}
 *     year={t.year}
 *     line="In your library"
 *     tone="owned"
 *   />
 */
export function AlbumArt({
  thumb,
  coverUrl,
  tint = colors.panel2,
  album,
  artist,
  year,
  line,
  tone = "info",
  eyebrow = "ALBUM",
  size = 44,
}: {
  /** Plex thumb path (proxied via /api/art). Omit to show the gradient only. */
  thumb?: string;
  /** A ready-to-use public image URL (e.g. Lidarr metadata art), used as-is. */
  coverUrl?: string;
  /** Gradient / solid fallback shown behind (or instead of) the cover. */
  tint?: string;
  album: string;
  artist: string;
  year?: number | string;
  /** Status line under the meta, e.g. "12 tracks in library". */
  line?: string;
  /** Colors the status line + eyebrow: owned=green, missing=gold, info=accent. */
  tone?: Tone;
  eyebrow?: string;
  size?: number;
}) {
  const cover = coverUrl ?? (thumb ? `/api/art?path=${encodeURIComponent(thumb)}` : null);
  // Real cover sits on top of the tint, so a missing image still looks intentional.
  const bg = cover
    ? `center / cover no-repeat url("${cover}"), ${tint}`
    : tint;

  const lineColor =
    tone === "owned" ? colors.green : tone === "missing" ? colors.gold : colors.accentLight;
  const eyebrowColor = tone === "missing" ? colors.gold : colors.accentLight;

  return (
    <span
      data-art="1"
      style={{ position: "relative", flex: "none", display: "block", width: size, height: size }}
    >
      <span
        className="artthumb"
        style={{ display: "block", width: size, height: size, borderRadius: 6, background: bg }}
      />
      <span
        className="artpop"
        style={{
          position: "absolute",
          bottom: "calc(100% + 12px)",
          left: -4,
          zIndex: 30,
          display: "flex",
          gap: 12,
          background: colors.panel2,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: 12,
          boxShadow:
            "0 18px 44px -14px rgba(0,0,0,0.92), 0 0 0 1px rgba(124,92,255,0.16)",
        }}
      >
        <span
          style={{
            width: 104,
            height: 104,
            borderRadius: 9,
            flex: "none",
            background: bg,
            boxShadow: "0 10px 24px -10px rgba(0,0,0,0.85)",
          }}
        />
        <span style={{ display: "flex", flexDirection: "column", gap: 3, justifyContent: "center" }}>
          <span style={{ fontSize: 10, letterSpacing: 1.2, fontWeight: 700, color: eyebrowColor }}>
            {eyebrow}
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: colors.text, whiteSpace: "nowrap" }}>
            {album}
          </span>
          <span style={{ fontSize: 12.5, color: colors.muted, whiteSpace: "nowrap" }}>
            {artist}
            {year ? ` · ${year}` : ""}
          </span>
          {line && (
            <span style={{ fontSize: 12, marginTop: 5, whiteSpace: "nowrap", color: lineColor }}>
              {line}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}
