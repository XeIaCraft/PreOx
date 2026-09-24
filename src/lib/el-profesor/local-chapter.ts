"use client";

// One chapter's cached content, with this user's CURRENT per-entity data
// laid over it (piste 2026-09-24 — "widgets en local"): each chapter
// snapshot carries its own copy of the user's bookmarks, block re-read
// schedule and per-fiche mastery, frozen at the moment that chapter's
// content was last downloaded — and the delta sync only re-downloads a
// chapter when its content changes. The user-level caches (refreshed by
// every sync, patched by every local write) and the review states are the
// current truth, so they win whenever they exist.
import {
  getCachedChapterContent,
  getCachedUserBookmarks,
  getCachedBlockReviewStates,
  getAllCachedReviewStates,
  getAllPendingWrites,
} from "./local-db";
import { applyPendingBookmarkWrites } from "./local-widgets";
import type { MasteryProgress, SubEntityWithFiche } from "./dal";
import type { ReviewState } from "./types";
import type { ChapterContentSnapshot } from "./dashboard-types";

/** Mirrors getFicheMasteryProgressBatch (dal/progress.ts): every published flashcard of each fiche, bucketed by this user's review state. */
export function computeFicheMasteryProgress(subEntities: SubEntityWithFiche[], reviewStates: Map<string, ReviewState>): Record<string, MasteryProgress> {
  const result: Record<string, MasteryProgress> = {};
  for (const sub of subEntities) {
    if (!sub.fiche) continue;
    const entry: MasteryProgress = { total: 0, acquired: 0, learning: 0 };
    for (const card of sub.fiche.flashcards) {
      entry.total++;
      const state = reviewStates.get(card.id)?.state;
      if (state === "review") entry.acquired++;
      else if (state === "learning" || state === "relearning") entry.learning++;
    }
    result[sub.fiche.id] = entry;
  }
  return result;
}

/** Null when this chapter isn't cached — the caller falls back to the server. */
export async function loadLocalChapterSnapshot(chapterId: string): Promise<ChapterContentSnapshot | null> {
  const [cached, bookmarks, blockReviewStates, reviewStates, pending] = await Promise.all([
    getCachedChapterContent(chapterId),
    getCachedUserBookmarks(),
    getCachedBlockReviewStates(),
    getAllCachedReviewStates(),
    getAllPendingWrites(),
  ]);
  if (!cached) return null;

  const baseBookmarks = bookmarks ?? cached.bookmarkedIds.map((subEntityId) => ({ subEntityId, tags: [], createdAt: "" }));
  return {
    ...cached,
    bookmarkedIds: applyPendingBookmarkWrites(baseBookmarks, pending).map((b) => b.subEntityId),
    blockReviewStates: blockReviewStates ?? cached.blockReviewStates,
    ficheMasteryProgress: reviewStates.size > 0 ? computeFicheMasteryProgress(cached.subEntities, reviewStates) : cached.ficheMasteryProgress,
  };
}
