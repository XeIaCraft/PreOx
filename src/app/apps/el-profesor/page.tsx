import { getCurrentProfile } from "@/lib/auth/dal";
import { getLibrary, getDueCountsByChapter } from "@/lib/el-profesor/dal";
import { ElProfesorBoard } from "@/components/el-profesor/board";
import { ToastProvider } from "@/components/ui/toast";

export default async function ElProfesorPage() {
  const profile = (await getCurrentProfile())!;
  const books = await getLibrary();
  const allChapters = books.flatMap((b) => b.chapters);
  const dueCounts = await getDueCountsByChapter(profile.id, allChapters);

  return (
    <ToastProvider>
      <ElProfesorBoard books={books} dueCounts={dueCounts} isAdmin={profile.role === "admin"} />
    </ToastProvider>
  );
}
