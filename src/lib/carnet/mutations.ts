"use client";

// Builders for queued local changes (see store.ts) — every screen goes
// through these rather than constructing CarnetMutation objects by hand.
import type { CarnetCollection, CarnetMutation, CarnetProfile, CarnetRow } from "./types";

export function newId(): string {
  return crypto.randomUUID();
}

function meta() {
  return { id: newId(), createdAt: new Date().toISOString() };
}

export function putRow<C extends CarnetCollection>(collection: C, row: CarnetRow<C>): CarnetMutation {
  return { ...meta(), collection, op: "put", row: row as unknown as { id: string } & Record<string, unknown> };
}

export function patchRow<C extends CarnetCollection>(collection: C, rowId: string, patch: Partial<CarnetRow<C>>): CarnetMutation {
  return { ...meta(), collection, op: "patch", rowId, patch: patch as Record<string, unknown> };
}

export function deleteRow(collection: CarnetCollection, rowId: string): CarnetMutation {
  return { ...meta(), collection, op: "delete", rowId };
}

export function putProfile(row: CarnetProfile): CarnetMutation {
  return { ...meta(), collection: "profile", op: "put", row };
}
