"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { mergeCatalogs, type AllOverrides, type CatalogKind, type CatalogOverrides, type Catalogs } from "@/lib/preop/catalog";
import { DEFAULT_CATALOGS } from "@/lib/preop/catalog-defaults";
import { request } from "./api";

// The catalogues of the module (Paramètres): PreOx's defaults merged with
// the user's changes, kept on the device for offline use and synced
// through /api/preop/catalogs.

const CACHE_KEY = "preox:preop:catalogs";

interface CatalogsContextValue {
  catalogs: Catalogs;
  overrides: AllOverrides;
  save: <K extends CatalogKind>(kind: K, overrides: CatalogOverrides<Catalogs[K][number]>) => Promise<void>;
}

const CatalogsContext = createContext<CatalogsContextValue | null>(null);

function readCache(): AllOverrides {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AllOverrides) : {};
  } catch {
    return {};
  }
}

function writeCache(o: AllOverrides) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(o));
  } catch {
    // Storage full or blocked: still works online.
  }
}

export function CatalogsProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<AllOverrides>({});

  useEffect(() => {
    const cached = readCache();
    const t = setTimeout(() => {
      if (Object.keys(cached).length) setOverrides(cached);
      request<{ overrides: AllOverrides }>("/api/preop/catalogs")
        .then(({ overrides: fresh }) => {
          setOverrides(fresh);
          writeCache(fresh);
        })
        .catch(() => undefined);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const save = useCallback(async <K extends CatalogKind>(kind: K, o: CatalogOverrides<Catalogs[K][number]>) => {
    await request<{ ok: true }>("/api/preop/catalogs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, overrides: o }) });
    setOverrides((current) => {
      const next = { ...current, [kind]: o };
      writeCache(next);
      return next;
    });
  }, []);

  const catalogs = useMemo(() => mergeCatalogs(DEFAULT_CATALOGS, overrides), [overrides]);
  return <CatalogsContext.Provider value={{ catalogs, overrides, save }}>{children}</CatalogsContext.Provider>;
}

export function useCatalogs(): CatalogsContextValue {
  const ctx = useContext(CatalogsContext);
  // Outside the provider (tests, previews): the defaults, read-only.
  return ctx ?? { catalogs: DEFAULT_CATALOGS, overrides: {}, save: async () => undefined };
}
