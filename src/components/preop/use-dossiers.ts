"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SecureStore } from "@/lib/preop/secure-store";
import type { SealedBackup } from "@/lib/preop/crypto";
import type { Dossier } from "@/lib/preop/dossier";

// Patient dossiers, encrypted on this device (secure-store.ts). Edits show
// at once and are written shortly after (debounced per dossier), so typing
// in the theatre never waits on encryption.

const SAVE_DELAY_MS = 400;

export function useDossiers(userId: string) {
  const store = useMemo(() => new SecureStore(userId), [userId]);
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, Dossier>());

  const reload = useCallback(async () => {
    try {
      setDossiers(await store.list());
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stockage local indisponible.");
      setStatus("error");
    }
  }, [store]);

  useEffect(() => {
    const t = setTimeout(() => void reload(), 0);
    return () => clearTimeout(t);
  }, [reload]);

  const flush = useCallback(
    async (id: string) => {
      const d = pending.current.get(id);
      pending.current.delete(id);
      timers.current.delete(id);
      if (!d) return;
      try {
        await store.save(d);
      } catch (err) {
        setError(err instanceof Error ? `Enregistrement local impossible : ${err.message}` : "Enregistrement local impossible.");
      }
    },
    [store]
  );

  // Nothing typed is lost when the page is left right after an edit.
  useEffect(() => {
    const flushAll = () => {
      for (const id of [...pending.current.keys()]) void flush(id);
    };
    window.addEventListener("pagehide", flushAll);
    const onVisibility = () => document.visibilityState === "hidden" && flushAll();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushAll);
      document.removeEventListener("visibilitychange", onVisibility);
      flushAll();
    };
  }, [flush]);

  const put = useCallback(
    (dossier: Dossier, immediate = false) => {
      const next = { ...dossier, updatedAt: new Date().toISOString() };
      setDossiers((current) => (current.some((d) => d.id === next.id) ? current.map((d) => (d.id === next.id ? next : d)) : [next, ...current]));
      pending.current.set(next.id, next);
      const existing = timers.current.get(next.id);
      if (existing) clearTimeout(existing);
      if (immediate) return flush(next.id);
      timers.current.set(
        next.id,
        setTimeout(() => void flush(next.id), SAVE_DELAY_MS)
      );
      return Promise.resolve();
    },
    [flush]
  );

  const remove = useCallback(
    async (id: string) => {
      const t = timers.current.get(id);
      if (t) clearTimeout(t);
      timers.current.delete(id);
      pending.current.delete(id);
      await store.remove(id);
      setDossiers((current) => current.filter((d) => d.id !== id));
    },
    [store]
  );

  const exportBackup = useCallback(
    async (passphrase: string): Promise<SealedBackup> => {
      await Promise.all([...pending.current.keys()].map((id) => flush(id)));
      return store.exportBackup(passphrase);
    },
    [store, flush]
  );

  const importBackup = useCallback(
    async (backup: SealedBackup, passphrase: string) => {
      const result = await store.importBackup(backup, passphrase);
      await reload();
      return result;
    },
    [store, reload]
  );

  return { dossiers, status, error, put, remove, exportBackup, importBackup };
}
