"use client";

// Shared by the rule and protocol libraries: a copy kept on the device
// (instant display, works offline) and plain same-origin fetches.

export function readCache<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

export function writeCache<T>(key: string, items: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Storage full or blocked: the library still works online.
  }
}

export async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, { ...init, redirect: "manual", credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new Error("Hors ligne — réessayez une fois connecté.");
  }
  if (res.type === "opaqueredirect") throw new Error("Session expirée — reconnectez-vous.");
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? `Erreur serveur (${res.status}).`);
  return body;
}
