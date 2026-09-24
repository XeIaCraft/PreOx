"use client";

// Local-first store of the "Carnet de stage" (same lessons as El Profesor,
// applied from day one): the whole carnet lives on the device (IndexedDB),
// every screen reads it synchronously, and every change is applied locally
// at once then queued and delivered in the background — logging a case
// between two patients never waits on the network, and works in an
// operating room without signal. The server snapshot is refreshed on open,
// when the tab comes back into view and after each delivery.
//
// Displayed data = last server snapshot + still-queued changes on top
// (applyMutations), so a refresh can never make a pending change vanish,
// and a change the server refuses for good disappears with a visible notice
// instead of blocking the queue.
import { applyMutations, applyMutation } from "./logic";
import { emptyCarnetData, type CarnetData, type CarnetMutation, type CarnetMutationResult } from "./types";

const DB_NAME = "preox-carnet";
const STORE = "kv";
const FLUSH_DEBOUNCE_MS = 1200;
const BATCH = 50;
const REFRESH_WHEN_VISIBLE_AFTER_MS = 60_000;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise<T | null>((resolve) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  } finally {
    db.close();
  }
}

async function idbSet(entries: [string, unknown][]): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        for (const [key, value] of entries) tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } finally {
    db.close();
  }
}

export interface CarnetStatus {
  /** Local copy read (from IndexedDB or the first server load) — screens can render. */
  ready: boolean;
  syncing: boolean;
  online: boolean;
  lastSyncedAt: string | null;
  /** Local changes not yet acknowledged by the server. */
  pending: number;
  /** Last delivery/refresh problem, if the latest attempt failed. */
  error: string | null;
  /** Changes the server refused for good (shown once, then dismissed). */
  rejected: string[];
}

export interface CarnetState {
  data: CarnetData;
  status: CarnetStatus;
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal, redirect: "manual", credentials: "same-origin", cache: "no-store" });
    if (!res.ok) throw new Error(res.type === "opaqueredirect" ? "Session expirée — reconnectez-vous." : `Erreur serveur (${res.status}).`);
    if (!res.headers.get("content-type")?.includes("application/json")) throw new Error("Réponse inattendue du serveur.");
    return (await res.json()) as T;
  } catch (err) {
    if (controller.signal.aborted) throw new Error("Le serveur met trop de temps à répondre.");
    if (err instanceof TypeError) throw new Error("Hors ligne — vos saisies sont gardées sur l'appareil.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export class CarnetStore {
  private base: CarnetData = emptyCarnetData();
  private queue: CarnetMutation[] = [];
  private state: CarnetState;
  private listeners = new Set<() => void>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing: Promise<void> | null = null;
  private lastRefreshAt = 0;
  private readonly keys: { base: string; queue: string; syncedAt: string };

  constructor(userId: string) {
    this.keys = { base: `${userId}:base`, queue: `${userId}:queue`, syncedAt: `${userId}:syncedAt` };
    this.state = {
      data: emptyCarnetData(),
      // online starts true on both server and client (no hydration mismatch); the provider corrects it on mount.
      status: { ready: false, syncing: false, online: true, lastSyncedAt: null, pending: 0, error: null, rejected: [] },
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): CarnetState => this.state;

  private emit(status: Partial<CarnetStatus> = {}) {
    this.state = { data: applyMutations(this.base, this.queue), status: { ...this.state.status, ...status, pending: this.queue.length } };
    for (const listener of this.listeners) listener();
  }

  private persist(): Promise<void> {
    return idbSet([
      [this.keys.base, this.base],
      [this.keys.queue, this.queue],
    ]);
  }

  /** Reads the local copy, then syncs with the server in the background. */
  async init(): Promise<void> {
    const [base, queue, syncedAt] = await Promise.all([
      idbGet<CarnetData>(this.keys.base),
      idbGet<CarnetMutation[]>(this.keys.queue),
      idbGet<string>(this.keys.syncedAt),
    ]);
    this.base = { ...emptyCarnetData(), ...(base ?? {}) };
    this.queue = queue ?? [];
    this.emit({ ready: base !== null, lastSyncedAt: syncedAt });
    await this.sync();
    if (!this.state.status.ready) this.emit({ ready: true });
  }

  /** Applies changes locally right away and queues them for delivery. */
  commit(mutations: CarnetMutation[]): void {
    if (mutations.length === 0) return;
    this.queue = [...this.queue, ...mutations];
    this.emit();
    void this.persist();
    this.scheduleFlush();
  }

  dismissRejected(): void {
    this.emit({ rejected: [] });
  }

  private scheduleFlush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.sync();
    }, FLUSH_DEBOUNCE_MS);
  }

  /** Delivers queued changes then refreshes the server snapshot. Calls made while one is running share it. */
  sync(): Promise<void> {
    if (!this.flushing) this.flushing = this.runSync().finally(() => (this.flushing = null));
    return this.flushing;
  }

  refreshIfStale(): void {
    if (Date.now() - this.lastRefreshAt > REFRESH_WHEN_VISIBLE_AFTER_MS || this.queue.length > 0) void this.sync();
  }

  setOnline(online: boolean): void {
    this.emit({ online });
    if (online) void this.sync();
  }

  private async runSync(): Promise<void> {
    this.emit({ syncing: true });
    const rejected: string[] = [];
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.slice(0, BATCH);
        const { results } = await requestJson<{ results: CarnetMutationResult[] }>("/api/carnet/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mutations: batch }),
        });
        const done = new Set<string>();
        let stop = results.length < batch.length;
        for (const result of results) {
          const mutation = batch.find((m) => m.id === result.id);
          if (!mutation) continue;
          if (result.ok) {
            this.base = applyMutation(this.base, mutation);
            done.add(result.id);
          } else if (!result.retryable) {
            rejected.push(result.error ?? "Modification refusée par le serveur.");
            done.add(result.id);
          } else {
            stop = true;
          }
        }
        this.queue = this.queue.filter((m) => !done.has(m.id));
        await this.persist();
        this.emit();
        if (stop) throw new Error(results.find((r) => !r.ok && r.retryable)?.error ?? "Envoi interrompu — nouvel essai automatique.");
      }

      const fresh = await requestJson<CarnetData>("/api/carnet/sync");
      this.base = { ...emptyCarnetData(), ...fresh };
      this.lastRefreshAt = Date.now();
      const syncedAt = new Date().toISOString();
      await Promise.all([this.persist(), idbSet([[this.keys.syncedAt, syncedAt]])]);
      this.emit({ syncing: false, error: null, lastSyncedAt: syncedAt, ready: true, rejected: [...this.state.status.rejected, ...rejected] });
    } catch (err) {
      this.emit({ syncing: false, error: err instanceof Error ? err.message : "Synchronisation impossible.", rejected: [...this.state.status.rejected, ...rejected] });
    }
  }
}
