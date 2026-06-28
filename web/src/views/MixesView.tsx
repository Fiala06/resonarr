import { useEffect, useState } from "react";
import type { MixCard } from "@resonarr/shared";
import { getMixes } from "../api";
import { TrackRow } from "../components/TrackRow";
import { SavePlaylistBar } from "../components/SavePlaylistBar";
import { colors, fx } from "../theme";

const ART = ["#2a1d4a", "#1e4d4a", "#28304d", "#4a2535", "#3a3a22", "#2f2440"];

export function MixesView() {
  const [mixes, setMixes] = useState<MixCard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  function load(refresh = false) {
    setLoading(true);
    setError(null);
    getMixes(refresh)
      .then((r) => {
        setMixes(r.mixes);
        setOpenId(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  // Load once on first visit (cached); the Refresh button forces a rebuild.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = mixes?.find((m) => m.id === openId) ?? null;

  return (
    <section className="rsn-rise" style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.4, fontWeight: 700, color: colors.accentLight }}>
            MIXES
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", letterSpacing: "-0.4px" }}>
            Made from what you've been playing
          </h1>
          <div style={{ width: 42, height: 3, borderRadius: 3, background: fx.accentBar, marginTop: 12 }} />
          <div style={{ fontSize: 13.5, color: colors.muted, marginTop: 12 }}>
            Built from tracks you own, seeded by your recent listening.
          </div>
        </div>
        <button onClick={() => load(true)} disabled={loading} className="rsn-btn" style={primaryBtn(loading)}>
          {loading ? "Building…" : "Refresh"}
        </button>
      </div>

      {error && <p style={{ color: colors.red, margin: 0 }}>Error: {error}</p>}
      {!mixes && !error && (
        <div style={{ display: "grid", gap: 8 }}>
          <div className="rsn-loader" />
          <p style={{ color: colors.muted, margin: 0, fontSize: 13 }}>
            Building your mixes from what you've been playing — this can take a few seconds.
          </p>
        </div>
      )}

      {mixes && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 16 }}>
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
      className="rsn-card"
      style={{
        background: colors.sidebar,
        border: `1px solid ${active ? colors.accent : colors.border}`,
        borderRadius: 12,
        overflow: "hidden",
        cursor: "pointer",
        boxShadow: fx.cardShadow,
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
    background: fx.btnBg,
    color: "white",
    border: "none",
    borderRadius: 8,
    padding: "10px 18px",
    boxShadow: fx.btnGlow,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}
