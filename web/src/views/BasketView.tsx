import { useEffect, useState } from "react";
import type { BasketItem, BasketItemStatus } from "@resonarr/shared";
import {
  addToBasket,
  getBasket,
  refreshBasket,
  removeFromBasket,
  requestBasket,
} from "../api";
import { AlbumArt } from "../components/AlbumArt";
import { AuditionLinks } from "../components/AuditionLinks";
import { colors, fx } from "../theme";

const STATUS_COLOR: Record<BasketItemStatus, string> = {
  pending: colors.muted,
  requested: colors.gold, // submitted, still downloading
  done: colors.green, // files have landed in Lidarr
  failed: colors.red,
};

// Plain-language status words a non-technical user can follow at a glance.
const STATUS_LABEL: Record<BasketItemStatus, string> = {
  pending: "Waiting",
  requested: "Downloading",
  done: "✓ Ready to play",
  failed: "Couldn’t find",
};

export function BasketView({ onChange }: { onChange?: () => void }) {
  const [items, setItemsRaw] = useState<BasketItem[]>([]);

  // Update local state and let the parent refresh the sidebar badge.
  function setItems(next: BasketItem[]) {
    setItemsRaw(next);
    onChange?.();
  }

  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [requesting, setRequesting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    // Refresh against Lidarr on open so "done" reflects what has landed.
    getBasket().then(setItems).catch((e) => setMsg(String(e)));
    refreshBasket().then(setItems).catch(() => {});
  }, []);

  async function checkStatus() {
    setRefreshing(true);
    setMsg(null);
    try {
      const updated = await refreshBasket();
      setItems(updated);
      const doneCount = updated.filter((i) => i.status === "done").length;
      setMsg(`${doneCount} downloaded`);
    } catch (e) {
      setMsg(`Status check failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRefreshing(false);
    }
  }

  async function add() {
    if (!artist.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      await addToBasket(artist.trim(), album.trim() || undefined);
      setArtist("");
      setAlbum("");
      setItems(await getBasket());
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    await removeFromBasket(id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setItems(await getBasket());
  }

  // Confirm before removing so a mis-tap doesn't silently drop a wishlist item.
  function askRemove(it: BasketItem) {
    const label = it.album ? `${it.artist} — ${it.album}` : it.artist;
    if (window.confirm(`Remove ${label} from your wishlist?`)) void remove(it.id);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function request(all: boolean) {
    setRequesting(true);
    setMsg(null);
    try {
      const ids = all ? undefined : [...selected];
      const updated = await requestBasket(ids);
      setItems(updated);
      setSelected(new Set());
      const requested = updated.filter((i) => i.status === "requested").length;
      const failed = updated.filter((i) => i.status === "failed").length;
      setMsg(`Sent ${requested} to download · ${failed} couldn’t be found`);
    } catch (e) {
      setMsg(`Couldn’t send: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRequesting(false);
    }
  }

  const pendingCount = items.filter((i) => i.status === "pending").length;

  return (
    <section className="rsn-rise" style={{ display: "grid", gap: 16, maxWidth: 620 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 1.4, fontWeight: 700, color: colors.accentLight }}>
          WISHLIST
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", letterSpacing: "-0.4px" }}>
          Everything worth owning, in one click
        </h1>
        <div style={{ width: 42, height: 3, borderRadius: 3, background: fx.accentBar, marginTop: 12 }} />
        <p style={{ color: colors.muted, margin: "12px 0 0", fontSize: 13.5 }}>
          Everything recommended that you don’t own yet. Each one is checked to
          make sure it can be found, then downloaded the moment you add it —
          tracked here until it lands in your library. Anything still waiting
          just needs your download target set in Settings.
        </p>
      </div>

      {/* Add form */}
      <div
        style={{
          display: "grid",
          gap: 8,
          padding: 12,
          borderRadius: 8,
          background: colors.panel,
          border: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Artist"
            onKeyDown={(e) => e.key === "Enter" && add()}
            style={inputStyle}
          />
          <input
            value={album}
            onChange={(e) => setAlbum(e.target.value)}
            placeholder="Album (optional)"
            onKeyDown={(e) => e.key === "Enter" && add()}
            style={inputStyle}
          />
          <button
            onClick={add}
            disabled={adding}
            className="rsn-btn"
            style={{ ...buttonStyle, whiteSpace: "nowrap" }}
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
        {addError && (
          <span style={{ color: colors.red, fontSize: "0.85rem" }}>
            {addError}
          </span>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          onClick={() => request(false)}
          disabled={requesting || selected.size === 0}
          className="rsn-btn"
          style={{ ...buttonStyle, opacity: selected.size === 0 ? 0.5 : 1 }}
        >
          Download selected ({selected.size})
        </button>
        <button
          onClick={() => request(true)}
          disabled={requesting || pendingCount === 0}
          className="rsn-btn"
          style={{
            ...buttonStyle,
            background: "transparent",
            boxShadow: "none",
            border: `1px solid ${colors.border}`,
            opacity: pendingCount === 0 ? 0.5 : 1,
          }}
        >
          Download all waiting ({pendingCount})
        </button>
        <button
          onClick={checkStatus}
          disabled={refreshing}
          title="Re-check download status"
          className="rsn-btn"
          style={{
            ...buttonStyle,
            background: "transparent",
            boxShadow: "none",
            border: `1px solid ${colors.border}`,
          }}
        >
          {refreshing ? "Checking…" : "Check status"}
        </button>
        {msg && <span style={{ color: colors.muted, fontSize: "0.85rem" }}>{msg}</span>}
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div
          style={{
            display: "grid",
            gap: 12,
            justifyItems: "start",
            padding: "16px 18px",
            borderRadius: 12,
            background: colors.panel,
            border: `1px solid ${colors.border}`,
          }}
        >
          <p style={{ color: colors.muted, margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
            Your wishlist is empty. As you explore, anything recommended that you
            don't own yet collects here to download — try “Describe a Vibe” or
            “Find New Artists” to fill it.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                window.location.hash = "sage";
              }}
              className="rsn-btn"
              style={{ ...buttonStyle, padding: "9px 16px" }}
            >
              Describe a Vibe →
            </button>
            <button
              onClick={() => {
                window.location.hash = "artists";
              }}
              className="rsn-btn"
              style={{
                ...buttonStyle,
                padding: "9px 16px",
                background: "transparent",
                boxShadow: "none",
                border: `1px solid ${colors.border}`,
              }}
            >
              Find New Artists →
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {items.map((it) => (
            <div
              key={it.id}
              className="rsn-row"
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 9,
                background: fx.rowBg,
                border: `1px solid ${colors.border}`,
                boxShadow: fx.rowShadow,
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(it.id)}
                onChange={() => toggle(it.id)}
                aria-label="Select for download"
                style={{ width: 18, height: 18, flex: "none", cursor: "pointer" }}
              />
              <AlbumArt
                album={it.album ?? it.artist}
                artist={it.artist}
                coverUrl={it.coverUrl}
                tint={colors.seedBg}
                eyebrow={it.type === "artist" ? "ARTIST" : "ALBUM"}
                line={
                  it.status === "done"
                    ? "Downloaded · in your library"
                    : it.status === "pending"
                      ? "Waiting · set download target to send"
                      : it.status === "failed"
                        ? "Not found automatically — try the links, or retry"
                        : "Sending to download…"
                }
                tone={
                  it.status === "done"
                    ? "owned"
                    : it.status === "pending"
                      ? "missing"
                      : "info"
                }
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>
                  {it.artist}
                  {it.album ? ` — ${it.album}` : ""}
                </div>
                <div style={{ fontSize: "0.8rem", color: colors.muted }}>
                  {it.type} · {it.source}
                </div>
              </div>
              <AuditionLinks artist={it.artist} album={it.album} mbid={it.mbid} />
              <span
                style={{
                  color: STATUS_COLOR[it.status],
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {STATUS_LABEL[it.status]}
              </span>
              {it.status === "failed" && (
                <button
                  onClick={async () => {
                    setItems(await requestBasket([it.id]));
                  }}
                  style={{
                    font: "inherit",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    background: "transparent",
                    color: colors.accentLight,
                    border: `1px solid ${colors.accent}`,
                    borderRadius: 5,
                    padding: "4px 11px",
                    cursor: "pointer",
                  }}
                >
                  Try again
                </button>
              )}
              <button
                onClick={() => askRemove(it)}
                title="Remove from wishlist"
                aria-label="Remove from wishlist"
                style={{
                  flex: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 34,
                  height: 34,
                  background: "transparent",
                  color: colors.muted,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const inputStyle = {
  flex: 1,
  minWidth: 0,
  background: colors.bg,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "9px 12px",
};

const buttonStyle = {
  background: fx.btnBg,
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "10px 16px",
  boxShadow: fx.btnGlow,
  cursor: "pointer",
};
