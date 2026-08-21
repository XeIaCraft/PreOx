import { requireElProfesorAdmin, getArchivedBooks } from "@/lib/el-profesor/dal";
import { ArchivedBooksView } from "@/components/el-profesor/archived-books-view";
import { ToastProvider } from "@/components/ui/toast";

export default async function ArchivedBooksPage() {
  await requireElProfesorAdmin();
  const books = await getArchivedBooks();

  return (
    <ToastProvider>
      <ArchivedBooksView books={books} />
    </ToastProvider>
  );
}
