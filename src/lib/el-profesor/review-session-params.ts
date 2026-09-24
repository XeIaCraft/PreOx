// Pure query-param interpretation for a flashcard review session — no
// server or client runtime dependency, so both
// chapters/[chapterId]/review/page.tsx (server) and
// review-queue-with-local-cache.tsx / local-review-queue.ts (client) apply
// the exact same capping/clamping rules whether the queue came from the
// network or from IndexedDB.
import type { Flashcard } from "./types";

// Free (out-of-schedule) review loads every published flashcard for the
// chapter at once (already shuffled) — fine for most chapters, but a large
// one can mean dozens of cards in a single sitting. Cap by default; ?all=1
// opts out.
export const FREE_SESSION_CAP = 30;

export const EXAM_DURATION_MIN_SECONDS = 60;
export const EXAM_DURATION_MAX_SECONDS = 3 * 60 * 60;

export function applyFreeSessionCap(fullQueue: Flashcard[], opts: { all?: string; limit?: string }): { queue: Flashcard[]; cappedFrom: number | null } {
  if (opts.all === "1") return { queue: fullQueue, cappedFrom: null };
  const parsedLimit = opts.limit ? Number(opts.limit) : FREE_SESSION_CAP;
  const cap = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : FREE_SESSION_CAP;
  if (fullQueue.length > cap) return { queue: fullQueue.slice(0, cap), cappedFrom: fullQueue.length };
  return { queue: fullQueue, cappedFrom: null };
}

export function computeExamDurationMs(duration?: string): number {
  const parsedSeconds = duration ? Number(duration) : NaN;
  const clampedSeconds = Number.isFinite(parsedSeconds) ? Math.min(EXAM_DURATION_MAX_SECONDS, Math.max(EXAM_DURATION_MIN_SECONDS, parsedSeconds)) : 20 * 60;
  return clampedSeconds * 1000;
}
