import { requireElProfesorAccess, getLibrary, getGlobalDueQueue, getDifficultQueue, getNotionDueQueue } from "@/lib/el-profesor/dal";
import { FlashcardReviewer } from "@/components/el-profesor/flashcard-reviewer";
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

  let cards;
  let badgeLabel: string;
  let emptyMessage: string;
  if (isTheme) {
    cards = await getNotionDueQueue(profile.id, notionId!);
    badgeLabel = name ? `Thème : ${name}` : "Thème";
    emptyMessage = "Rien à réviser sur ce thème pour l'instant.";
  } else if (isDifficult) {
    const books = await getLibrary();
    cards = await getDifficultQueue(profile.id, books.flatMap((b) => b.chapters));
    badgeLabel = "Carnet d'erreurs";
    emptyMessage = "Aucune carte difficile en ce moment — beau travail !";
  } else {
    const books = await getLibrary();
    cards = await getGlobalDueQueue(profile.id, books.flatMap((b) => b.chapters));
    badgeLabel = "Toutes matières";
    emptyMessage = "Rien à réviser aujourd'hui, tous chapitres confondus.";
  }

  return (
    <ToastProvider>
      <FlashcardReviewer source={isDifficult ? "free" : "scheduled"} cards={cards} badgeLabel={badgeLabel} emptyMessage={emptyMessage} />
    </ToastProvider>
  );
}
