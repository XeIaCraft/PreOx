"use client";

// Automatic background flush of the local-first write queue (piste
// 2026-09-24 — "écriture locale automatique"). Every write queued locally
// (flashcard reviews, exclusions, bookmarks, notes, reading position, read
// progress, block re-reads, admin reorder/rename/publish…) sits in
// local-db.ts's pendingWrites store until this delivers it — see
// sync-queue-runner.tsx for what triggers a flush (periodic timer,
// visibilitychange/pagehide) and the "Synchroniser" modal, which flushes
// first before it pulls fresh data.
//
// Writes go out in batches, one plain POST per batch to the sync route
// handler (flush-writes.ts replays them server-side, in order) — no longer
// one Server Action per write: those ran strictly one at a time and each
// re-rendered the current page, so a review session's worth of answers
// could keep every other action (a sync, the settings dialog…) waiting for
// minutes.
import {
  getAllPendingWrites,
  getPendingWrite,
  deletePendingWrite,
  enqueuePendingWrite,
  markLocalReviewEventFlushed,
  deleteLocalReviewEvent,
  type PendingWrite,
} from "./local-db";
import { postPendingWrites } from "./sync-api";
import { undoReview } from "@/app/apps/el-profesor/actions/review";
import type { FlushResult } from "./flush-writes";

// How long a flushed "review" entry sticks around purely so undoLocalReview
// can still find its serverLogId — comfortably past any realistic reaction
// time to hit "undo" after answering a card.
const FLUSHED_REVIEW_RETENTION_MS = 5 * 60_000;
// Same bound as MAX_WRITES_PER_FLUSH in flush-writes.ts (server-only, so not importable here).
const BATCH_SIZE = 25;

let inFlight: Promise<void> | null = null;

/**
 * Delivers every queued write in order, stopping at the first failure (kept
 * in place for the next attempt — never skipped, so a later write for the
 * same card/note/bookmark can't overtake an earlier one on a retry). Also
 * garbage-collects "review" entries flushed a while ago. Calls made while a
 * flush is already running share that same flush.
 */
export function flushPendingWrites(): Promise<void> {
  if (!inFlight) inFlight = runFlush().finally(() => (inFlight = null));
  return inFlight;
}

/** For "Synchroniser" and the cache reset: waits for a flush already in progress, then runs one more full pass for anything queued while it was in flight. */
export async function flushAllPendingWrites(): Promise<void> {
  if (inFlight) await inFlight.catch(() => {});
  await flushPendingWrites().catch(() => {});
}

/** Writes still waiting to reach the server (a flushed review kept only for "undo" doesn't count). */
export async function countUnsentPendingWrites(): Promise<number> {
  const writes = await getAllPendingWrites();
  return writes.filter((w) => !(w.kind === "review" && w.flushed)).length;
}

async function runFlush(): Promise<void> {
  try {
    await deliverQueue();
  } catch (err) {
    // Never rejects: the runner fires this from timers and page events with nobody awaiting it — whatever didn't go out stays queued for next time.
    console.error("[el-profesor/sync-queue] flush failed:", err);
  }
}

async function deliverQueue(): Promise<void> {
  const writes = await getAllPendingWrites();
  const now = Date.now();
  const toSend: PendingWrite[] = [];
  for (const write of writes) {
    if (write.kind === "review" && write.flushed) {
      if (now - new Date(write.createdAt).getTime() > FLUSHED_REVIEW_RETENTION_MS) await deletePendingWrite(write.id);
      continue;
    }
    toSend.push(write);
  }

  for (let i = 0; i < toSend.length; i += BATCH_SIZE) {
    const batch = toSend.slice(i, i + BATCH_SIZE);
    let results: FlushResult[];
    try {
      ({ results } = await postPendingWrites(batch));
    } catch {
      return; // offline, session expired, server unavailable — everything stays queued for the next attempt
    }
    const sentById = new Map(batch.map((w) => [w.id, w]));
    for (const result of results) {
      const sent = sentById.get(result.id);
      if (sent) await applyFlushResult(sent, result);
    }
    if (results.length < batch.length || results.some((r) => r.outcome === "fail")) return;
  }
}

async function applyFlushResult(sent: PendingWrite, result: FlushResult): Promise<void> {
  const current = await getPendingWrite(sent.id);
  if (sent.kind === "review") {
    if (result.outcome === "keep-flushed" && result.serverLogId) {
      if (!current) {
        // Undone on this device while the request was in flight — the
        // server recorded it anyway, so undo it there too.
        await undoReview(sent.payload.flashcardId, result.serverLogId, sent.payload.source, sent.payload.previousState).catch(() => {});
        return;
      }
      // Kept (marked flushed) rather than deleted — undoLocalReview needs
      // the real log id for a brief window after this.
      await enqueuePendingWrite({ ...sent, flushed: true, serverLogId: result.serverLogId });
      await markLocalReviewEventFlushed(sent.id, new Date().toISOString());
    } else if (result.outcome === "delete") {
      // Dropped server-side (its card no longer exists) — it will never be
      // in the review history, so stop counting it locally too.
      await deletePendingWrite(sent.id);
      await deleteLocalReviewEvent(sent.id);
    }
    return;
  }
  // Every other kind reuses one stable id per target (note:<id>,
  // bookmark:<id>, readProgress:<id>, readingPosition…) so a newer value
  // replaces a still-queued older one. If that happened while this batch
  // was in flight, the newer version is still waiting to be sent: only
  // delete the exact version the server just acknowledged.
  if (result.outcome === "delete" && current && current.createdAt === sent.createdAt) await deletePendingWrite(sent.id);
}
