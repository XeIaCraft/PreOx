"use client";

// Dispatch table for the generic "adminAction" pending-write kind (piste
// 2026-09-24 — "module 100% local", file d'action générique). sync-queue.ts
// looks up a queued action's name here and calls the real Server Action
// with its recorded args — no Server Action is reimplemented, only
// referenced, so the actual mutation logic (and its own admin check) stays
// exactly where it already lives.
//
// Registering a new admin action for local-first use is: (1) add it here,
// (2) call enqueuePendingWrite({ kind: "adminAction", payload: { action:
// "<name>", args: [...] } }) — no new Payload interface or PendingWrite
// union member needed, unlike the five write kinds with bespoke local-read
// integration (review/bookmark/note/readingPosition/exclude).
import { moveBook, moveChapter } from "@/app/apps/el-profesor/actions/library";

export const ACTION_REGISTRY = {
  "library.moveBook": moveBook,
  "library.moveChapter": moveChapter,
} as const;

export type RegisteredActionName = keyof typeof ACTION_REGISTRY;
