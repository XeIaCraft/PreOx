"use client";

// Local-first versions of the user's small everyday writes (piste
// 2026-09-24 — suite au retour "ce que je fais en local ne s'actualise
// qu'après synchronisation"). Each one does two things, always both:
//   1. patches the local cache the screens read from, so the change is
//      visible everywhere at once (chapter view, dashboard widgets, counts);
//   2. queues the real write for the background flush (sync-queue.ts).
// Patching only the queue was the old approach for some of these, and it
// broke as soon as the write was delivered: it left the queue, and the
// screens went back to showing the value from the last sync.
import {
  enqueuePendingWrite,
  patchCachedFicheReadProgress,
  setCachedFicheReadProgress,
  patchCachedUserBookmark,
  patchCachedBookmarkTags,
  patchCachedNote,
  patchCachedBlockReviewState,
  patchCachedSuspendedFlashcardId,
  deleteCachedReviewStates,
} from "./local-db";
import { nextBlockReviewState } from "./local-widgets";
import type { BlockReviewState } from "./dal";

function adminAction(id: string, action: string, args: unknown[]) {
  return enqueuePendingWrite({ id, kind: "adminAction", createdAt: new Date().toISOString(), payload: { action, args } });
}

/** Highest scroll % reached in a fiche. One queued write per fiche (same id), so scrolling only ever keeps the latest value waiting. */
export async function saveFicheReadProgressLocally(chapterId: string, ficheId: string, progressPct: number): Promise<void> {
  await patchCachedFicheReadProgress(chapterId, ficheId, progressPct);
  await adminAction(`readProgress:${ficheId}`, "progress.saveFicheRead", [ficheId, progressPct]);
}

/** Explicit reset — replaces any still-queued progress for the same fiche (same id). */
export async function resetFicheReadProgressLocally(chapterId: string, ficheId: string): Promise<void> {
  await setCachedFicheReadProgress(chapterId, ficheId, 0);
  await adminAction(`readProgress:${ficheId}`, "progress.resetFicheRead", [ficheId]);
}

/** The fiche's cards become "new" again locally, then server-side once delivered (resetFicheMastery). Reviews queued before this still replay first. */
export async function resetFicheMasteryLocally(ficheId: string, flashcardIds: string[]): Promise<void> {
  await deleteCachedReviewStates(flashcardIds);
  await adminAction(`masteryReset:${ficheId}:${Date.now()}`, "progress.resetFicheMastery", [ficheId]);
}

/** "bookmarked" is the desired end state, keyed by sub-entity — a second click before delivery replaces the queued state instead of double-flipping. */
export async function setBookmarkLocally(subEntityId: string, bookmarked: boolean): Promise<void> {
  await patchCachedUserBookmark(subEntityId, bookmarked);
  await enqueuePendingWrite({ id: `bookmark:${subEntityId}`, kind: "bookmark", createdAt: new Date().toISOString(), payload: { subEntityId, bookmarked } });
}

export async function setBookmarkTagsLocally(subEntityId: string, tags: string[]): Promise<void> {
  await patchCachedBookmarkTags(subEntityId, tags);
  await adminAction(`bookmarkTags:${subEntityId}`, "bookmarks.setTags", [subEntityId, tags]);
}

/** Keyed by sub-entity: retyping before delivery just replaces the queued content. */
export async function saveNoteLocally(subEntityId: string, content: string): Promise<void> {
  await patchCachedNote(subEntityId, { content });
  await enqueuePendingWrite({ id: `note:${subEntityId}`, kind: "note", createdAt: new Date().toISOString(), payload: { subEntityId, content } });
}

/** "Je m'en souviens" / "à revoir" on a block — the next schedule is computed with the same formula the server applies, so it shows immediately. */
export async function markBlockReviewedLocally(blockId: string, remembered: boolean, existing: BlockReviewState | null): Promise<BlockReviewState> {
  const next = nextBlockReviewState(existing, remembered, Date.now());
  await patchCachedBlockReviewState(blockId, next);
  await adminAction(crypto.randomUUID(), "blockReview.mark", [blockId, remembered]);
  return next;
}

/** Excludes a card from (or puts it back into) this user's own reviews. */
export async function setFlashcardExcludedLocally(flashcardId: string, excluded: boolean): Promise<void> {
  await patchCachedSuspendedFlashcardId(flashcardId, excluded);
  await enqueuePendingWrite({ id: crypto.randomUUID(), kind: "exclude", createdAt: new Date().toISOString(), payload: { flashcardId, excluded } });
}
