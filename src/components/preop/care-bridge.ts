"use client";

import { useEffect, useRef } from "react";
import type { Catalogs } from "@/lib/preop/catalog";
import { CARE_DONE, CARE_READY, dossierFromCare, findCareDossier, isCarePayload, type CarePayload } from "@/lib/preop/care-import";
import type { Dossier } from "@/lib/preop/dossier";

/** Only the EasyPM extension's side panel (an extension page) may hand a consultation over. */
export function isExtensionOrigin(origin: string): boolean {
  return /^(chrome-extension|extension|moz-extension):\/\/[a-z0-9-]+$/i.test(origin);
}

/**
 * Embedded in EasyPM's side panel next to CARE: receives the consultation read
 * in CARE (window.postMessage from the parent page) and files it in the
 * matching dossier — new, or completed without overwriting anything.
 */
export function useCareBridge(
  enabled: boolean,
  store: { dossiers: Dossier[]; status: "loading" | "ready" | "error"; put: (d: Dossier, now?: boolean) => Promise<unknown> },
  catalogs: Catalogs,
  onImported: (d: Dossier, created: boolean) => void
) {
  // The consultation waits here while the dossiers are still being read from the device.
  const pending = useRef<{ payload: CarePayload; reply: (m: unknown) => void } | null>(null);
  const latest = useRef({ store, catalogs, onImported });
  useEffect(() => {
    latest.current = { store, catalogs, onImported };
  });

  const file = useRef(() => {
    const { store: s, catalogs: cats, onImported: done } = latest.current;
    if (!pending.current || s.status !== "ready") return;
    const { payload, reply } = pending.current;
    pending.current = null;
    const existing = findCareDossier(s.dossiers, payload);
    const d = dossierFromCare(payload, cats, existing);
    void s.put(d, true).then(
      () => {
        reply({ type: CARE_DONE, ok: true, created: !existing, initials: d.initials });
        done(d, !existing);
      },
      (err: unknown) => reply({ type: CARE_DONE, ok: false, error: err instanceof Error ? err.message : "Enregistrement impossible." })
    );
  });

  useEffect(() => {
    if (!enabled || window.parent === window) return;
    function onMessage(e: MessageEvent) {
      if (e.source !== window.parent || !isExtensionOrigin(e.origin) || !isCarePayload(e.data)) return;
      const origin = e.origin;
      pending.current = { payload: e.data, reply: (m) => window.parent.postMessage(m, origin) };
      file.current();
    }
    window.addEventListener("message", onMessage);
    // Nothing in it: only « ready to receive ».
    window.parent.postMessage({ type: CARE_READY }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, [enabled]);

  // Dossiers loaded after the message came: file it now.
  useEffect(() => {
    if (store.status === "ready") file.current();
  }, [store.status]);
}
