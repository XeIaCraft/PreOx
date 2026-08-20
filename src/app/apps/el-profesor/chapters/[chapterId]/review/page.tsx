import { requireElProfesorAccess, getDueQueue, getFreeReviewQueue } from "@/lib/el-profesor/dal";
import { FlashcardReviewer } from "@/components/el-profesor/flashcard-reviewer";
import { ToastProvider } from "@/components/ui/toast";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ chapterId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const profile = await requireElProfesorAccess();
  const { chapterId } = await params;
  const { mode } = await searchParams;
  const source = mode === "free" ? "free" : "scheduled";

  const queue = source === "free" ? await getFreeReviewQueue(chapterId) : await getDueQueue(profile.id, chapterId);

  return (
    <ToastProvider>
      <FlashcardReviewer chapterId={chapterId} source={source} cards={queue} />
    </ToastProvider>
  );
}
