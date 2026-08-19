import { notFound } from "next/navigation";
import { requireElProfesorAccess, getChapterContent } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { ChapterView } from "@/components/el-profesor/chapter-view";

export default async function ChapterPage({ params }: { params: Promise<{ chapterId: string }> }) {
  await requireElProfesorAccess();
  const { chapterId } = await params;

  const supabase = await createClient();
  const { data: chapter } = await supabase.from("el_profesor_chapters").select("*").eq("id", chapterId).single();
  if (!chapter || chapter.status !== "published") notFound();

  const subEntities = await getChapterContent(chapterId, false);

  return <ChapterView chapterId={chapterId} chapterTitle={chapter.title} subEntities={subEntities} />;
}
