import { useCallback, useEffect, useState } from "react";
import type { AuthUser, LibraryStats } from "@resonarr/shared";
import { Sidebar } from "./components/Sidebar";
import type { Tab } from "./components/Sidebar";
import { SageView } from "./views/SageView";
import { RadioView } from "./views/RadioView";
import { MixesView } from "./views/MixesView";
import { DiscoverView } from "./views/DiscoverView";
import { DeepCutsView } from "./views/DeepCutsView";
import { ArtistDiscoveryView } from "./views/ArtistDiscoveryView";
import { WeeklyView } from "./views/WeeklyView";
import { ProfileView } from "./views/ProfileView";
import { AdventureView } from "./views/AdventureView";
import { BasketView } from "./views/BasketView";
import { LogsView } from "./views/LogsView";
import { SettingsView } from "./views/SettingsView";
import { getBasket, getHealth, getLibraryStats, logout } from "./api";
import { loadFeedback } from "./feedback";
import { fx } from "./theme";

const TABS: Tab[] = [
  "sage",
  "radio",
  "mixes",
  "discover",
  "deepcuts",
  "artists",
  "weekly",
  "profile",
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
    loadFeedback();
  }, []);

  // Keep the basket badge fresh as you move around the app.
  useEffect(() => {
    refreshBasket();
  }, [tab, refreshBasket]);

  return (
    <div style={{ height: "100%", display: "flex", overflow: "hidden", background: fx.appBg }}>
      <Sidebar
        active={tab}
        onNavigate={navigate}
        basketCount={basketCount}
        stats={stats}
        lidarrOk={lidarrOk}
        authUser={authUser}
        onLogout={onLogout}
      />
      <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
        <div style={{ padding: "28px 34px 48px", maxWidth: 860 }}>
          {tab === "sage" && <SageView />}
          {tab === "radio" && <RadioView />}
          {tab === "mixes" && <MixesView />}
          {tab === "discover" && <DiscoverView />}
          {tab === "deepcuts" && <DeepCutsView />}
          {tab === "artists" && <ArtistDiscoveryView />}
          {tab === "weekly" && <WeeklyView />}
          {tab === "profile" && <ProfileView />}
          {tab === "adventure" && <AdventureView />}
          {tab === "basket" && <BasketView onChange={refreshBasket} />}
          {tab === "logs" && <LogsView />}
          {tab === "settings" && <SettingsView />}
        </div>
      </div>
    </div>
  );
}
