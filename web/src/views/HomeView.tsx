import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { AutoPlaylist, LibraryStats } from "@resonarr/shared";
import type { Tab } from "../components/Sidebar";
import { getAutoPlaylists, getBasket, getFeedback } from "../api";
import { colors, fx } from "../theme";

/**
 * The landing screen. It orients a newcomer before they hit the 13 discovery
 * tools: a friendly greeting, the size of their library, quick-start cards into
 * the main features, and a few "what's happening" status tiles (wishlist,
 * weekly auto-playlist) plus a gentle nudge to import ratings if they haven't.
 *
 * It deliberately only calls cheap/cached endpoints so it loads fast.
 */

type QuickAction = {
  tab: Tab;
  emoji: string;
  title: string;
  blurb: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  { tab: "sage", emoji: "🎵", title: "Describe a Vibe", blurb: "Tell me a mood or moment — I'll build a playlist from music you own." },
  { tab: "radio", emoji: "📻", title: "Radio", blurb: "Pick one song and get a station of similar tracks you already have." },
  { tab: "mixes", emoji: "🎚️", title: "Mixes", blurb: "Fresh mixes made from what you've been playing lately." },
  { tab: "deepcuts", emoji: "💎", title: "Deep Cuts", blurb: "Rediscover great tracks buried in your own library." },
  { tab: "artists", emoji: "✨", title: "Find New Artists", blurb: "Discover artists like the ones you love and grow your collection." },
  { tab: "profile", emoji: "📊", title: "Your Taste", blurb: "See your sound: top genres, eras and most-played artists." },
];

function greeting(userName?: string): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = userName?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

// "in 3 days", "tomorrow", "today" for an epoch-ms timestamp.
function whenDue(ms: number): string {
  const days = Math.round((ms - Date.now()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export function HomeView({
  onNavigate,
  stats,
  basketWaiting,
  userName,
}: {
  onNavigate: (t: Tab) => void;
  stats: LibraryStats | null;
  basketWaiting: number;
  userName?: string;
}) {
  const [autoPlaylists, setAutoPlaylists] = useState<AutoPlaylist[] | null>(null);
  const [hasFeedback, setHasFeedback] = useState<boolean | null>(null);
  const [landed, setLanded] = useState<number | null>(null);

  useEffect(() => {
    getAutoPlaylists().then(setAutoPlaylists).catch(() => setAutoPlaylists([]));
    getFeedback()
      .then((f) => setHasFeedback(f.length > 0))
      .catch(() => setHasFeedback(null));
    // How many wishlist items have actually landed in the library — a small,
    // true "Resonarr grew my collection" stat derived client-side.
    getBasket()
      .then((items) => setLanded(items.filter((i) => i.status === "done").length))
      .catch(() => {});
  }, []);

  // The soonest upcoming run among enabled weekly auto-playlists, if any.
  const nextWeekly =
    autoPlaylists
      ?.filter((a) => a.enabled)
      .sort((a, b) => a.nextRunAt - b.nextRunAt)[0] ?? null;

  return (
    <section className="rsn-rise" style={{ display: "grid", gap: 22 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 1.4, fontWeight: 700, color: colors.accentLight }}>
          HOME
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "6px 0 0", letterSpacing: "-0.4px" }}>
          {greeting(userName)}
        </h1>
        <div style={{ width: 42, height: 3, borderRadius: 3, background: fx.accentBar, marginTop: 12 }} />
        <p style={{ color: colors.muted, margin: "12px 0 0", fontSize: 13.5 }}>
          Resonarr builds playlists from music you already own — and turns anything
          it suggests that you're missing into a wishlist you can download in one click.
        </p>
      </div>

      {/* Ratings nudge — only until the user has some thumbs to learn from. */}
      {hasFeedback === false && (
        <button onClick={() => onNavigate("settings")} className="rsn-row" style={nudgeStyle}>
          <span style={{ fontSize: 20 }}>⭐</span>
          <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <span style={{ display: "block", fontWeight: 600 }}>Make your recommendations smarter</span>
            <span style={{ fontSize: 12.5, color: colors.muted }}>
              Import your star ratings so Resonarr learns what you love. Takes one click in Settings.
            </span>
          </span>
          <span style={{ color: colors.accentLight, fontSize: 13, whiteSpace: "nowrap" }}>Import →</span>
        </button>
      )}

      {/* Library size — promoted out of the sidebar hover tooltip. */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <StatTile label="tracks" value={stats.tracks} />
          <StatTile label="albums" value={stats.albums} />
          <StatTile label="artists" value={stats.artists} />
        </div>
      )}

      {/* Quick-start actions */}
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Start something</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {QUICK_ACTIONS.map((a) => (
            <button key={a.tab} onClick={() => onNavigate(a.tab)} className="rsn-row" style={actionStyle}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>{a.emoji}</span>
              <span style={{ display: "block", marginTop: 9, fontSize: 14.5, fontWeight: 600 }}>{a.title}</span>
              <span style={{ display: "block", marginTop: 4, fontSize: 12.5, color: colors.muted, lineHeight: 1.45 }}>
                {a.blurb}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* What's happening */}
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>What's happening</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
          <StatusCard
            emoji="🛒"
            title="Your wishlist"
            onClick={() => onNavigate("basket")}
            cta={basketWaiting > 0 ? "Open wishlist →" : "Browse wishlist →"}
          >
            {basketWaiting > 0
              ? `${basketWaiting} ${basketWaiting === 1 ? "album is" : "albums are"} on the way to your library.`
              : "Recommendations you don't own yet land here to download. Nothing waiting right now."}
            {landed != null && landed > 0 && (
              <span style={{ display: "block", marginTop: 6, color: colors.green }}>
                {landed} added to your library so far. 🎉
              </span>
            )}
          </StatusCard>

          <StatusCard
            emoji="📅"
            title="Weekly auto-playlist"
            onClick={() => onNavigate("weekly")}
            cta={nextWeekly ? "Manage →" : "Set one up →"}
          >
            {autoPlaylists === null
              ? "Loading…"
              : nextWeekly
                ? `"${nextWeekly.name}" refreshes ${whenDue(nextWeekly.nextRunAt)}.`
                : "Set up a playlist that rebuilds itself every week, automatically."}
          </StatusCard>
        </div>
      </div>
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: "16px 16px 14px",
        borderRadius: 12,
        background: fx.rowBg,
        border: `1px solid ${colors.border}`,
        boxShadow: fx.rowShadow,
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px" }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function StatusCard({
  emoji,
  title,
  cta,
  onClick,
  children,
}: {
  emoji: string;
  title: string;
  cta: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button onClick={onClick} className="rsn-row" style={statusStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ fontSize: 18 }}>{emoji}</span>
        <span style={{ fontSize: 14.5, fontWeight: 600 }}>{title}</span>
      </div>
      <div style={{ marginTop: 8, fontSize: 12.5, color: colors.muted, lineHeight: 1.5, flex: 1 }}>{children}</div>
      <div style={{ marginTop: 10, fontSize: 12.5, color: colors.accentLight }}>{cta}</div>
    </button>
  );
}

const actionStyle: CSSProperties = {
  display: "block",
  textAlign: "left",
  padding: "15px 15px 16px",
  borderRadius: 12,
  background: fx.rowBg,
  border: `1px solid ${colors.border}`,
  boxShadow: fx.rowShadow,
  color: colors.text,
  cursor: "pointer",
  font: "inherit",
};

const statusStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  textAlign: "left",
  padding: "15px 15px 16px",
  borderRadius: 12,
  background: fx.rowBg,
  border: `1px solid ${colors.border}`,
  boxShadow: fx.rowShadow,
  color: colors.text,
  cursor: "pointer",
  font: "inherit",
  minHeight: 120,
};

const nudgeStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "13px 15px",
  borderRadius: 12,
  background: fx.badgeHi,
  border: `1px solid ${colors.accent}`,
  color: colors.text,
  cursor: "pointer",
  font: "inherit",
  width: "100%",
};
