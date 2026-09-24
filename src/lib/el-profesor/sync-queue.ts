"use client";

// Automatic background flush of the local-first write queue (piste
// 2026-09-24 — "écriture locale automatique"). Every write queued by
// local-review.ts (flashcard reviews, exclusions) or the bookmark/note/
// reading-position call sites in chapter-view.tsx sits in local-db.ts's
// pendingWrites store until this replays it against the same Server Actions
// the app already called synchronously before — see sync-queue-runner.tsx
// for what triggers a flush (periodic timer, visibilitychange/pagehide, and
// the "Synchroniser" modal flushing first before it pulls fresh content).
import { getAllPendingWrites, deletePendingWrite, enqueuePendingWrite, type PendingWrite } from "./local-db";
import { submitReview, excludeFlashcardFromReviews, reincludeFlashcardInReviews } from "@/app/apps/el-profesor/actions/review";
import { setBookmark } from "@/app/apps/el-profesor/actions/bookmarks";
import { saveMyNote } from "@/app/apps/el-profesor/actions/notes";
import { recordReadingPosition } from "@/app/apps/el-profesor/actions/reading-position";

// How long a flushed "review" entry sticks around purely so undoLocalReview
// can still find its serverLogId — comfortably past any realistic reaction
// time to hit "undo" after answering a card.
const FLUSHED_REVIEW_RETENTION_MS = 5 * 60_000;

let flushing = false;

type FlushOutcome = "delete" | "keep-flushed" | "fail";

async function flushOne(write: PendingWrite): Promise<FlushOutcome> {
  switch (write.kind) {
    case "review": {
      if (write.flushed) return "keep-flushed"; // nothing left to send — see the retention cleanup below
      const { flashcardId, rating, source, durationMs, variantId, confidence } = write.payload;
      const result = await submitReview(flashcardId, rating, source, durationMs, variantId, confidence);
      if (result.error || !result.logId) return "fail";
      // Marked flushed rather than deleted — undoLocalReview needs the real
      // log id for a brief window after this (see its doc comment).
      await enqueuePendingWrite({ ...write, flushed: true, serverLogId: result.logId });
      return "keep-flushed";
    }
    case "exclude": {
      const { flashcardId, excluded } = write.payload;
      const result = excluded ? await excludeFlashcardFromReviews(flashcardId) : await reincludeFlashcardInReviews(flashcardId);
      return result.error ? "fail" : "delete";
    }
    case "bookmark": {
      const { subEntityId, bookmarked } = write.payload;
      const result = await setBookmark(subEntityId, bookmarked);
      return result.error ? "fail" : "delete";
    }
    case "note": {
      const { subEntityId, content } = write.payload;
      const result = await saveMyNote(subEntityId, content);
      return result.error ? "fail" : "delete";
    }
    case "readingPosition": {
      const { chapterId, subEntityId } = write.payload;
      await recordReadingPosition(chapterId, subEntityId);
      return "delete"; // fire-and-forget by design, see that action's doc comment
    }
  }
}

/**
 * Replays every queued write in order, stopping at the first failure (kept
 * in place for the next flush attempt — never skipped, so a later write for
 * the same flashcard/note/bookmark can't jump ahead of an earlier one on a
 * retry). Also garbage-collects "review" entries that were flushed a while
 * ago and are just past their undo grace period. Safe to call concurrently
 * (e.g. the periodic timer and a manual sync overlapping) — a flush already
 * in progress is a no-op.
 */
export async function flushPendingWrites(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const writes = await getAllPendingWrites();
    const now = Date.now();
    for (const write of writes) {
      if (write.kind === "review" && write.flushed) {
        if (now - new Date(write.createdAt).getTime() > FLUSHED_REVIEW_RETENTION_MS) await deletePendingWrite(write.id);
        continue;
      }
      const outcome = await flushOne(write);
      if (outcome === "fail") break;
      if (outcome === "delete") await deletePendingWrite(write.id);
    }
  } finally {
    flushing = false;
  }
}
