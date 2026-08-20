import { notFound } from "next/navigation";
import { requireElProfesorAdmin, getChapterContent } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { ExtractionReviewView } from "@/components/el-profesor/extraction-review-view";
import { ToastProvider } from "@/components/ui/toast";

export default async function AdminReviewPage({ params }: { params: Promise<{ chapterId: string }> }) {
  await requireElProfesorAdmin();
  const { chapterId } = await params;

  const supabase = await createClient();
  const { data: chapter } = await supabase.from("el_profesor_chapters").select("*").eq("id", chapterId).single();
  if (!chapter) notFound();

  const subEntities = await getChapterContent(chapterId, true);

  return (
    <ToastProvider>
      <ExtractionReviewView chapterId={chapterId} chapterTitle={chapter.title} subEntities={subEntities} />
    </ToastProvider>
  );
}
