"use client";

import { useCallback, useEffect, useState } from "react";
import type { Rule } from "@/lib/preop/rules/types";
import { readCache as readAny, request, writeCache as writeAny } from "./api";

// The rule library in the browser: shown at once from the last copy kept
// on the device (so the consultation also works offline), refreshed from
// the server, saved through /api/preop/rules. The library is small (a few
// hundred rules at most) — no need for the carnet's queue machinery here:
// saving needs the network, and says so when it isn't there.

const CACHE_KEY = "preox:preop:rules";
const readCache = () => readAny<Rule>(CACHE_KEY);
const writeCache = (rules: Rule[]) => writeAny(CACHE_KEY, rules);

export function useRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { rules: fresh } = await request<{ rules: Rule[] }>("/api/preop/rules");
      setRules(fresh);
      writeCache(fresh);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Cached copy first (instant, offline), then the server's.
    const cached = readCache();
    const timer = setTimeout(() => {
      if (cached.length > 0) setRules(cached);
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const save = useCallback(async (rule: Omit<Rule, "created_at" | "updated_at"> & Partial<Pick<Rule, "created_at" | "updated_at">>) => {
    const { rule: saved } = await request<{ rule: Rule }>("/api/preop/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule }),
    });
    setRules((current) => {
      const next = current.some((r) => r.id === saved.id) ? current.map((r) => (r.id === saved.id ? saved : r)) : [...current, saved];
      writeCache(next);
      return next;
    });
    return saved;
  }, []);

  const remove = useCallback(async (id: string) => {
    await request<{ ok: true }>(`/api/preop/rules?id=${id}`, { method: "DELETE" });
    setRules((current) => {
      const next = current.filter((r) => r.id !== id);
      writeCache(next);
      return next;
    });
  }, []);

  return { rules, loading, error, refresh, save, remove };
}
