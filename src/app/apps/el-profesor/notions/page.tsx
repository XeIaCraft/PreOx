import {
  requireElProfesorAdmin,
  getLibrary,
  getNotionSummaries,
  getNotionRecommendations,
  getContradictions,
  getCrossBookFlashcardDuplicates,
  getSupersededFiches,
  getNotionUpdateProposals,
} from "@/lib/el-profesor/dal";
import { NotionsView } from "@/components/el-profesor/notions-view";
import { ToastProvider } from "@/components/ui/toast";

export default async function NotionsPage() {
  await requireElProfesorAdmin();

  const [books, notionSummaries, contradictions, crossBookDuplicates, supersededFiches, notionUpdateProposals] = await Promise.all([
    getLibrary(),
    getNotionSummaries(),
    getContradictions(),
    getCrossBookFlashcardDuplicates(),
    getSupersededFiches(),
    getNotionUpdateProposals(),
  ]);
  const recommendations = await getNotionRecommendations(notionSummaries.map((s) => s.notion.id));

  const chapters = books.flatMap((book) =>
    book.chapters
      .filter((c) => c.status === "draft_ready" || c.status === "published")
      .map((c) => ({ id: c.id, title: c.title, bookTitle: book.title }))
  );

  return (
    <ToastProvider>
      <NotionsView
        chapters={chapters}
        notionSummaries={notionSummaries}
        recommendations={recommendations}
        contradictions={contradictions}
        crossBookDuplicates={crossBookDuplicates}
        supersededFiches={supersededFiches}
        notionUpdateProposals={notionUpdateProposals}
      />
    </ToastProvider>
  );
}
