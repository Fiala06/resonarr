import { useEffect, useState } from "react";
import type { Track } from "@resonarr/shared";
import { createPlaylist, getRadio, searchTracks } from "../api";
import { TrackRow } from "../components/TrackRow";
import { colors } from "../theme";

export function RadioView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);

  const [seed, setSeed] = useState<Track | null>(null);
  const [neighbors, setNeighbors] = useState<Track[]>([]);
  const [loadingRadio, setLoadingRadio] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Debounced search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      searchTracks(q)
        .then(setResults)
        .catch((e) => setError(String(e)))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  async function pickSeed(track: Track) {
    setSeed(track);
    setQuery("");
    setResults([]);
    setNeighbors([]);
    setError(null);
    setSaveMsg(null);
    setName(`${track.title} Radio`);
    setLoadingRadio(true);
    try {
      const res = await getRadio(track.id);
      setNeighbors(res.tracks);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingRadio(false);
    }
  }

  async function save() {
    if (!seed) return;
    const trackIds = [seed.id, ...neighbors.map((t) => t.id)];
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await createPlaylist(name.trim() || `${seed.title} Radio`, trackIds);
      setSaveMsg(`Created "${res.name}" (${res.trackCount} tracks) in Plex ✓`);
    } catch (e) {
      setSaveMsg(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <div>
        <h2 style={{ fontSize: "1rem", margin: "0 0 4px" }}>Radio</h2>
        <p style={{ color: colors.muted, margin: 0, fontSize: "0.9rem" }}>
          Pick a seed track → sonically similar tracks you own → save as a Plex
          playlist.
        </p>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your library for a seed track…"
        style={{
          background: colors.panel,
          color: colors.text,
          border: `1px solid ${colors.border}`,
          borderRadius: 6,
          padding: "10px 12px",
        }}
      />

      {searching && <p style={{ color: colors.muted, margin: 0 }}>Searching…</p>}
      {results.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {results.map((t) => (
            <TrackRow key={t.id} track={t} onClick={() => pickSeed(t)} />
          ))}
        </div>
      )}

      {error && <p style={{ color: colors.red, margin: 0 }}>Error: {error}</p>}

      {seed && (
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 6,
              background: "rgba(124,92,255,0.12)",
              border: `1px solid ${colors.accent}`,
            }}
          >
            <span style={{ color: colors.muted, fontSize: "0.8rem" }}>Seed</span>
            <div>
              {seed.title} — {seed.artist}
            </div>
          </div>

          {loadingRadio && (
            <p style={{ color: colors.muted, margin: 0 }}>
              Finding similar tracks…
            </p>
          )}

          {neighbors.length > 0 && (
            <>
              {/* Save controls up top so the name is editable before scrolling
                  through the track list. */}
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  padding: "12px",
                  borderRadius: 8,
                  background: colors.panel,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <span style={{ color: colors.muted, fontSize: "0.8rem" }}>
                  Playlist name
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Playlist name"
                    style={{
                      flex: 1,
                      background: colors.bg,
                      color: colors.text,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 6,
                      padding: "9px 12px",
                    }}
                  />
                  <button
                    onClick={save}
                    disabled={saving}
                    style={{
                      background: colors.accent,
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      padding: "9px 18px",
                      cursor: saving ? "default" : "pointer",
                      opacity: saving ? 0.7 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {saving ? "Saving…" : `Save (${neighbors.length + 1})`}
                  </button>
                </div>
                {saveMsg && (
                  <span
                    style={{
                      color: saveMsg.startsWith("Save failed")
                        ? colors.red
                        : colors.green,
                      fontSize: "0.9rem",
                    }}
                  >
                    {saveMsg}
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                {neighbors.map((t) => (
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
