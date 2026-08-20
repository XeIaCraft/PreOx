import { notFound } from "next/navigation";
import { requireElProfesorAccess, getChapterContent, getBookmarkedSubEntityIds } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { ChapterView } from "@/components/el-profesor/chapter-view";
import { ToastProvider } from "@/components/ui/toast";

export default async function ChapterPage({
  params,
  searchParams,
}: {
  params: Promise<{ chapterId: string }>;
  searchParams: Promise<{ entity?: string }>;
}) {
  const profile = await requireElProfesorAccess();
  const { chapterId } = await params;
  const { entity } = await searchParams;

  const supabase = await createClient();
  const { data: chapter } = await supabase.from("el_profesor_chapters").select("*").eq("id", chapterId).single();
  if (!chapter || chapter.status !== "published") notFound();

  const [subEntities, bookmarkedIds] = await Promise.all([
    getChapterContent(chapterId, false),
    getBookmarkedSubEntityIds(profile.id),
  ]);

  return (
    <ToastProvider>
      <ChapterView
        chapterId={chapterId}
        chapterTitle={chapter.title}
        subEntities={subEntities}
        initialEntityId={entity}
        bookmarkedIds={[...bookmarkedIds]}
      />
    </ToastProvider>
  );
}
