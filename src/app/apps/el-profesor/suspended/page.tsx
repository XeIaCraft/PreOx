import { requireElProfesorAccess, getSuspendedFlashcards } from "@/lib/el-profesor/dal";
import { SuspendedFlashcardsView } from "@/components/el-profesor/suspended-flashcards-view";
import { ToastProvider } from "@/components/ui/toast";

export default async function SuspendedFlashcardsPage() {
  const profile = await requireElProfesorAccess();
  const cards = await getSuspendedFlashcards(profile.id);

  return (
    <ToastProvider>
      <SuspendedFlashcardsView cards={cards} />
    </ToastProvider>
  );
}
