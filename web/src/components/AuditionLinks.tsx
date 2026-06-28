import { colors } from "../theme";

/**
 * Small outbound "let me hear it" links for an unowned recommendation, so you
 * can audition something before spending a Lidarr request. Pure outbound links
 * — no API, no secrets.
 *
 *  - YouTube: a search URL for the most specific thing we know (track, else
 *    album, else artist).
 *  - MusicBrainz: the resolved artist page when an `mbid` is known (basket
 *    items carry one from Lidarr lookup); otherwise an artist search. Album-
 *    level MB links would need a release-group id we don't store yet, so v1 is
 *    artist-direct.
 */
export function AuditionLinks({
  artist,
  album,
  title,
  mbid,
}: {
  artist: string;
  album?: string;
  title?: string;
  mbid?: string;
}) {
  const ytQuery = [artist, title || album].filter(Boolean).join(" ");
  const youtube = `https://www.youtube.com/results?search_query=${encodeURIComponent(ytQuery)}`;
  const musicbrainz = mbid
    ? `https://musicbrainz.org/artist/${mbid}`
    : `https://musicbrainz.org/search?query=${encodeURIComponent(artist)}&type=artist&method=indexed`;

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flex: "none" }}>
      <Link href={youtube} title={`Search YouTube for ${ytQuery}`}>
        ▶ YouTube
      </Link>
      <Link
        href={musicbrainz}
        title={mbid ? `${artist} on MusicBrainz` : `Look up ${artist} on MusicBrainz`}
      >
        Look up
      </Link>
    </span>
  );
}

function Link({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      title={title}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: colors.muted,
        textDecoration: "none",
        border: `1px solid ${colors.border}`,
        borderRadius: 5,
        padding: "3px 8px",
        whiteSpace: "nowrap",
        lineHeight: 1.2,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = colors.accentLight;
        e.currentTarget.style.borderColor = colors.accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = colors.muted;
        e.currentTarget.style.borderColor = colors.border;
      }}
    >
      {children}
    </a>
  );
}
