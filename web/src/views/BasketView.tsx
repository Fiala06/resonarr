import { useEffect, useState } from "react";
import type { BasketItem, BasketItemStatus } from "@resonarr/shared";
import {
  addToBasket,
  getBasket,
  refreshBasket,
  removeFromBasket,
  requestBasket,
} from "../api";
import { colors } from "../theme";

const STATUS_COLOR: Record<BasketItemStatus, string> = {
  pending: colors.muted,
  requested: colors.gold, // submitted, still downloading
  done: colors.green, // files have landed in Lidarr
  failed: colors.red,
};

const STATUS_LABEL: Record<BasketItemStatus, string> = {
  pending: "pending",
  requested: "requested",
  done: "✓ done",
  failed: "failed",
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
      setMsg(`Requested ${requested} · failed ${failed}`);
    } catch (e) {
      setMsg(`Request failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRequesting(false);
    }
  }

  const pendingCount = items.filter((i) => i.status === "pending").length;

  return (
    <section style={{ display: "grid", gap: 16, maxWidth: 620 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Basket</h1>
        <p style={{ color: colors.muted, margin: "3px 0 0", fontSize: 13 }}>
          Everything recommended that you don’t own yet. Verified against Lidarr,
          sent artist-first with search, tracked here until it lands.
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
          style={{ ...buttonStyle, opacity: selected.size === 0 ? 0.5 : 1 }}
        >
          Request selected ({selected.size})
        </button>
        <button
          onClick={() => request(true)}
          disabled={requesting || pendingCount === 0}
          style={{
            ...buttonStyle,
            background: "transparent",
            border: `1px solid ${colors.border}`,
            opacity: pendingCount === 0 ? 0.5 : 1,
          }}
        >
          Request all pending ({pendingCount})
        </button>
        <button
          onClick={checkStatus}
          disabled={refreshing}
          title="Re-check Lidarr for downloads"
          style={{
            ...buttonStyle,
            background: "transparent",
            border: `1px solid ${colors.border}`,
          }}
        >
          {refreshing ? "Checking…" : "Check status"}
        </button>
        {msg && <span style={{ color: colors.muted, fontSize: "0.85rem" }}>{msg}</span>}
      </div>

      {/* List */}
      {items.length === 0 ? (
        <p style={{ color: colors.muted }}>Basket is empty.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {items.map((it) => (
            <div
              key={it.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 6,
                background: colors.panel,
                border: `1px solid ${colors.border}`,
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(it.id)}
                onChange={() => toggle(it.id)}
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
              <span
                style={{
                  color: STATUS_COLOR[it.status],
                  fontSize: "0.8rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
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
                  Retry
                </button>
              )}
              <button
                onClick={() => remove(it.id)}
                title="Remove"
                style={{
                  background: "transparent",
                  color: colors.muted,
                  border: "none",
                  cursor: "pointer",
                  fontSize: "1.1rem",
                }}
              >
                ×
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
  background: colors.accent,
  color: "white",
  border: "none",
  borderRadius: 6,
  padding: "9px 16px",
  cursor: "pointer",
};
