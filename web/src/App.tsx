import { useCallback, useEffect, useState } from "react";
import type { AppVersion, AuthUser, LibraryStats } from "@resonarr/shared";
import { Sidebar, HubTabs, TopBar } from "./components/Sidebar";
import type { Tab } from "./components/Sidebar";
import { HomeView } from "./views/HomeView";
import { SageView } from "./views/SageView";
import { RadioView } from "./views/RadioView";
import { MixesView } from "./views/MixesView";
import { MoodsView } from "./views/MoodsView";
import { LovedView } from "./views/LovedView";
import { DiscoverView } from "./views/DiscoverView";
import { DeepCutsView } from "./views/DeepCutsView";
import { ArtistDiscoveryView } from "./views/ArtistDiscoveryView";
import { WeeklyView } from "./views/WeeklyView";
import { ProfileView } from "./views/ProfileView";
import { SpotifyView } from "./views/SpotifyView";
import { TimeMachineView } from "./views/TimeMachineView";
import { AdventureView } from "./views/AdventureView";
import { BasketView } from "./views/BasketView";
import { LogsView } from "./views/LogsView";
import { SettingsView } from "./views/SettingsView";
import { getBasket, getHealth, getLibraryStats, listSpotifySyncs, logout } from "./api";
import { loadFeedback } from "./feedback";
import { fx } from "./theme";

const TABS: Tab[] = [
  "home",
  "sage",
  "radio",
  "mixes",
  "moods",
  "loved",
  "discover",
  "deepcuts",
  "artists",
  "weekly",
  "profile",
  "timemachine",
  "adventure",
  "spotify",
  "basket",
  "logs",
  "settings",
];

// The active tab lives in the URL hash so it survives a page refresh and works
// with the browser's back/forward buttons.
function tabFromHash(): Tab {
  const h = window.location.hash.replace(/^#/, "");
  return (TABS as string[]).includes(h) ? (h as Tab) : "home";
}

// Below this width the sidebar gives way to a top bar + slide-out drawer.
const NARROW_QUERY = "(max-width: 820px)";

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

export function App({ authUser }: { authUser?: AuthUser }) {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [lidarrOk, setLidarrOk] = useState<boolean | null>(null);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [version, setVersion] = useState<AppVersion | null>(null);
  const [basketCount, setBasketCount] = useState(0);
  const [spotifyWaiting, setSpotifyWaiting] = useState(0);
  const narrow = useIsNarrow();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navigate = useCallback((t: Tab) => {
    window.location.hash = t;
    setTab(t);
    setDrawerOpen(false);
  }, []);

  // The drawer only makes sense on narrow layouts — close it when we widen.
  useEffect(() => {
    if (!narrow) setDrawerOpen(false);
  }, [narrow]);

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

  // Total tracks still waiting to arrive in Plex across all of the user's syncs.
  const refreshSpotifyWaiting = useCallback(() => {
    listSpotifySyncs()
      .then((syncs) => setSpotifyWaiting(syncs.reduce((n, s) => n + s.pendingCount, 0)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    getHealth()
      .then((h) => {
        setLidarrOk(h.lidarr.configured && h.lidarr.ok);
        setVersion(h.version);
      })
      .catch(() => setLidarrOk(false));
    getLibraryStats()
      .then(setStats)
      .catch(() => {});
    loadFeedback();
  }, []);

  // Keep the badges fresh as you move around the app.
  useEffect(() => {
    refreshBasket();
    refreshSpotifyWaiting();
  }, [tab, refreshBasket, refreshSpotifyWaiting]);

  const sidebar = (
    <Sidebar
      active={tab}
      onNavigate={navigate}
      basketCount={basketCount}
      spotifyWaiting={spotifyWaiting}
      stats={stats}
      lidarrOk={lidarrOk}
      version={version}
      authUser={authUser}
      onLogout={onLogout}
      showUser={!narrow}
    />
  );

  const content = (
    <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
      <div style={{ padding: narrow ? "20px 16px 40px" : "28px 34px 48px", maxWidth: 860 }}>
        <HubTabs active={tab} onNavigate={navigate} basketCount={basketCount} spotifyWaiting={spotifyWaiting} />
        {tab === "home" && (
          <HomeView
            onNavigate={navigate}
            stats={stats}
            basketWaiting={basketCount}
            userName={authUser?.name}
          />
        )}
        {tab === "sage" && <SageView />}
        {tab === "radio" && <RadioView />}
        {tab === "mixes" && <MixesView />}
        {tab === "moods" && <MoodsView />}
        {tab === "loved" && <LovedView />}
        {tab === "discover" && <DiscoverView />}
        {tab === "deepcuts" && <DeepCutsView />}
        {tab === "artists" && <ArtistDiscoveryView />}
        {tab === "weekly" && <WeeklyView />}
        {tab === "profile" && <ProfileView />}
        {tab === "timemachine" && <TimeMachineView />}
        {tab === "adventure" && <AdventureView />}
        {tab === "spotify" && <SpotifyView />}
        {tab === "basket" && <BasketView onChange={refreshBasket} />}
        {tab === "logs" && <LogsView />}
        {tab === "settings" && <SettingsView />}
      </div>
    </div>
  );

  // Wide layout: persistent sidebar beside the content.
  if (!narrow) {
    return (
      <div style={{ height: "100%", display: "flex", overflow: "hidden", background: fx.appBg }}>
        {sidebar}
        {content}
      </div>
    );
  }

  // Narrow layout: top bar (with the always-visible username) + slide-out drawer.
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: fx.appBg }}>
      <TopBar onMenu={() => setDrawerOpen(true)} authUser={authUser} onLogout={onLogout} />
      {content}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            background: "rgba(0,0,0,0.55)",
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ height: "100%", display: "flex" }}>
            {sidebar}
          </div>
        </div>
      )}
    </div>
  );
}
