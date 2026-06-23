import { useEffect, useState } from "react";
import type { MixCard } from "@resonarr/shared";
import { getMixes } from "../api";
import { TrackRow } from "../components/TrackRow";
import { SavePlaylistBar } from "../components/SavePlaylistBar";
import { colors } from "../theme";

const ART = ["#2a1d4a", "#1e4d4a", "#28304d", "#4a2535", "#3a3a22", "#2f2440"];

export function MixesView() {
  const [mixes, setMixes] = useState<MixCard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getMixes()
      .then((r) => {
        setMixes(r.mixes);
        setOpenId(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const open = mixes?.find((m) => m.id === openId) ?? null;

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Mixes</h1>
          <div style={{ fontSize: 13, color: colors.muted, marginTop: 3 }}>
            Built from tracks you own, seeded by your recent listening.
          </div>
        </div>
        <button onClick={load} disabled={loading} style={primaryBtn(loading)}>
          {loading ? "Building…" : "Refresh"}
        </button>
      </div>

      {error && <p style={{ color: colors.red, margin: 0 }}>Error: {error}</p>}
      {!mixes && !error && <p style={{ color: colors.muted }}>Building your mixes…</p>}

      {mixes && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {mixes.map((m, i) => (
            <MixCardTile
              key={m.id}
              mix={m}
              tint={ART[i % ART.length] ?? colors.seedBg}
              active={openId === m.id}
              onClick={() => setOpenId(openId === m.id ? null : m.id)}
            />
          ))}
        </div>
      )}

      {open && (
        <div style={{ display: "grid", gap: 10 }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>{open.title}</h2>
          <SavePlaylistBar defaultName={open.title} trackIds={open.tracks.map((t) => t.id)} />
          <div style={{ display: "grid", gap: 6 }}>
            {open.tracks.map((t) => (
              <TrackRow key={t.id} track={t} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function MixCardTile({
  mix,
  tint,
  active,
  onClick,
}: {
  mix: MixCard;
  tint: string;
  active: boolean;
  onClick: () => void;
}) {
  const [artFailed, setArtFailed] = useState(false);

  // Distinct artists other than the seed's, for a "feat." style subtitle.
  const seedArtist = mix.seed.artist.toLowerCase();
  const featured: string[] = [];
  const seen = new Set<string>([seedArtist]);
  for (const t of mix.tracks) {
    const key = t.artist.toLowerCase();
    if (!t.artist || seen.has(key)) continue;
    seen.add(key);
    featured.push(t.artist);
    if (featured.length >= 3) break;
  }

  const cover = mix.seed.thumb && !artFailed
    ? `/api/art?path=${encodeURIComponent(mix.seed.thumb)}`
    : null;

  return (
    <div
      onClick={onClick}
      style={{
        background: colors.sidebar,
        border: `1px solid ${active ? colors.accent : colors.border}`,
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
      }}
    >
      <div style={{ height: 110, background: tint, position: "relative", overflow: "hidden" }}>
        {cover ? (
          <img
            src={cover}
            alt=""
            loading="lazy"
            onError={() => setArtFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <svg width="120" height="120" viewBox="0 0 40 40" fill="none" style={{ position: "absolute", right: -18, bottom: -22, opacity: 0.4 }}>
            <circle cx="20" cy="20" r="9.5" stroke={colors.accentLight} strokeWidth="2" />
            <circle cx="20" cy="20" r="16" stroke={colors.accentLight} strokeWidth="2" opacity="0.6" />
          </svg>
        )}
      </div>
      <div style={{ padding: "11px 13px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {mix.title}
        </div>
        <div style={{ fontSize: 12, color: colors.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {mix.seed.artist}
        </div>
        {featured.length > 0 && (
          <div style={{ fontSize: 11, color: colors.faint, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            with {featured.join(", ")}
          </div>
        )}
        <div style={{ fontSize: 11, color: colors.faint, marginTop: 6 }}>
          {mix.tracks.length} tracks · all owned
        </div>
      </div>
    </div>
  );
}

function primaryBtn(disabled: boolean) {
  return {
    background: colors.accent,
    color: "white",
    border: "none",
    borderRadius: 6,
    padding: "9px 16px",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}
