import { requireElProfesorAccess, getLibrary, getGlobalDueQueue, getDifficultQueue } from "@/lib/el-profesor/dal";
import { FlashcardReviewer } from "@/components/el-profesor/flashcard-reviewer";
import { ToastProvider } from "@/components/ui/toast";

// Cross-chapter review: interleaved practice across every published chapter
// at once, rather than one topic at a time — a well-established memory
// technique (interleaving) that a strictly per-chapter queue can't offer.
export default async function GlobalReviewPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const profile = await requireElProfesorAccess();
  const { mode } = await searchParams;
  const isDifficult = mode === "difficult";

  const books = await getLibrary();
  const chapters = books.flatMap((b) => b.chapters);
  const cards = isDifficult ? await getDifficultQueue(profile.id, chapters) : await getGlobalDueQueue(profile.id, chapters);

  return (
    <ToastProvider>
      <FlashcardReviewer
        source={isDifficult ? "free" : "scheduled"}
        cards={cards}
        badgeLabel={isDifficult ? "Carnet d'erreurs" : "Toutes matières"}
        emptyMessage={
          isDifficult
            ? "Aucune carte difficile en ce moment — beau travail !"
            : "Rien à réviser aujourd'hui, tous chapitres confondus."
        }
      />
    </ToastProvider>
  );
}
