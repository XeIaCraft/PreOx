import { notFound } from "next/navigation";
import { requireElProfesorAdmin, getChapterContent, getOpenFlagsByTarget } from "@/lib/el-profesor/dal";
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
  const targetIds = subEntities.flatMap((s) => [
    ...(s.fiche?.blocks.map((b) => b.id) ?? []),
    ...(s.fiche?.flashcards.map((c) => c.id) ?? []),
  ]);
  const flagsByTarget = await getOpenFlagsByTarget(targetIds);

  return (
    <ToastProvider>
      <ExtractionReviewView chapterId={chapterId} chapterTitle={chapter.title} subEntities={subEntities} flagsByTarget={flagsByTarget} />
    </ToastProvider>
  );
}
