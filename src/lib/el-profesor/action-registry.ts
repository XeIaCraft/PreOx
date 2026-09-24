import "server-only";

// Dispatch table for the generic "adminAction" pending-write kind (piste
// 2026-09-24 — "module 100% local", file d'action générique). The write
// queue's flush (flush-writes.ts, reached through the sync route handler)
// looks up a queued action's name here and calls the real Server Action
// with its recorded args — no Server Action is reimplemented, only
// referenced, so the actual mutation logic (and its own permission check)
// stays exactly where it already lives.
//
// Registering a new action for local-first use is: (1) add it here, (2)
// call enqueuePendingWrite({ kind: "adminAction", payload: { action:
// "<name>", args: [...] } }) — no new Payload interface or PendingWrite
// union member needed, unlike the five write kinds with bespoke local-read
// integration (review/bookmark/note/readingPosition/exclude). Despite the
// historical name, entries aren't necessarily admin-only: each action
// enforces its own access rules.
import { moveBook, moveChapter, renameChapter, deleteChapter, deleteBook } from "@/app/apps/el-profesor/actions/library";
import { bulkPublishChapters } from "@/app/apps/el-profesor/actions/extraction";
import { markBlockReviewed } from "@/app/apps/el-profesor/actions/block-review";
import { setBookmarkTags } from "@/app/apps/el-profesor/actions/bookmarks";
import { saveFicheReadProgress, resetFicheReadProgress, resetFicheMastery } from "@/app/apps/el-profesor/actions/progress";

export const ACTION_REGISTRY = {
  "library.moveBook": moveBook,
  "library.moveChapter": moveChapter,
  "library.renameChapter": renameChapter,
  "library.deleteChapter": deleteChapter,
  "library.deleteBook": deleteBook,
  "library.bulkPublishChapters": bulkPublishChapters,
  "blockReview.mark": markBlockReviewed,
  "bookmarks.setTags": setBookmarkTags,
  "progress.saveFicheRead": saveFicheReadProgress,
  "progress.resetFicheRead": resetFicheReadProgress,
  "progress.resetFicheMastery": resetFicheMastery,
} as const;

export type RegisteredActionName = keyof typeof ACTION_REGISTRY;
