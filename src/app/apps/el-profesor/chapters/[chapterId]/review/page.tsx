import { requireElProfesorAccess, getDueQueue, getFreeReviewQueue } from "@/lib/el-profesor/dal";
import { ReviewQueueWithLocalCache } from "@/components/el-profesor/review-queue-with-local-cache";
import { applyFreeSessionCap, computeExamDurationMs } from "@/lib/el-profesor/review-session-params";
import { ToastProvider } from "@/components/ui/toast";
import type { Flashcard, ReviewSource } from "@/lib/el-profesor/types";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ chapterId: string }>;
  searchParams: Promise<{ mode?: string; all?: string; limit?: string; duration?: string }>;
}) {
  const profile = await requireElProfesorAccess();
  const { chapterId } = await params;
  const { mode, all, limit, duration } = await searchParams;
  const source: ReviewSource = mode === "exam" ? "exam" : mode === "free" ? "free" : "scheduled";

  // Not awaited — ReviewQueueWithLocalCache computes the queue straight from
  // the local cache (local-review-queue.ts) whenever it can, and only ever
  // falls back to waiting on this promise when this chapter hasn't been
  // synced yet (same seam as the dashboard/book/chapter pages). Awaiting it
  // here would block every navigation into a review session behind it
  // regardless of the cache.
  const fullQueuePromise: Promise<Flashcard[]> =
    source === "scheduled" ? getDueQueue(profile.id, chapterId) : getFreeReviewQueue(chapterId, profile.id);
  const queuePromise =
    source === "free" ? fullQueuePromise.then((fullQueue) => applyFreeSessionCap(fullQueue, { all, limit })) : fullQueuePromise.then((queue) => ({ queue, cappedFrom: null }));

  const examDurationMs = source === "exam" ? computeExamDurationMs(duration) : undefined;

  return (
    <ToastProvider>
      <ReviewQueueWithLocalCache
        key={`${chapterId}:${source}:${limit ?? ""}:${all ?? ""}:${duration ?? ""}`}
        chapterId={chapterId}
        source={source}
        limit={limit}
        all={all}
        queuePromise={queuePromise}
        examDurationMs={examDurationMs}
        badgeLabel={source === "exam" ? "Examen blanc" : undefined}
        emptyMessage={source === "exam" ? "Aucune flashcard publiée pour ce chapitre — rien à mettre dans un examen blanc." : undefined}
      />
    </ToastProvider>
  );
}
