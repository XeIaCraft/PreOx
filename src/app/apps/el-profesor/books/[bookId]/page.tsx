import { requireElProfesorAccess, getBookTableOfContents } from "@/lib/el-profesor/dal";
import { getEffectiveIsAdmin } from "@/lib/el-profesor/preview-mode";
import { BookTocWithLocalCache } from "@/components/el-profesor/book-toc-with-local-cache";

export default async function BookTocPage({ params }: { params: Promise<{ bookId: string }> }) {
  const profile = await requireElProfesorAccess();
  const { bookId } = await params;
  const { effectiveIsAdmin: isAdmin } = await getEffectiveIsAdmin(profile.role === "admin");

  // Not awaited — BookTocWithLocalCache assembles the table of contents
  // straight from the dashboard + per-chapter caches already downloaded by
  // "Synchroniser" whenever it can, and only ever falls back to waiting on
  // this promise when a chapter hasn't been synced yet (see that component's
  // doc comment). Awaiting it here would block every navigation into a book
  // behind it regardless of the cache, same issue already fixed on the
  // dashboard and chapter pages.
  const tocPromise = getBookTableOfContents(bookId, profile.id, isAdmin);

  return <BookTocWithLocalCache key={bookId} bookId={bookId} tocPromise={tocPromise} />;
}
