"use client";

// Encrypted local store of patient dossiers (IndexedDB). Each dossier is
// sealed with the device key (crypto.ts) before being written; the key
// itself is a non-extractable CryptoKey kept in the same database, per
// user. Nothing here ever goes to the server — a device change or loss is
// covered by the passphrase-protected backup file.

import { generateDeviceKey, seal, sealBackup, unseal, unsealBackup, type Sealed, type SealedBackup } from "./crypto";
import { upgradeDossier, type Dossier } from "./dossier";

const DB_NAME = "preox-preop";
const DB_VERSION = 1;
const KEYS = "keys";
const DOSSIERS = "dossiers";

interface StoredDossier {
  /** `${userId}:${dossierId}` */
  key: string;
  userId: string;
  sealed: Sealed;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEYS)) db.createObjectStore(KEYS);
      if (!db.objectStoreNames.contains(DOSSIERS)) db.createObjectStore(DOSSIERS, { keyPath: "key" }).createIndex("userId", "userId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Stockage local indisponible."));
  });
}

function run<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class SecureStore {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private keyPromise: Promise<CryptoKey> | null = null;

  constructor(private userId: string) {}

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) this.dbPromise = openDb();
    return this.dbPromise;
  }

  /** The device key of this user, created on first use. */
  private key(): Promise<CryptoKey> {
    if (!this.keyPromise) {
      this.keyPromise = (async () => {
        const db = await this.db();
        const existing = await run<CryptoKey | undefined>(db, KEYS, "readonly", (s) => s.get(this.userId) as IDBRequest<CryptoKey | undefined>);
        if (existing) return existing;
        const key = await generateDeviceKey();
        await run(db, KEYS, "readwrite", (s) => s.put(key, this.userId));
        return key;
      })();
    }
    return this.keyPromise;
  }

  async list(): Promise<Dossier[]> {
    const db = await this.db();
    const key = await this.key();
    const rows = await run<StoredDossier[]>(db, DOSSIERS, "readonly", (s) => s.index("userId").getAll(this.userId) as IDBRequest<StoredDossier[]>);
    const out: Dossier[] = [];
    for (const row of rows) {
      try {
        out.push(upgradeDossier(await unseal<Dossier>(key, row.sealed)));
      } catch {
        // Sealed with a key this device doesn't have (should not happen): skipped rather than crashing the list.
      }
    }
    return out;
  }

  async save(dossier: Dossier): Promise<void> {
    const db = await this.db();
    const sealed = await seal(await this.key(), dossier);
    const row: StoredDossier = { key: `${this.userId}:${dossier.id}`, userId: this.userId, sealed };
    await run(db, DOSSIERS, "readwrite", (s) => s.put(row));
  }

  async remove(id: string): Promise<void> {
    const db = await this.db();
    await run(db, DOSSIERS, "readwrite", (s) => s.delete(`${this.userId}:${id}`));
  }

  /** Every dossier, re-encrypted with a passphrase — to keep a copy or move to another device. */
  async exportBackup(passphrase: string): Promise<SealedBackup> {
    return sealBackup(passphrase, await this.list());
  }

  /** Restores a backup: dossiers missing here are added, those present are kept in their most recent version. */
  async importBackup(backup: SealedBackup, passphrase: string): Promise<{ added: number; updated: number }> {
    const incoming = await unsealBackup<Dossier[]>(passphrase, backup);
    const current = new Map((await this.list()).map((d) => [d.id, d]));
    let added = 0;
    let updated = 0;
    for (const raw of incoming) {
      const d = upgradeDossier(raw);
      const mine = current.get(d.id);
      if (!mine) added++;
      else if (d.updatedAt > mine.updatedAt) updated++;
      else continue;
      await this.save(d);
    }
    return { added, updated };
  }
}
