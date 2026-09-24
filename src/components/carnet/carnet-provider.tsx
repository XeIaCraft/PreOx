"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { CarnetStore, type CarnetState } from "@/lib/carnet/store";
import type { CarnetMutation } from "@/lib/carnet/types";

const CarnetContext = createContext<CarnetStore | null>(null);

const RETRY_INTERVAL_MS = 60_000;

/**
 * One store per signed-in user for the whole module (its IndexedDB keys are
 * prefixed with the user id, so a shared device never shows someone else's
 * carnet). Keeps it in step with connectivity and tab visibility: back
 * online or back in view → deliver pending changes and refresh; tab hidden
 * → deliver before the browser may freeze the page; and a periodic retry
 * while changes are still waiting.
 */
export function CarnetProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [store] = useState(() => new CarnetStore(userId));

  useEffect(() => {
    void store.init();
    store.setOnline(navigator.onLine);
    const onOnline = () => store.setOnline(true);
    const onOffline = () => store.setOnline(false);
    const onVisibility = () => {
      if (document.visibilityState === "visible") store.refreshIfStale();
      else if (store.getState().status.pending > 0) void store.sync();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = setInterval(() => {
      if (store.getState().status.pending > 0) void store.sync();
    }, RETRY_INTERVAL_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
    };
  }, [store]);

  return <CarnetContext.Provider value={store}>{children}</CarnetContext.Provider>;
}

export function useCarnet(): CarnetState & { commit: (mutations: CarnetMutation[]) => void; store: CarnetStore } {
  const store = useContext(CarnetContext);
  if (!store) throw new Error("useCarnet must be used within CarnetProvider");
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return { ...state, commit: (mutations) => store.commit(mutations), store };
}
