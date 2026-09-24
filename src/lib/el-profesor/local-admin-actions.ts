"use client";

// Local-first admin write path (piste 2026-09-24 — "module 100% local",
// file d'action générique) — the first two candidates from the plan's
// staged rollout: reordering a book or a chapter, simple single-field
// mutations with essentially no cross-admin conflict risk. Mirrors
// local-review.ts's shape: apply the effect to the local cache immediately
// (so it survives a reload, not just the current render's optimistic
// state), then queue the real write for sync-queue.ts's next flush — no
// network wait, works offline, syncs silently once back online.
import { patchCachedDashboardBooks, enqueuePendingWrite, purgeCachedChapterContent } from "./local-db";
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

function renameChapterInBooks(books: Books, chapterId: string, title: string): Books {
  return books.map((book) => ({ ...book, chapters: book.chapters.map((c) => (c.id === chapterId ? { ...c, title } : c)) }));
}

export async function applyLocalRenameChapter(chapterId: string, title: string): Promise<Books | null> {
  const nextBooks = await patchCachedDashboardBooks((books) => renameChapterInBooks(books, chapterId, title));
  await enqueuePendingWrite({
    id: crypto.randomUUID(),
    kind: "adminAction",
    createdAt: new Date().toISOString(),
    payload: { action: "library.renameChapter", args: [chapterId, title] },
  });
  return nextBooks;
}

/** Mirrors applyBoardAction's "publishChapters" case exactly — flips status only for chapters that are actually draft_ready, same guard bulkPublishChapters applies server-side. */
export function publishChaptersInBooks(books: Books, chapterIds: string[]): Books {
  const ids = new Set(chapterIds);
  return books.map((book) => ({
    ...book,
    chapters: book.chapters.map((c) => (ids.has(c.id) && c.status === "draft_ready" ? { ...c, status: "published" as const } : c)),
  }));
}

export async function applyLocalBulkPublish(chapterIds: string[]): Promise<Books | null> {
  const nextBooks = await patchCachedDashboardBooks((books) => publishChaptersInBooks(books, chapterIds));
  await enqueuePendingWrite({
    id: crypto.randomUUID(),
    kind: "adminAction",
    createdAt: new Date().toISOString(),
    payload: { action: "library.bulkPublishChapters", args: [chapterIds] },
  });
  return nextBooks;
}

function removeChapterFromBooks(books: Books, chapterId: string): Books {
  return books.map((book) => ({ ...book, chapters: book.chapters.filter((c) => c.id !== chapterId) }));
}

/**
 * Deletion is only ever called after the admin has already confirmed it in a
 * dialog (see board.tsx's confirmDeleteChapter) — going local-first here
 * doesn't skip any safety step, it just stops waiting on the network once
 * that confirmation is given. A failed flush later (e.g. the chapter was
 * already gone) silently no-ops, same convention as the rest of the
 * local-first queue — the next full "Synchroniser" would restore it if it
 * turns out to still exist server-side. Also purges the deleted chapter's
 * own cached content/review state right away (piste 2026-09-24 — suite au
 * code review) — otherwise it would sit in IndexedDB, orphaned, until the
 * next full sync's prune step happened to notice it.
 */
export async function applyLocalDeleteChapter(chapterId: string): Promise<Books | null> {
  const nextBooks = await patchCachedDashboardBooks((books) => removeChapterFromBooks(books, chapterId));
  await purgeCachedChapterContent([chapterId]);
  await enqueuePendingWrite({
    id: crypto.randomUUID(),
    kind: "adminAction",
    createdAt: new Date().toISOString(),
    payload: { action: "library.deleteChapter", args: [chapterId] },
  });
  return nextBooks;
}

function removeBookFromBooks(books: Books, bookId: string): Books {
  return books.filter((b) => b.id !== bookId);
}

/** Same purge as applyLocalDeleteChapter, for every chapter the deleted book contained. */
export async function applyLocalDeleteBook(bookId: string): Promise<Books | null> {
  let removedChapterIds: string[] = [];
  const nextBooks = await patchCachedDashboardBooks((books) => {
    removedChapterIds = books.find((b) => b.id === bookId)?.chapters.map((c) => c.id) ?? [];
    return removeBookFromBooks(books, bookId);
  });
  await purgeCachedChapterContent(removedChapterIds);
  await enqueuePendingWrite({
    id: crypto.randomUUID(),
    kind: "adminAction",
    createdAt: new Date().toISOString(),
    payload: { action: "library.deleteBook", args: [bookId] },
  });
  return nextBooks;
}
