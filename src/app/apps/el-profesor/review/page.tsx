import { requireElProfesorAccess, getLibrary, getGlobalDueQueue, getDifficultQueue, getNotionDueQueue } from "@/lib/el-profesor/dal";
import { FlashcardReviewer } from "@/components/el-profesor/flashcard-reviewer";
import { GlobalReviewWithLocalCache } from "@/components/el-profesor/review-queue-with-local-cache";
import { ToastProvider } from "@/components/ui/toast";

// Cross-chapter review: interleaved practice across every published chapter
// at once, rather than one topic at a time — a well-established memory
// technique (interleaving) that a strictly per-chapter queue can't offer.
// "theme" mode (item 54) does the same thing scoped to one notion instead
// of the whole library — revise a topic once across every book that covers
// it, rather than once per book.
export default async function GlobalReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; notionId?: string; name?: string }>;
}) {
  const profile = await requireElProfesorAccess();
  const { mode, notionId, name } = await searchParams;
  const isDifficult = mode === "difficult";
  const isTheme = mode === "theme" && Boolean(notionId);

  if (isTheme) {
    const cards = await getNotionDueQueue(profile.id, notionId!);
    return (
      <ToastProvider>
        <FlashcardReviewer
          source="scheduled"
          cards={cards}
          badgeLabel={name ? `Thème : ${name}` : "Thème"}
          emptyMessage="Rien à réviser sur ce thème pour l'instant."
        />
      </ToastProvider>
    );
  }

  // Cache-first (piste 2026-09-24): the queue is computed on the device
  // from the synced library whenever it's cached, with the same functions
  // as the dashboard's counts. This server-side queue is only waited on
  // when nothing is cached yet — deliberately not awaited here.
  const cardsPromise = getLibrary().then((books) => {
    const chapters = books.flatMap((b) => b.chapters);
    return isDifficult ? getDifficultQueue(profile.id, chapters) : getGlobalDueQueue(profile.id, chapters);
  });

  return (
    <ToastProvider>
      <GlobalReviewWithLocalCache mode={isDifficult ? "difficult" : "due"} cardsPromise={cardsPromise} />
    </ToastProvider>
  );
}
