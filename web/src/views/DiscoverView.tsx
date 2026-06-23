import { useEffect, useState } from "react";
import type { DiscoverResponse, PlaylistSummary } from "@resonarr/shared";
import { discoverFromPlaylist, getPlaylists } from "../api";
import { InfoHint } from "../components/InfoHint";
import { TrackRow } from "../components/TrackRow";
import { SavePlaylistBar } from "../components/SavePlaylistBar";
import { colors, fx } from "../theme";

export function DiscoverView() {
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [playlistId, setPlaylistId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoverResponse | null>(null);

  useEffect(() => {
    getPlaylists()
      .then((p) => {
        setPlaylists(p);
        if (p[0]) setPlaylistId(p[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function run() {
    if (!playlistId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await discoverFromPlaylist(playlistId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rsn-rise" style={{ display: "grid", gap: 18 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 1.4, fontWeight: 700, color: colors.accentLight }}>
          DISCOVER
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", letterSpacing: "-0.4px" }}>
          Fresh picks from a playlist you love
        </h1>
        <div style={{ width: 42, height: 3, borderRadius: 3, background: fx.accentBar, marginTop: 12 }} />
        <div style={{ fontSize: 13.5, color: colors.muted, marginTop: 12 }}>
          Point at a playlist you love — your Liked Songs, a favorites list — and
          get fresh tracks that sound like it but aren’t in it yet. All owned, all
          ready to play.
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", color: colors.muted, fontSize: 13 }}>
          Seed playlist
          <InfoHint text="Resonarr studies the tracks in this playlist and finds owned songs that sound similar but aren't already on the list." />
        </label>
        <select
          value={playlistId}
          onChange={(e) => setPlaylistId(e.target.value)}
          disabled={!playlists || playlists.length === 0}
          style={{
            background: colors.panel,
            color: colors.text,
            border: `1px solid ${colors.border}`,
            borderRadius: 6,
            padding: "8px 10px",
            minWidth: 220,
          }}
        >
          {!playlists && <option>Loading…</option>}
          {playlists && playlists.length === 0 && <option>No playlists found</option>}
          {playlists?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} ({p.trackCount})
            </option>
          ))}
        </select>
        <button
          onClick={run}
          disabled={loading || !playlistId}
          className="rsn-btn"
          style={primaryBtn(loading || !playlistId)}
        >
          {loading ? "Finding…" : "Find fresh picks"}
        </button>
      </div>

      {error && <p style={{ color: colors.red, margin: 0 }}>Error: {error}</p>}

      {result && (
        <div style={{ display: "grid", gap: 10 }}>
          {result.tracks.length === 0 ? (
            <p style={{ color: colors.muted, margin: 0 }}>
              No fresh picks found — this playlist may already cover its sonic
              neighborhood, or its tracks haven’t been sonically analyzed in Plex.
            </p>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {result.tracks.length} fresh picks{" "}
                <span style={{ color: colors.muted, fontWeight: 400 }}>
                  similar to {result.source.title}
                </span>
              </div>
              <SavePlaylistBar
                defaultName={`Fresh picks · ${result.source.title}`}
                trackIds={result.tracks.map((t) => t.id)}
              />
              <div style={{ display: "grid", gap: 6 }}>
                {result.tracks.map((t) => (
                  <TrackRow key={t.id} track={t} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
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
