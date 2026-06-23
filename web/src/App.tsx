import { useCallback, useEffect, useState } from "react";
import type { AuthUser, LibraryStats, UserProfile } from "@resonarr/shared";
import { Sidebar } from "./components/Sidebar";
import type { Tab } from "./components/Sidebar";
import { SageView } from "./views/SageView";
import { RadioView } from "./views/RadioView";
import { MixesView } from "./views/MixesView";
import { DiscoverView } from "./views/DiscoverView";
import { AdventureView } from "./views/AdventureView";
import { BasketView } from "./views/BasketView";
import { LogsView } from "./views/LogsView";
import { SettingsView } from "./views/SettingsView";
import {
  getBasket,
  getHealth,
  getLibraryStats,
  getProfiles,
  logout,
} from "./api";

const TABS: Tab[] = [
  "sage",
  "radio",
  "mixes",
  "discover",
  "adventure",
  "basket",
  "logs",
  "settings",
];

// The active tab lives in the URL hash so it survives a page refresh and works
// with the browser's back/forward buttons.
function tabFromHash(): Tab {
  const h = window.location.hash.replace(/^#/, "");
  return (TABS as string[]).includes(h) ? (h as Tab) : "sage";
}

export function App({ authUser }: { authUser?: AuthUser }) {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [lidarrOk, setLidarrOk] = useState<boolean | null>(null);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [basketCount, setBasketCount] = useState(0);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);

  const activeProfileId = profiles.find((p) => p.active)?.id ?? "owner";

  const loadProfiles = useCallback(() => {
    getProfiles().then(setProfiles).catch(() => {});
  }, []);

  const navigate = useCallback((t: Tab) => {
    window.location.hash = t;
    setTab(t);
  }, []);

  const onLogout = useCallback(async () => {
    await logout();
    window.location.reload();
  }, []);

  // Reflect back/forward navigation (and manual hash edits) into state.
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const refreshBasket = useCallback(() => {
    getBasket()
      .then((items) => setBasketCount(items.filter((i) => i.status !== "done").length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    getHealth()
      .then((h) => setLidarrOk(h.lidarr.configured && h.lidarr.ok))
      .catch(() => setLidarrOk(false));
    getLibraryStats()
      .then(setStats)
      .catch(() => {});
    loadProfiles();
  }, [loadProfiles]);

  // Keep the basket badge fresh as you move around the app.
  useEffect(() => {
    refreshBasket();
  }, [tab, refreshBasket]);

  return (
    <div style={{ height: "100%", display: "flex", overflow: "hidden" }}>
      <Sidebar
        active={tab}
        onNavigate={navigate}
        basketCount={basketCount}
        stats={stats}
        lidarrOk={lidarrOk}
        profiles={profiles}
        onProfilesChanged={loadProfiles}
        authUser={authUser}
        onLogout={onLogout}
      />
      <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
        {/* Remount views when the active profile changes so they refetch with
            the new account's token (playlists, history, etc.). */}
        <div key={activeProfileId} style={{ padding: "28px 34px 48px", maxWidth: 860 }}>
          {tab === "sage" && <SageView />}
          {tab === "radio" && <RadioView />}
          {tab === "mixes" && <MixesView />}
          {tab === "discover" && <DiscoverView />}
          {tab === "adventure" && <AdventureView />}
          {tab === "basket" && <BasketView onChange={refreshBasket} />}
          {tab === "logs" && <LogsView />}
          {tab === "settings" && <SettingsView />}
        </div>
      </div>
    </div>
  );
}
