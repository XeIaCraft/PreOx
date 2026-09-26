"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Protocol } from "@/lib/preop/protocols";
import { protocolUpdates, signedReference } from "@/lib/preop/reference-sync";
import { readCache, request, writeCache } from "./api";

// Protocol library: same model as the rules (device copy first, then the
// server's; saving needs the network).

const CACHE_KEY = "preox:preop:protocols";

export type ProtocolInput = Omit<Protocol, "created_at" | "updated_at">;

export function useProtocols() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Reference protocols brought up to date by themselves at this visit. */
  const [autoUpdated, setAutoUpdated] = useState<string[]>([]);
  const synced = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const { protocols: fresh } = await request<{ protocols: Protocol[] }>("/api/preop/protocols");
      setProtocols(fresh);
      writeCache(CACHE_KEY, fresh);
      setError(null);
      // Once per visit: the reference protocols you have not changed follow the new version by themselves.
      if (!synced.current) {
        synced.current = true;
        const updated: string[] = [];
        for (const u of protocolUpdates(fresh).filter((x) => !x.modified)) {
          try {
            const { protocol: saved } = await request<{ protocol: Protocol }>("/api/preop/protocols", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ protocol: signedReference(u.reference) }),
            });
            if (u.current.content && JSON.stringify(u.current.content) !== JSON.stringify(saved.content)) updated.push(saved.name);
            setProtocols((current) => {
              const next = current.map((p) => (p.id === saved.id ? saved : p));
              writeCache(CACHE_KEY, next);
              return next;
            });
          } catch {
            break; // offline or refused: next visit
          }
        }
        if (updated.length) setAutoUpdated(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = readCache<Protocol>(CACHE_KEY);
    const timer = setTimeout(() => {
      if (cached.length > 0) setProtocols(cached);
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const save = useCallback(async (protocol: ProtocolInput) => {
    const { protocol: saved } = await request<{ protocol: Protocol }>("/api/preop/protocols", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ protocol }),
    });
    setProtocols((current) => {
      const next = (current.some((p) => p.id === saved.id) ? current.map((p) => (p.id === saved.id ? saved : p)) : [...current, saved]).sort((a, b) => a.name.localeCompare(b.name, "fr"));
      writeCache(CACHE_KEY, next);
      return next;
    });
    return saved;
  }, []);

  const remove = useCallback(async (id: string) => {
    await request<{ ok: true }>(`/api/preop/protocols?id=${id}`, { method: "DELETE" });
    setProtocols((current) => {
      const next = current.filter((p) => p.id !== id);
      writeCache(CACHE_KEY, next);
      return next;
    });
  }, []);

  return { protocols, loading, error, save, remove, autoUpdated };
}
