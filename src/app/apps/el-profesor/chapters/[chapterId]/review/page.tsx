import { requireElProfesorAccess, getDueQueue, getFreeReviewQueue } from "@/lib/el-profesor/dal";
import { FlashcardReviewer } from "@/components/el-profesor/flashcard-reviewer";
import { ToastProvider } from "@/components/ui/toast";
import type { Flashcard, ReviewSource } from "@/lib/el-profesor/types";

// Free (out-of-schedule) review loads every published flashcard for the
// chapter at once (already shuffled by getFreeReviewQueue) — fine for most
// chapters, but a large one can mean dozens of cards in a single sitting.
// Cap by default; ?all=1 opts out.
const FREE_SESSION_CAP = 30;

const EXAM_DURATION_MIN_SECONDS = 60;
const EXAM_DURATION_MAX_SECONDS = 3 * 60 * 60;

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

  const fullQueue: Flashcard[] =
    source === "scheduled" ? await getDueQueue(profile.id, chapterId) : await getFreeReviewQueue(chapterId, profile.id);

  let queue = fullQueue;
  let cappedFrom: number | null = null;
  if (source === "free" && all !== "1") {
    const parsedLimit = limit ? Number(limit) : FREE_SESSION_CAP;
    const cap = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : FREE_SESSION_CAP;
    if (fullQueue.length > cap) {
      queue = fullQueue.slice(0, cap);
      cappedFrom = fullQueue.length;
    }
  }

  let examDurationMs: number | undefined;
  if (source === "exam") {
    const parsedSeconds = duration ? Number(duration) : NaN;
    const clampedSeconds = Number.isFinite(parsedSeconds)
      ? Math.min(EXAM_DURATION_MAX_SECONDS, Math.max(EXAM_DURATION_MIN_SECONDS, parsedSeconds))
      : 20 * 60;
    examDurationMs = clampedSeconds * 1000;
  }

  return (
    <ToastProvider>
      <FlashcardReviewer
        chapterId={chapterId}
        source={source}
        cards={queue}
        cappedFrom={cappedFrom}
        examDurationMs={examDurationMs}
        badgeLabel={source === "exam" ? "Examen blanc" : undefined}
        emptyMessage={source === "exam" ? "Aucune flashcard publiée pour ce chapitre — rien à mettre dans un examen blanc." : undefined}
      />
    </ToastProvider>
  );
}
