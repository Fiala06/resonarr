import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  SpotifyImportJob,
  SpotifyImportJobDetail,
  SpotifyImportJobItem,
  SpotifyImportResult,
  SpotifySync,
  SpotifyTrack,
} from "@resonarr/shared";
import {
  deleteSpotifyImportJob,
  deleteSpotifySync,
  getSpotifyImportJob,
  getSpotifyImportJobs,
  listSpotifySyncs,
  runSpotifySync,
  startSpotifyImport,
  updateSpotifySync,
} from "../api";
import { TrackRow } from "../components/TrackRow";
import { SavePlaylistBar } from "../components/SavePlaylistBar";
import { colors, fx } from "../theme";

// ── Spotify export file parsing ───────────────────────────────────────────────

interface ParsedFile {
  name: string;
  tracks: SpotifyTrack[];
  // When the source held multiple playlists, these are the individual ones.
  // `tracks`/`name` above are the merged-and-deduped view of them.
  parts?: ParsedFile[];
}

function dedupeTracks(input: SpotifyTrack[], seen = new Set<string>()): SpotifyTrack[] {
  const out: SpotifyTrack[] = [];
  for (const t of input) {
    const key = `${t.title} ${t.artist}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
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
    // Each non-empty playlist becomes its own part (deduped within itself).
    const parts: ParsedFile[] = [];
    for (const pl of obj["playlists"] as Record<string, unknown>[]) {
      if (!Array.isArray(pl?.["items"])) continue;
      const tracks = dedupeTracks(tracksFromItems(pl["items"] as unknown[]));
      if (tracks.length === 0) continue;
      const plName =
        typeof pl["name"] === "string" && pl["name"]
          ? (pl["name"] as string)
          : "Spotify Playlist";
      parts.push({ name: plName, tracks });
    }

    if (parts.length === 0) throw new Error("No tracks found in this export file");

    // A single playlist behaves like any other Playlist*.json.
    const first = parts[0];
    if (parts.length === 1 && first) return { name: first.name, tracks: first.tracks };

    // Otherwise expose both: the merged view and the individual parts.
    const merged = dedupeTracks(parts.flatMap((p) => p.tracks));
    return { name: "Spotify Playlists", tracks: merged, parts };
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
  const [mergeOne, setMergeOne] = useState(false);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<SpotifyImportJobDetail | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [syncRefresh, setSyncRefresh] = useState(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  // Lets an in-flight poll loop bail out when the user resets or unmounts.
  const pollGen = useRef(0);
  useEffect(() => () => void (pollGen.current += 1), []);

  // The full export holds many playlists; a single one acts like any playlist file.
  const parts = parsed?.parts;
  const isMulti = (parts?.length ?? 0) > 1;
  // Import each playlist on its own unless the user asks to merge them.
  const perPlaylist = isMulti && !mergeOne;

  function handleFile(text: string, filename: string) {
    setParseError(null);
    setJob(null);
    setImportError(null);
    setMergeOne(false);
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

  function reset() {
    pollGen.current += 1; // stop any in-flight poll
    setParsed(null);
    setName("");
    setJob(null);
    setMergeOne(false);
    setBusy(false);
  }

  async function handleImport() {
    if (!parsed) return;
    setBusy(true);
    setImportError(null);
    setJob(null);

    // One playlist per part when splitting; otherwise a single merged playlist.
    const playlists =
      perPlaylist && parts
        ? parts.map((p) => ({ name: p.name, tracks: p.tracks }))
        : [{ name, tracks: parsed.tracks }];

    const gen = ++pollGen.current;
    try {
      const started = await startSpotifyImport({
        playlists,
        // A sync needs a playlist to grow, so keepInSync implies saving one.
        savePlaylist: savePlaylist || keepInSync,
        keepInSync,
        intervalDays,
      });
      setHistoryRefresh((n) => n + 1); // show it in history right away

      // Poll for progress until the server-side job finishes. If the user
      // navigates away the loop stops, but the import keeps running server-side.
      let detail = await getSpotifyImportJob(started.id);
      if (pollGen.current === gen) setJob(detail);
      while (detail.status === "running" && pollGen.current === gen) {
        await new Promise((r) => setTimeout(r, 1500));
        if (pollGen.current !== gen) return;
        detail = await getSpotifyImportJob(started.id);
        if (pollGen.current === gen) setJob(detail);
      }
      if (pollGen.current === gen) {
        if (keepInSync) setSyncRefresh((n) => n + 1);
        setHistoryRefresh((n) => n + 1);
      }
    } catch (e) {
      if (pollGen.current === gen) setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      if (pollGen.current === gen) setBusy(false);
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
      {parsed && !job && (
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
            <span style={{ fontWeight: 600 }}>
              {perPlaylist
                ? `${parts?.length} playlists · ${parts?.reduce((n, p) => n + p.tracks.length, 0)} tracks`
                : `${parsed.tracks.length} tracks found`}
            </span>
          </div>

          {/* Merge toggle (only when the file held several playlists) */}
          {isMulti && (
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
                checked={mergeOne}
                onChange={(e) => setMergeOne(e.target.checked)}
                style={{ accentColor: colors.accent, width: 15, height: 15 }}
              />
              Merge into one playlist
            </label>
          )}

          {/* Name field — per-playlist split keeps each playlist's own name */}
          {!perPlaylist && (
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
          )}

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
            {(() => {
              const disabled = busy || (!perPlaylist && !name.trim());
              return (
                <button
                  onClick={() => void handleImport()}
                  disabled={disabled}
                  style={{
                    padding: "10px 26px",
                    borderRadius: 9,
                    border: "none",
                    background: disabled ? colors.panel2 : fx.btnBg,
                    color: disabled ? colors.faint : "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: disabled ? "not-allowed" : "pointer",
                    boxShadow: disabled ? "none" : fx.btnGlow,
                    transition: "background .2s, color .2s, box-shadow .2s",
                  }}
                >
                  {busy
                    ? "Importing…"
                    : perPlaylist
                      ? `Import ${parts?.length} playlists`
                      : "Import"}
                </button>
              );
            })()}
            <button
              onClick={reset}
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

      {/* Live progress + results for the current job */}
      {job && <JobView job={job} onReset={reset} />}

      {/* Past imports */}
      <ImportHistory refreshKey={historyRefresh} />
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
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  async function reload() {
    try {
      const fresh = await listSpotifySyncs();
      if (mounted.current) setSyncs(fresh);
    } catch {
      /* leave the list as-is on a transient failure */
    }
  }

  useEffect(() => {
    void reload();
  }, [refreshKey]);

  async function withBusy(id: string, fn: () => Promise<unknown>) {
    setError(null);
    setBusyId(id);
    try {
      await fn();
      await reload();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusyId(null);
    }
  }

  /**
   * Re-check now. The server runs the backfill detached (it can take minutes for
   * a big pending list), so we trigger it and then poll the list until this
   * sync's last-run time advances, keeping "Checking…" up the whole time.
   */
  async function checkNow(s: SpotifySync) {
    const before = s.lastRunAt ?? 0;
    setError(null);
    setBusyId(s.id);
    try {
      await runSpotifySync(s.id);
      for (let i = 0; i < 150 && mounted.current; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        if (!mounted.current) return;
        const fresh = await listSpotifySyncs();
        if (!mounted.current) return;
        setSyncs(fresh);
        const cur = fresh.find((x) => x.id === s.id);
        if (!cur || (cur.lastRunAt ?? 0) > before) break;
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusyId(null);
    }
  }

  if (syncs.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: colors.faint }}>
        ONGOING SYNCS
      </div>
      {error && (
        <p style={{ margin: 0, color: colors.red, fontSize: 13 }}>{error}</p>
      )}
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
            onClick={() => void checkNow(s)}
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

// ── import job: live progress + results ───────────────────────────────────────

const JOB_STATUS_COLOR: Record<SpotifyImportJobItem["status"], string> = {
  pending: colors.faint,
  running: colors.accentLight,
  done: colors.green,
  error: colors.red,
};

function StatusDot({ status }: { status: SpotifyImportJobItem["status"] }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: JOB_STATUS_COLOR[status],
        flexShrink: 0,
        ...(status === "running" ? { animation: "pulse 1s ease-in-out infinite" } : {}),
      }}
    />
  );
}

/** Per-playlist outcome: finished items expand to full results; others show status. */
function JobResults({ detail }: { detail: SpotifyImportJobDetail }) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      {detail.items.map((item, idx) => {
        const result = detail.results[idx];
        if (item.status === "done" && result) {
          return <ImportResults key={idx} result={result} />;
        }
        return (
          <div
            key={idx}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 10,
              background: fx.rowBg,
              border: `1px solid ${colors.border}`,
              fontSize: 14,
            }}
          >
            <StatusDot status={item.status} />
            <span style={{ fontWeight: 600 }}>{item.name}</span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: colors.muted }}>
              {item.status === "pending" && "Waiting…"}
              {item.status === "running" && "Importing…"}
              {item.status === "error" && (item.error ?? "Failed")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The active import: a progress header plus results as each playlist finishes. */
function JobView({
  job,
  onReset,
}: {
  job: SpotifyImportJobDetail;
  onReset: () => void;
}) {
  const running = job.status === "running";
  const headline = running
    ? `Importing ${job.done}/${job.total}…`
    : job.status === "error"
      ? `Imported with errors (${job.done}/${job.total})`
      : job.total === 1
        ? "Import complete"
        : `Imported ${job.total} playlists`;

  return (
    <div
      style={{
        padding: "16px 20px",
        borderRadius: 12,
        background: colors.panel,
        border: `1px solid ${colors.border}`,
        display: "grid",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{headline}</span>
        {running && (
          <span style={{ fontSize: 12, color: colors.faint }}>
            Safe to leave — this keeps running on the server.
          </span>
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
      <JobResults detail={job} />
    </div>
  );
}

// ── import history ────────────────────────────────────────────────────────────

function ImportHistory({ refreshKey }: { refreshKey: number }) {
  const [jobs, setJobs] = useState<SpotifyImportJob[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SpotifyImportJobDetail | null>(null);

  useEffect(() => {
    let live = true;
    void getSpotifyImportJobs()
      .then((j) => live && setJobs(j))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [refreshKey]);

  async function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    try {
      setDetail(await getSpotifyImportJob(id));
    } catch {
      /* ignore */
    }
  }

  async function remove(id: string) {
    try {
      await deleteSpotifyImportJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      if (openId === id) {
        setOpenId(null);
        setDetail(null);
      }
    } catch {
      /* ignore */
    }
  }

  if (jobs.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: colors.faint }}>
        RECENT IMPORTS
      </div>
      {jobs.map((j) => {
        const matched = j.items.reduce((n, it) => n + it.matchedCount, 0);
        const isOpen = openId === j.id;
        return (
          <div
            key={j.id}
            style={{
              borderRadius: 12,
              background: colors.panel,
              border: `1px solid ${colors.border}`,
              overflow: "hidden",
            }}
          >
            <div
              onClick={() => void toggle(j.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 16px",
                cursor: "pointer",
              }}
            >
              <StatusDot status={j.status === "running" ? "running" : j.status === "error" ? "error" : "done"} />
              <span style={{ fontWeight: 600 }}>
                {j.total === 1 ? j.items[0]?.name ?? "Import" : `${j.total} playlists`}
              </span>
              <span style={{ fontSize: 12, color: colors.muted }}>
                {relTime(Date.parse(j.createdAt))}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <Pill label="matched" count={matched} />
                {j.status === "running" && (
                  <span style={{ fontSize: 12, color: colors.accentLight }}>
                    {j.done}/{j.total}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(j.id);
                  }}
                  title="Remove from history"
                  style={{
                    border: "none",
                    background: "transparent",
                    color: colors.faint,
                    fontSize: 16,
                    cursor: "pointer",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            </div>
            {isOpen && (
              <div style={{ padding: "0 16px 16px" }}>
                {detail ? (
                  <JobResults detail={detail} />
                ) : (
                  <p style={{ margin: 0, color: colors.muted, fontSize: 13 }}>Loading…</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── results panel ─────────────────────────────────────────────────────────────

function ImportResults({
  result,
  onReset,
}: {
  result: SpotifyImportResult;
  onReset?: () => void;
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
        {onReset && (
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
        )}
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
