import { useRef, useState } from "react";
import type { SpotifyImportResult, SpotifyTrack } from "@resonarr/shared";
import { importSpotifyFile } from "../api";
import { TrackRow } from "../components/TrackRow";
import { SavePlaylistBar } from "../components/SavePlaylistBar";
import { colors, fx } from "../theme";

// ── Spotify export file parsing ───────────────────────────────────────────────

interface ParsedFile {
  name: string;
  tracks: SpotifyTrack[];
}

function parseSpotifyExport(raw: unknown): ParsedFile {
  if (!raw || typeof raw !== "object") throw new Error("Not a valid JSON file");
  const obj = raw as Record<string, unknown>;

  // YourLibrary.json — { tracks: [{ artist, album, track, uri }] }
  if (Array.isArray(obj["tracks"])) {
    const tracks: SpotifyTrack[] = (obj["tracks"] as unknown[])
      .filter(
        (t): t is Record<string, string> =>
          !!t && typeof t === "object" && typeof (t as Record<string, unknown>)["track"] === "string",
      )
      .map((t) => ({
        title: t["track"] ?? "",
        artist: t["artist"] ?? "",
        album: t["album"] ?? "",
      }))
      .filter((t) => t.title && t.artist);

    if (tracks.length === 0) throw new Error("No tracks found in this file");
    return { name: "Liked Songs", tracks };
  }

  // Playlist*.json — { name, items: [{ track: { trackName, artistName, albumName } }] }
  if (Array.isArray(obj["items"])) {
    const name =
      typeof obj["name"] === "string" && obj["name"] ? obj["name"] : "Spotify Playlist";
    const tracks: SpotifyTrack[] = (obj["items"] as unknown[])
      .map((item) => {
        const t = (item as Record<string, unknown>)?.["track"] as
          | Record<string, string>
          | undefined;
        if (!t?.["trackName"]) return null;
        return {
          title: t["trackName"] ?? "",
          artist: t["artistName"] ?? "",
          album: t["albumName"] ?? "",
        };
      })
      .filter((t): t is SpotifyTrack => !!t && !!t.title && !!t.artist);

    if (tracks.length === 0) throw new Error("No tracks found in this playlist file");
    return { name, tracks };
  }

  throw new Error(
    "Unrecognized format — expected YourLibrary.json or a Playlist*.json file",
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function Pill({ label, count }: { label: string; count: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 20,
        background: colors.panel2,
        border: `1px solid ${colors.border}`,
        fontSize: 13,
        color: colors.muted,
      }}
    >
      <span style={{ fontWeight: 600, color: colors.text }}>{count}</span>
      {label}
    </span>
  );
}

// ── file drop zone ────────────────────────────────────────────────────────────

function FileDropZone({ onFile }: { onFile: (text: string, filename: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === "string") onFile(e.target.result, file.name);
    };
    reader.readAsText(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) readFile(file);
      }}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? colors.accent : colors.border}`,
        borderRadius: 14,
        padding: "36px 24px",
        textAlign: "center",
        cursor: "pointer",
        background: dragging ? "rgba(124,92,255,0.06)" : colors.panel,
        transition: "border-color .15s, background .15s",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) readFile(file);
          e.target.value = "";
        }}
      />
      <div style={{ fontSize: 28, marginBottom: 10 }}>📂</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
        Drop your Spotify JSON file here
      </div>
      <div style={{ fontSize: 13, color: colors.muted }}>
        or click to browse — supports{" "}
        <code style={{ color: colors.accentLight }}>YourLibrary.json</code> and{" "}
        <code style={{ color: colors.accentLight }}>Playlist*.json</code>
      </div>
    </div>
  );
}

// ── main view ─────────────────────────────────────────────────────────────────

export function SpotifyView() {
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [savePlaylist, setSavePlaylist] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SpotifyImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  function handleFile(text: string, filename: string) {
    setParseError(null);
    setResult(null);
    setImportError(null);
    try {
      const p = parseSpotifyExport(JSON.parse(text));
      setParsed(p);
      setName(p.name);
    } catch (e) {
      setParsed(null);
      setParseError(
        `Could not parse "${filename}": ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async function handleImport() {
    if (!parsed) return;
    setBusy(true);
    setImportError(null);
    setResult(null);
    try {
      const res = await importSpotifyFile({
        tracks: parsed.tracks,
        name,
        savePlaylist,
      });
      setResult(res);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 22 }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700 }}>
          Spotify Import
        </h2>
        <p style={{ margin: 0, color: colors.muted, lineHeight: 1.6, fontSize: 14 }}>
          Import your Liked Songs or playlists from Spotify — no account connection
          required. Owned tracks become a Plex playlist; unowned artists go to the
          request basket.
        </p>
      </div>

      {/* How-to steps */}
      <div
        style={{
          padding: "16px 20px",
          borderRadius: 12,
          background: colors.panel,
          border: `1px solid ${colors.border}`,
          display: "grid",
          gap: 10,
          fontSize: 13,
          color: colors.muted,
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: colors.faint }}>
          HOW TO GET YOUR DATA
        </div>
        <div>
          <strong style={{ color: colors.text }}>1.</strong> Go to{" "}
          <strong style={{ color: colors.text }}>
            Spotify → Settings → Security and privacy → Account privacy
          </strong>{" "}
          and request a data download.
        </div>
        <div>
          <strong style={{ color: colors.text }}>2.</strong> Spotify emails you a
          link within a few minutes. Download and unzip the file.
        </div>
        <div>
          <strong style={{ color: colors.text }}>3.</strong> Drop{" "}
          <code style={{ color: colors.accentLight }}>YourLibrary.json</code> (Liked
          Songs) or any{" "}
          <code style={{ color: colors.accentLight }}>Playlist*.json</code> file
          below.
        </div>
      </div>

      {/* Drop zone */}
      <FileDropZone onFile={handleFile} />

      {parseError && (
        <p style={{ margin: 0, color: colors.red, fontSize: 13 }}>{parseError}</p>
      )}

      {/* File ready — import options */}
      {parsed && !result && (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: 12,
            background: colors.panel,
            border: `1px solid ${colors.border}`,
            display: "grid",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>✓</span>
            <span style={{ fontWeight: 600 }}>{parsed.tracks.length} tracks found</span>
          </div>

          {/* Name field */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.muted, letterSpacing: "0.05em" }}>
              PLAYLIST NAME
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                padding: "9px 12px",
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                background: colors.panel2,
                color: colors.text,
                fontSize: 14,
                outline: "none",
              }}
            />
          </label>

          {/* Save playlist toggle */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 14,
              color: colors.muted,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={savePlaylist}
              onChange={(e) => setSavePlaylist(e.target.checked)}
              style={{ accentColor: colors.accent, width: 15, height: 15 }}
            />
            Save matched tracks as a Plex playlist
          </label>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={() => void handleImport()}
              disabled={busy || !name.trim()}
              style={{
                padding: "10px 26px",
                borderRadius: 9,
                border: "none",
                background: busy || !name.trim() ? colors.panel2 : fx.btnBg,
                color: busy || !name.trim() ? colors.faint : "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: busy || !name.trim() ? "not-allowed" : "pointer",
                boxShadow: busy || !name.trim() ? "none" : fx.btnGlow,
                transition: "background .2s, color .2s, box-shadow .2s",
              }}
            >
              {busy ? "Importing…" : "Import"}
            </button>
            <button
              onClick={() => { setParsed(null); setName(""); }}
              disabled={busy}
              style={{
                padding: "10px 16px",
                borderRadius: 9,
                border: `1px solid ${colors.border}`,
                background: "transparent",
                color: colors.muted,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>

          {importError && (
            <p style={{ margin: 0, color: colors.red, fontSize: 13 }}>{importError}</p>
          )}
        </div>
      )}

      {/* Results */}
      {result && <ImportResults result={result} onReset={() => { setParsed(null); setName(""); setResult(null); }} />}
    </section>
  );
}

// ── results panel ─────────────────────────────────────────────────────────────

function ImportResults({
  result,
  onReset,
}: {
  result: SpotifyImportResult;
  onReset: () => void;
}) {
  const { sourceName, spotifyTotal, matched, misses, basketedArtists, plexPlaylist } = result;
  const [tab, setTab] = useState<"matched" | "misses">("matched");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Summary */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{sourceName}</span>
        <Pill label="from Spotify" count={spotifyTotal} />
        <Pill label="matched" count={matched.length} />
        {misses.length > 0 && <Pill label="misses" count={misses.length} />}
        {basketedArtists.length > 0 && (
          <Pill label="added to basket" count={basketedArtists.length} />
        )}
        <button
          onClick={onReset}
          style={{
            marginLeft: "auto",
            padding: "4px 14px",
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            background: "transparent",
            color: colors.muted,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Import another
        </button>
      </div>

      {/* Plex playlist confirmation */}
      {plexPlaylist && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            background: "rgba(81,207,102,0.08)",
            border: `1px solid rgba(81,207,102,0.25)`,
            fontSize: 13,
            color: colors.green,
          }}
        >
          Playlist saved:{" "}
          <strong>{plexPlaylist.name}</strong> ({plexPlaylist.trackCount} tracks)
        </div>
      )}

      {/* Tab switcher (only shown when there are misses) */}
      {misses.length > 0 && matched.length > 0 && (
        <div style={{ display: "flex", gap: 4 }}>
          {(["matched", "misses"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "6px 16px",
                borderRadius: 8,
                border: `1px solid ${tab === t ? colors.accent : colors.border}`,
                background: tab === t ? fx.navActiveBg : "transparent",
                color: tab === t ? colors.text : colors.muted,
                fontSize: 13,
                fontWeight: tab === t ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {t === "matched"
                ? `Matched (${matched.length})`
                : `Not in library (${misses.length})`}
            </button>
          ))}
        </div>
      )}

      {/* Matched tracks */}
      {(tab === "matched" || misses.length === 0) && (
        <>
          {matched.length === 0 ? (
            <p style={{ margin: 0, color: colors.muted, fontSize: 14 }}>
              None of these tracks were found in your Plex library.
            </p>
          ) : (
            <>
              <div style={{ display: "grid", gap: 6 }}>
                {matched.map((track) => (
                  <TrackRow key={track.id} track={track} />
                ))}
              </div>
              {!plexPlaylist && (
                <SavePlaylistBar
                  trackIds={matched.map((t) => t.id)}
                  defaultName={sourceName}
                />
              )}
            </>
          )}
        </>
      )}

      {/* Misses */}
      {tab === "misses" && misses.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {misses.map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "10px 14px",
                borderRadius: 10,
                background: fx.rowBg,
                boxShadow: fx.rowShadow,
                border: `1px solid ${colors.border}`,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>{m.title}</span>
              <span style={{ fontSize: 12, color: colors.muted }}>
                {m.artist}
                {m.album ? ` · ${m.album}` : ""}
                {basketedArtists.includes(m.artist) && (
                  <span style={{ color: colors.accentLight, marginLeft: 8 }}>
                    → basket
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
