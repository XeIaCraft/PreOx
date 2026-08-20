import { getCurrentProfile } from "@/lib/auth/dal";
import { getLibrary, getDueCountsByChapter } from "@/lib/el-profesor/dal";
import { ElProfesorBoard } from "@/components/el-profesor/board";
import { ToastProvider } from "@/components/ui/toast";

export default async function ElProfesorPage() {
  const profile = (await getCurrentProfile())!;
  const isAdmin = profile.role === "admin";
  const rawBooks = await getLibrary();
  // Non-admins never see a chapter still being imported/reviewed — only
  // admins need visibility into the pipeline's in-progress state.
  const books = isAdmin ? rawBooks : rawBooks.map((b) => ({ ...b, chapters: b.chapters.filter((c) => c.status === "published") }));
  const allChapters = books.flatMap((b) => b.chapters);
  const dueCounts = await getDueCountsByChapter(profile.id, allChapters);

  return (
    <ToastProvider>
      <ElProfesorBoard books={books} dueCounts={dueCounts} isAdmin={isAdmin} />
    </ToastProvider>
  );
}
