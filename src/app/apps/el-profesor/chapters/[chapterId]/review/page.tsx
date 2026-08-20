import { requireElProfesorAccess, getDueQueue, getFreeReviewQueue } from "@/lib/el-profesor/dal";
import { FlashcardReviewer } from "@/components/el-profesor/flashcard-reviewer";
import { ToastProvider } from "@/components/ui/toast";
import type { Flashcard } from "@/lib/el-profesor/types";

// Free (out-of-schedule) review loads every published flashcard for the
// chapter at once (already shuffled by getFreeReviewQueue) — fine for most
// chapters, but a large one can mean dozens of cards in a single sitting.
// Cap by default; ?all=1 opts out.
const FREE_SESSION_CAP = 30;

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ chapterId: string }>;
  searchParams: Promise<{ mode?: string; all?: string; limit?: string }>;
}) {
  const profile = await requireElProfesorAccess();
  const { chapterId } = await params;
  const { mode, all, limit } = await searchParams;
  const source = mode === "free" ? "free" : "scheduled";

  const fullQueue: Flashcard[] = source === "free" ? await getFreeReviewQueue(chapterId) : await getDueQueue(profile.id, chapterId);

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

  return (
    <ToastProvider>
      <FlashcardReviewer chapterId={chapterId} source={source} cards={queue} cappedFrom={cappedFrom} />
    </ToastProvider>
  );
}
