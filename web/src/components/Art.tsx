import { useState } from "react";
import { colors } from "../theme";

/** Album/artist cover art, proxied through the server (token stays server-side). */
export function Art({ thumb, size = 32 }: { thumb?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const base = {
    width: size,
    height: size,
    borderRadius: 4,
    background: colors.panel2,
    flex: "none" as const,
  };

  if (!thumb || failed) return <div style={base} />;

  return (
    <img
      src={`/api/art?path=${encodeURIComponent(thumb)}`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ ...base, objectFit: "cover" }}
    />
  );
}
