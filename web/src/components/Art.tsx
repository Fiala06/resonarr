import { useState } from "react";
import { createPortal } from "react-dom";
import { colors } from "../theme";

const PREVIEW = 240;

/** Album/artist cover art, proxied through the server (token stays server-side).
 *  Hover shows a large floating preview. */
export function Art({ thumb, size = 44 }: { thumb?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);

  const base = {
    width: size,
    height: size,
    borderRadius: 5,
    background: colors.panel2,
    flex: "none" as const,
  };

  if (!thumb || failed) return <div style={base} />;

  const src = `/api/art?path=${encodeURIComponent(thumb)}`;

  function show(e: React.MouseEvent<HTMLImageElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    let x = r.right + 12;
    if (x + PREVIEW > window.innerWidth) x = r.left - PREVIEW - 12;
    let y = r.top + r.height / 2 - PREVIEW / 2;
    y = Math.max(10, Math.min(y, window.innerHeight - PREVIEW - 10));
    setPreview({ x, y });
  }

  return (
    <>
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        onMouseEnter={show}
        onMouseLeave={() => setPreview(null)}
        style={{ ...base, objectFit: "cover", cursor: "zoom-in" }}
      />
      {preview &&
        createPortal(
          <img
            src={src}
            alt=""
            style={{
              position: "fixed",
              left: preview.x,
              top: preview.y,
              width: PREVIEW,
              height: PREVIEW,
              objectFit: "cover",
              borderRadius: 12,
              border: `1px solid ${colors.border}`,
              boxShadow: "0 12px 36px rgba(0,0,0,.6)",
              zIndex: 9999,
              pointerEvents: "none",
            }}
          />,
          document.body,
        )}
    </>
  );
}
