import { useCallback, useEffect, useState } from "react";
import type { LibraryStats } from "@resonarr/shared";
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
import { getBasket, getHealth, getLibraryStats } from "./api";

export function App() {
  const [tab, setTab] = useState<Tab>("sage");
  const [lidarrOk, setLidarrOk] = useState<boolean | null>(null);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [basketCount, setBasketCount] = useState(0);

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
  }, []);

  // Keep the basket badge fresh as you move around the app.
  useEffect(() => {
    refreshBasket();
  }, [tab, refreshBasket]);

  return (
    <div style={{ height: "100%", display: "flex", overflow: "hidden" }}>
      <Sidebar
        active={tab}
        onNavigate={setTab}
        basketCount={basketCount}
        stats={stats}
        lidarrOk={lidarrOk}
      />
      <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
        <div style={{ padding: "28px 34px 48px", maxWidth: 860 }}>
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
