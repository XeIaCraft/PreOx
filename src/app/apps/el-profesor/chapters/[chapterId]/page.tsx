import { notFound } from "next/navigation";
import { requireElProfesorAccess, getChapterContent } from "@/lib/el-profesor/dal";
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
  await requireElProfesorAccess();
  const { chapterId } = await params;
  const { entity } = await searchParams;

  const supabase = await createClient();
  const { data: chapter } = await supabase.from("el_profesor_chapters").select("*").eq("id", chapterId).single();
  if (!chapter || chapter.status !== "published") notFound();

  const subEntities = await getChapterContent(chapterId, false);

  return (
    <ToastProvider>
      <ChapterView chapterId={chapterId} chapterTitle={chapter.title} subEntities={subEntities} initialEntityId={entity} />
    </ToastProvider>
  );
}
