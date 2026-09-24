"use client";

// Local-first admin write path (piste 2026-09-24 — "module 100% local",
// file d'action générique) — the first two candidates from the plan's
// staged rollout: reordering a book or a chapter, simple single-field
// mutations with essentially no cross-admin conflict risk. Mirrors
// local-review.ts's shape: apply the effect to the local cache immediately
// (so it survives a reload, not just the current render's optimistic
// state), then queue the real write for sync-queue.ts's next flush — no
// network wait, works offline, syncs silently once back online.
import { patchCachedDashboardBooks, enqueuePendingWrite } from "./local-db";
import type { DashboardSnapshot } from "./dashboard-types";

type Books = DashboardSnapshot["books"];

/** Pure swap-by-id logic — shared with board.tsx's applyBoardAction (the transient useOptimistic reducer for the current render), so the local-first version and the instant-feedback version can never compute a different order. */
export function swapBookOrder(books: Books, bookId: string, direction: "up" | "down"): Books {
  const index = books.findIndex((b) => b.id === bookId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= books.length) return books;
  const next = [...books];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

export function swapChapterOrder(books: Books, chapterId: string, direction: "up" | "down"): Books {
  const bookIndex = books.findIndex((b) => b.chapters.some((c) => c.id === chapterId));
  if (bookIndex === -1) return books;
  const book = books[bookIndex];
  const chapterIndex = book.chapters.findIndex((c) => c.id === chapterId);
  const targetIndex = direction === "up" ? chapterIndex - 1 : chapterIndex + 1;
  if (targetIndex < 0 || targetIndex >= book.chapters.length) return books;
  const nextChapters = [...book.chapters];
  [nextChapters[chapterIndex], nextChapters[targetIndex]] = [nextChapters[targetIndex], nextChapters[chapterIndex]];
  const nextBooks = [...books];
  nextBooks[bookIndex] = { ...book, chapters: nextChapters };
  return nextBooks;
}

/** Returns the patched books array (for the caller to also push into whatever React state renders it — see ElProfesorBoard's onLocalBooksChange), or null if there's nothing cached to patch (e.g. never synced) — the queued write still goes out either way, but there's no local list to keep in sync with. */
export async function applyLocalMoveBook(bookId: string, direction: "up" | "down"): Promise<Books | null> {
  const nextBooks = await patchCachedDashboardBooks((books) => swapBookOrder(books, bookId, direction));
  await enqueuePendingWrite({
    id: crypto.randomUUID(),
    kind: "adminAction",
    createdAt: new Date().toISOString(),
    payload: { action: "library.moveBook", args: [bookId, direction] },
  });
  return nextBooks;
}

export async function applyLocalMoveChapter(chapterId: string, direction: "up" | "down"): Promise<Books | null> {
  const nextBooks = await patchCachedDashboardBooks((books) => swapChapterOrder(books, chapterId, direction));
  await enqueuePendingWrite({
    id: crypto.randomUUID(),
    kind: "adminAction",
    createdAt: new Date().toISOString(),
    payload: { action: "library.moveChapter", args: [chapterId, direction] },
  });
  return nextBooks;
}
