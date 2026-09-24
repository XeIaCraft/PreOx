import "server-only";

// Server half of the local-first write queue's flush (piste 2026-09-24 —
// suite au retour "la synchronisation est hyper lente"). The queue used to
// replay each pending write as its own Server Action call — and Next.js runs
// Server Actions strictly one at a time per client, each one re-rendering
// the current page because every action here ends with revalidatePath().
// A 40-card review session meant 40 queued round trips, each re-computing
// the whole dashboard server-side, while every other action the user
// triggered (opening "Réglages IA", a sync…) waited behind them. Now the
// browser POSTs a batch of queued writes to the sync route handler in one
// request, and this replays them in order against the very same Server
// Action functions (called as plain server functions: same validation, same
// permission checks, no page re-render, no queue).
import { createClient } from "@/lib/supabase/server";
import { submitReview, excludeFlashcardFromReviews, reincludeFlashcardInReviews } from "@/app/apps/el-profesor/actions/review";
import { setBookmark } from "@/app/apps/el-profesor/actions/bookmarks";
import { saveMyNote } from "@/app/apps/el-profesor/actions/notes";
import { recordReadingPosition } from "@/app/apps/el-profesor/actions/reading-position";
import { ACTION_REGISTRY, type RegisteredActionName } from "./action-registry";
import type { PendingWrite } from "./local-db";

/** What the client does with each write afterwards — mirrors the outcomes the old client-side flush used. */
export interface FlushResult {
  id: string;
  outcome: "delete" | "keep-flushed" | "fail";
  /** Only for "review": the server's log id, kept so a quick "undo" can still find it. */
  serverLogId?: string;
}

/** Bounds one request's duration well under the route's maxDuration — the client simply sends the next batch right after. */
export const MAX_WRITES_PER_FLUSH = 25;

function isPendingWrite(value: unknown): value is PendingWrite {
  if (!value || typeof value !== "object") return false;
  const v = value as { id?: unknown; kind?: unknown; payload?: unknown };
  return typeof v.id === "string" && typeof v.kind === "string" && !!v.payload && typeof v.payload === "object";
}

type ActionLike = (...args: unknown[]) => Promise<unknown>;

function hasError(result: unknown): boolean {
  return !!result && typeof result === "object" && "error" in result && !!(result as { error?: unknown }).error;
}

async function applyOne(write: PendingWrite): Promise<FlushResult> {
  const fail: FlushResult = { id: write.id, outcome: "fail" };
  const done: FlushResult = { id: write.id, outcome: "delete" };
  switch (write.kind) {
    case "review": {
      if (write.flushed) return { id: write.id, outcome: "keep-flushed", serverLogId: write.serverLogId };
      const { flashcardId, rating, source, durationMs, variantId, confidence } = write.payload;
      // write.id doubles as the log row's id (a replay is idempotent), and
      // write.createdAt is when the card was actually answered — see submitReview.
      const result = await submitReview(flashcardId, rating, source, durationMs, variantId, confidence, write.id, write.createdAt);
      if (result.error || !result.logId) return fail;
      return { id: write.id, outcome: "keep-flushed", serverLogId: result.logId };
    }
    case "exclude": {
      const { flashcardId, excluded } = write.payload;
      const result = excluded ? await excludeFlashcardFromReviews(flashcardId) : await reincludeFlashcardInReviews(flashcardId);
      return hasError(result) ? fail : done;
    }
    case "bookmark": {
      const result = await setBookmark(write.payload.subEntityId, write.payload.bookmarked);
      return hasError(result) ? fail : done;
    }
    case "note": {
      const result = await saveMyNote(write.payload.subEntityId, write.payload.content);
      return hasError(result) ? fail : done;
    }
    case "readingPosition": {
      await recordReadingPosition(write.payload.chapterId, write.payload.subEntityId);
      return done; // fire-and-forget by design, see that action's doc comment
    }
    case "adminAction": {
      const fn = ACTION_REGISTRY[write.payload.action as RegisteredActionName] as ActionLike | undefined;
      // Unknown action name (e.g. queued by an older client this build no
      // longer registers) — nothing to retry; dropped rather than failed
      // forever, which would block every write queued after it.
      if (!fn) return done;
      const args = Array.isArray(write.payload.args) ? write.payload.args : [];
      return hasError(await fn(...args)) ? fail : done;
    }
    default:
      return done;
  }
}

/** Which row an admin action targets (table + index of its id in args) — see targetIsGone. */
const ADMIN_ACTION_TARGETS: Partial<Record<RegisteredActionName, { table: "books" | "chapters" | "blocks" | "subEntities"; argIndex: number }>> = {
  "library.moveBook": { table: "books", argIndex: 0 },
  "library.moveChapter": { table: "chapters", argIndex: 0 },
  "library.renameChapter": { table: "chapters", argIndex: 0 },
  "library.deleteChapter": { table: "chapters", argIndex: 0 },
  "library.deleteBook": { table: "books", argIndex: 0 },
  "blockReview.mark": { table: "blocks", argIndex: 0 },
  "bookmarks.setTags": { table: "subEntities", argIndex: 0 },
};

/**
 * True when a failed write's target row no longer exists at all (deleted
 * since the write was queued — e.g. a card reviewed on a device whose cache
 * still had a chapter an admin has since removed). Such a write can never
 * succeed, and since the queue stops at the first failure to preserve
 * ordering, keeping it would block every later write forever — so it's
 * dropped instead. Only ever consulted after a failure.
 */
async function targetIsGone(write: PendingWrite): Promise<boolean> {
  const supabase = await createClient();
  async function missing(table: "books" | "chapters" | "blocks" | "subEntities" | "flashcards", id: unknown): Promise<boolean> {
    if (typeof id !== "string") return false;
    const query =
      table === "books"
        ? supabase.from("el_profesor_books").select("id").eq("id", id)
        : table === "chapters"
          ? supabase.from("el_profesor_chapters").select("id").eq("id", id)
          : table === "blocks"
            ? supabase.from("el_profesor_fiche_blocks").select("id").eq("id", id)
            : table === "subEntities"
              ? supabase.from("el_profesor_sub_entities").select("id").eq("id", id)
              : supabase.from("el_profesor_flashcards").select("id").eq("id", id);
    const { data, error } = await query.maybeSingle();
    return !error && !data;
  }
  switch (write.kind) {
    case "review":
    case "exclude":
      return missing("flashcards", write.payload.flashcardId);
    case "bookmark":
    case "note":
      return missing("subEntities", write.payload.subEntityId);
    case "adminAction": {
      const target = ADMIN_ACTION_TARGETS[write.payload.action as RegisteredActionName];
      return target ? missing(target.table, write.payload.args?.[target.argIndex]) : false;
    }
    default:
      return false;
  }
}

/**
 * Replays `writes` in order and stops at the first real failure (the rest
 * stay queued client-side, untouched — so a later write for the same card,
 * note or bookmark can never jump ahead of an earlier one on a retry).
 * Returns one result per write it actually got to.
 */
export async function applyPendingWritesOnServer(writes: unknown[]): Promise<FlushResult[]> {
  const results: FlushResult[] = [];
  for (const raw of writes.slice(0, MAX_WRITES_PER_FLUSH)) {
    if (!isPendingWrite(raw)) continue;
    let result: FlushResult;
    try {
      result = await applyOne(raw);
    } catch (err) {
      console.error("[el-profesor/flush] write failed:", raw.kind, err);
      result = { id: raw.id, outcome: "fail" };
    }
    if (result.outcome === "fail" && (await targetIsGone(raw).catch(() => false))) {
      console.warn("[el-profesor/flush] dropping a write whose target no longer exists:", raw.kind, raw.id);
      result = { id: raw.id, outcome: "delete" };
    }
    results.push(result);
    if (result.outcome === "fail") break;
  }
  return results;
}
