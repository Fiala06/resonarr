import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { SpotifyImportResult, SpotifySync, SpotifyTrack } from "@resonarr/shared";
import {
  deleteSpotifySync,
  importSpotifyFile,
  listSpotifySyncs,
  runSpotifySync,
  updateSpotifySync,
} from "../api";
import { TrackRow } from "../components/TrackRow";
import { SavePlaylistBar } from "../components/SavePlaylistBar";
import { colors, fx } from "../theme";

// ── Spotify export file parsing ───────────────────────────────────────────────

interface ParsedFile {
  name: string;
  tracks: SpotifyTrack[];
}

// Spotify playlist items: [{ track: { trackName, artistName, albumName } }]
function tracksFromItems(items: unknown[]): SpotifyTrack[] {
  return items
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
}

// StreamingHistory*.json — [{ endTime, artistName, trackName, msPlayed }]
// Count plays of >=30s (the threshold that counts as a real stream), keep only
// tracks played enough times to count as "stuff I actually like", then order by
// play count so the most-listened tracks come first.
const STREAM_MS_THRESHOLD = 30_000;
const STREAM_MIN_PLAYS = 3;
function tracksFromStreamingHistory(rows: unknown[]): SpotifyTrack[] {
  const counts = new Map<string, { track: SpotifyTrack; plays: number }>();
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const title = typeof r?.["trackName"] === "string" ? (r["trackName"] as string) : "";
    const artist = typeof r?.["artistName"] === "string" ? (r["artistName"] as string) : "";
    const ms = typeof r?.["msPlayed"] === "number" ? (r["msPlayed"] as number) : 0;
    if (!title || !artist || ms < STREAM_MS_THRESHOLD) continue;
    const key = `${title} ${artist}`.toLowerCase();
    const existing = counts.get(key);
    if (existing) existing.plays++;
    else counts.set(key, { track: { title, artist, album: "" }, plays: 1 });
  }
  return [...counts.values()]
    .filter((c) => c.plays >= STREAM_MIN_PLAYS)
    .sort((a, b) => b.plays - a.plays)
    .map((c) => c.track);
}

function parseSpotifyExport(raw: unknown): ParsedFile {
  if (!raw || typeof raw !== "object") throw new Error("Not a valid JSON file");

  // StreamingHistory*.json is a bare array of play events.
  if (Array.isArray(raw)) {
    const tracks = tracksFromStreamingHistory(raw);
    if (tracks.length === 0)
      throw new Error(
        `No tracks reached ${STREAM_MIN_PLAYS} full plays in this history file`,
      );
    return { name: "Streaming History", tracks };
  }

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

  // Playlist1.json (full export) — { playlists: [{ name, items: [...] }, ...] }
  if (Array.isArray(obj["playlists"])) {
    const playlists = obj["playlists"] as Record<string, unknown>[];
    const seen = new Set<string>();
    const tracks: SpotifyTrack[] = [];
    for (const pl of playlists) {
      if (!Array.isArray(pl?.["items"])) continue;
      for (const t of tracksFromItems(pl["items"] as unknown[])) {
        const key = `${t.title} ${t.artist}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        tracks.push(t);
      }
    }

    if (tracks.length === 0) throw new Error("No tracks found in this export file");
    const first = playlists[0];
    const name =
      playlists.length === 1 && typeof first?.["name"] === "string" && first["name"]
        ? (first["name"] as string)
        : "Spotify Playlists";
    return { name, tracks };
  }

  // Playlist*.json — { name, items: [{ track: { trackName, artistName, albumName } }] }
  if (Array.isArray(obj["items"])) {
    const name =
      typeof obj["name"] === "string" && obj["name"] ? obj["name"] : "Spotify Playlist";
    const tracks = tracksFromItems(obj["items"] as unknown[]);

    if (tracks.length === 0) throw new Error("No tracks found in this playlist file");
    return { name, tracks };
  }

  throw new Error(
    "Unrecognized format — expected YourLibrary.json or a Playlist*.json file",
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Re-check cadence choices, shared by the import form and the sync list. */
const CADENCE: { days: number; label: string }[] = [
  { days: 1, label: "Daily" },
  { days: 3, label: "Every 3 days" },
  { days: 7, label: "Weekly" },
  { days: 14, label: "Every 2 weeks" },
];

const cadenceLabel = (days: number) =>
  CADENCE.find((c) => c.days === days)?.label ?? `Every ${days}d`;

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
        <code style={{ color: colors.accentLight }}>YourLibrary.json</code>,{" "}
        <code style={{ color: colors.accentLight }}>Playlist*.json</code> and{" "}
        <code style={{ color: colors.accentLight }}>StreamingHistory*.json</code>
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
  const [keepInSync, setKeepInSync] = useState(true);
  const [intervalDays, setIntervalDays] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SpotifyImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [syncRefresh, setSyncRefresh] = useState(0);

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
        // A sync needs a playlist to grow, so keepInSync implies saving one.
        savePlaylist: savePlaylist || keepInSync,
        keepInSync,
        intervalDays,
      });
      setResult(res);
      if (keepInSync) setSyncRefresh((n) => n + 1);
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
          required. Owned tracks become a playlist; unowned artists go to your
          wishlist. With “Keep syncing” on, tracks missing from your library
          are added to the playlist automatically as they become available.
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
          Songs), any{" "}
          <code style={{ color: colors.accentLight }}>Playlist*.json</code>, or a{" "}
          <code style={{ color: colors.accentLight }}>StreamingHistory*.json</code> file
          below.
        </div>
      </div>

      {/* Active syncs */}
      <SyncList refreshKey={syncRefresh} />

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
              checked={savePlaylist || keepInSync}
              disabled={keepInSync}
              onChange={(e) => setSavePlaylist(e.target.checked)}
              style={{ accentColor: colors.accent, width: 15, height: 15 }}
            />
            Save matched tracks as a playlist
          </label>

          {/* Keep syncing toggle */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              fontSize: 14,
              color: colors.muted,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={keepInSync}
              onChange={(e) => setKeepInSync(e.target.checked)}
              style={{ accentColor: colors.accent, width: 15, height: 15, marginTop: 3 }}
            />
            <span>
              Keep syncing
              <span style={{ display: "block", fontSize: 12, color: colors.faint, marginTop: 2 }}>
                Tracks not yet in your library are remembered and added to the playlist
                automatically as they arrive in your library.
              </span>
            </span>
          </label>

          {/* Re-check cadence (only meaningful while syncing) */}
          {keepInSync && (
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: colors.muted }}>
              Check the library
              <select
                value={intervalDays}
                onChange={(e) => setIntervalDays(Number(e.target.value))}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: `1px solid ${colors.border}`,
                  background: colors.panel2,
                  color: colors.text,
                  fontSize: 13,
                  outline: "none",
                }}
              >
                {CADENCE.map((c) => (
                  <option key={c.days} value={c.days}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}

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

// ── active syncs ──────────────────────────────────────────────────────────────

function relTime(ms?: number): string {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function SyncList({ refreshKey }: { refreshKey: number }) {
  const [syncs, setSyncs] = useState<SpotifySync[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    try {
      setSyncs(await listSpotifySyncs());
    } catch {
      /* leave the list as-is on a transient failure */
    }
  }

  useEffect(() => {
    void reload();
  }, [refreshKey]);

  async function withBusy(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await fn();
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  if (syncs.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: colors.faint }}>
        ONGOING SYNCS
      </div>
      {syncs.map((s) => (
        <div
          key={s.id}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            background: colors.panel,
            border: `1px solid ${colors.border}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 3, flex: 1, minWidth: 200 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</span>
            <span style={{ fontSize: 12, color: colors.muted }}>
              {s.matchedCount} in playlist · {s.pendingCount} waiting · {cadenceLabel(s.intervalDays)} · checked {relTime(s.lastRunAt)}
            </span>
            {s.lastStatus && (
              <span style={{ fontSize: 12, color: colors.faint }}>{s.lastStatus}</span>
            )}
          </div>

          {!s.enabled && (
            <span style={{ fontSize: 12, color: colors.faint, fontStyle: "italic" }}>paused</span>
          )}

          <select
            value={s.intervalDays}
            disabled={busyId === s.id}
            onChange={(e) =>
              void withBusy(s.id, () =>
                updateSpotifySync(s.id, { intervalDays: Number(e.target.value) }),
              )
            }
            title="How often to re-check the library"
            style={{
              padding: "6px 8px",
              borderRadius: 8,
              border: `1px solid ${colors.border}`,
              background: "transparent",
              color: colors.muted,
              fontSize: 12,
              cursor: busyId === s.id ? "not-allowed" : "pointer",
            }}
          >
            {CADENCE.map((c) => (
              <option key={c.days} value={c.days}>
                {c.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => void withBusy(s.id, () => runSpotifySync(s.id))}
            disabled={busyId === s.id || !s.enabled}
            style={syncBtnStyle(busyId === s.id || !s.enabled)}
          >
            {busyId === s.id ? "Checking…" : "Check now"}
          </button>
          <button
            onClick={() => void withBusy(s.id, () => updateSpotifySync(s.id, { enabled: !s.enabled }))}
            disabled={busyId === s.id}
            style={syncBtnStyle(busyId === s.id)}
          >
            {s.enabled ? "Pause" : "Resume"}
          </button>
          <button
            onClick={() => void withBusy(s.id, () => deleteSpotifySync(s.id))}
            disabled={busyId === s.id}
            style={{ ...syncBtnStyle(busyId === s.id), color: colors.red }}
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function syncBtnStyle(disabled: boolean): CSSProperties {
  return {
    padding: "6px 14px",
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: "transparent",
    color: disabled ? colors.faint : colors.muted,
    fontSize: 12,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

// ── results panel ─────────────────────────────────────────────────────────────

function ImportResults({
  result,
  onReset,
}: {
  result: SpotifyImportResult;
  onReset: () => void;
}) {
  const { sourceName, spotifyTotal, matched, misses, basketedArtists, plexPlaylist, sync } = result;
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
          <Pill label="added to wishlist" count={basketedArtists.length} />
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

      {/* Sync confirmation */}
      {sync && sync.pendingCount > 0 && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            background: "rgba(124,92,255,0.08)",
            border: `1px solid rgba(124,92,255,0.25)`,
            fontSize: 13,
            color: colors.accentLight,
          }}
        >
          Syncing on — {sync.pendingCount} track{sync.pendingCount === 1 ? "" : "s"} not in
          your library yet will be added to this playlist automatically as they arrive.
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
                    → wishlist
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
