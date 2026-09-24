"use client";

// Browser side of app/api/el-profesor/sync/[part]/route.ts (piste
// 2026-09-24): plain fetch() calls instead of Server Actions, so the sync,
// the settings dialog and the write-queue flush all run in parallel instead
// of waiting in Next.js's one-at-a-time Server Action queue. Every request
// is bounded by a timeout, refuses redirects (an expired session answers
// with a redirect to the login page, which must read as a failure, not as
// data) and only accepts a JSON body.
import type {
  DashboardSnapshot,
  SyncManifest,
  UserSyncData,
  ReviewHistoryDelta,
  DashboardExtras,
  DashboardNotionViewData,
  DashboardAiConfigData,
  NotionsPageSnapshot,
  ChapterContentSnapshot,
} from "./dashboard-types";
import type { PendingWrite } from "./local-db";
import type { FlushResult } from "./flush-writes";

const BASE = "/api/el-profesor/sync";
const DEFAULT_TIMEOUT_MS = 55_000;

export class SyncRequestError extends Error {}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/${path}`, { ...init, signal: controller.signal, redirect: "manual", credentials: "same-origin", cache: "no-store" });
    if (!res.ok) throw new SyncRequestError(res.type === "opaqueredirect" ? "Session expirée — reconnectez-vous." : `Erreur serveur (${res.status}).`);
    if (!res.headers.get("content-type")?.includes("application/json")) throw new SyncRequestError("Réponse inattendue du serveur.");
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof SyncRequestError) throw err;
    throw new SyncRequestError(controller.signal.aborted ? "Le serveur met trop de temps à répondre." : "Connexion impossible.");
  } finally {
    clearTimeout(timer);
  }
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export const fetchDashboardSnapshot = () => request<DashboardSnapshot>("snapshot");
export const fetchSyncManifest = () => request<SyncManifest>("manifest");
export const fetchUserSyncData = () => request<UserSyncData>("user-data");
export const fetchReviewHistory = (since: string | null) => request<ReviewHistoryDelta>(since ? `review-history?since=${encodeURIComponent(since)}` : "review-history");
export const fetchDashboardExtras = () => request<DashboardExtras>("extras");
export const fetchNotionViewData = () => request<DashboardNotionViewData>("notion-view");
export const fetchAiConfigData = (timeoutMs?: number) => request<DashboardAiConfigData | null>("ai-config", {}, timeoutMs);
export const fetchNotionsPageData = () => request<NotionsPageSnapshot | null>("notions-page");
export const fetchChapterContentBatch = (chapterIds: string[]) => postJson<Record<string, ChapterContentSnapshot>>("chapters", { chapterIds });
export const postPendingWrites = (writes: PendingWrite[]) => postJson<{ results: FlushResult[] }>("flush", { writes });
