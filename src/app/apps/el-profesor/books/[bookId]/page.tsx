import { notFound } from "next/navigation";
import { requireElProfesorAccess, getBookTableOfContents } from "@/lib/el-profesor/dal";
import { BookTocView } from "@/components/el-profesor/book-toc-view";

export default async function BookTocPage({ params }: { params: Promise<{ bookId: string }> }) {
  const profile = await requireElProfesorAccess();
  const { bookId } = await params;
  const isAdmin = profile.role === "admin";

  const toc = await getBookTableOfContents(bookId, profile.id, isAdmin);
  if (!toc) notFound();

  return <BookTocView toc={toc} />;
}
