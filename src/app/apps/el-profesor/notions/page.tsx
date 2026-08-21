import { requireElProfesorAdmin, getLibrary, getNotionSummaries, getContradictions } from "@/lib/el-profesor/dal";
import { NotionsView } from "@/components/el-profesor/notions-view";
import { ToastProvider } from "@/components/ui/toast";

export default async function NotionsPage() {
  await requireElProfesorAdmin();

  const [books, notionSummaries, contradictions] = await Promise.all([getLibrary(), getNotionSummaries(), getContradictions()]);

  const chapters = books.flatMap((book) =>
    book.chapters
      .filter((c) => c.status === "draft_ready" || c.status === "published")
      .map((c) => ({ id: c.id, title: c.title, bookTitle: book.title }))
  );

  return (
    <ToastProvider>
      <NotionsView chapters={chapters} notionSummaries={notionSummaries} contradictions={contradictions} />
    </ToastProvider>
  );
}
