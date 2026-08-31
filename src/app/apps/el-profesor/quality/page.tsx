import { requireElProfesorAdmin, getLibrary, getBookQualityDashboard, getOrphanedChapterPdfs } from "@/lib/el-profesor/dal";
import { QualityDashboardView } from "@/components/el-profesor/quality-dashboard-view";
import { ToastProvider } from "@/components/ui/toast";

export default async function QualityPage({ searchParams }: { searchParams: Promise<{ book?: string }> }) {
  await requireElProfesorAdmin();
  const { book: bookId } = await searchParams;

  const books = await getLibrary();
  const booksWithPublished = books.filter((b) => b.chapters.some((c) => c.status === "published"));
  const selectedBookId = bookId && booksWithPublished.some((b) => b.id === bookId) ? bookId : (booksWithPublished[0]?.id ?? null);

  const [dashboard, orphanedPdfs] = await Promise.all([
    selectedBookId ? getBookQualityDashboard(selectedBookId) : Promise.resolve(null),
    getOrphanedChapterPdfs(),
  ]);

  return (
    <ToastProvider>
      <QualityDashboardView
        books={booksWithPublished.map((b) => ({ id: b.id, title: b.title }))}
        selectedBookId={selectedBookId}
        dashboard={dashboard}
        orphanedPdfs={orphanedPdfs}
      />
    </ToastProvider>
  );
}
