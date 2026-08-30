import { notFound } from "next/navigation";
import {
  requireElProfesorAccess,
  getNotionSynthesis,
  getNotionFiches,
  getAdjacentNotions,
  getNotionReadProgress,
  getNotionMasteryProgress,
} from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveIsAdmin } from "@/lib/el-profesor/preview-mode";
import { NotionSynthesisView } from "@/components/el-profesor/notion-synthesis-view";
import { ToastProvider } from "@/components/ui/toast";

export const maxDuration = 60;

export default async function NotionSynthesisPage({ params }: { params: Promise<{ notionId: string }> }) {
  const profile = await requireElProfesorAccess();
  const { notionId } = await params;
  const { effectiveIsAdmin: isAdmin } = await getEffectiveIsAdmin(profile.role === "admin");

  const supabase = await createClient();
  const { data: notion } = await supabase.from("el_profesor_notions").select("id, name").eq("id", notionId).maybeSingle();
  if (!notion) notFound();

  // includeDraft mirrors isAdmin — see getNotionSynthesis's doc comment: RLS
  // alone can't be trusted here since a previewing admin's session still
  // carries real admin grants.
  const [synthesis, fiches, adjacentNotions, readProgress, masteryProgress] = await Promise.all([
    getNotionSynthesis(notionId, isAdmin),
    getNotionFiches(notionId),
    getAdjacentNotions(notionId),
    getNotionReadProgress(profile.id, notionId),
    getNotionMasteryProgress(profile.id, notionId),
  ]);

  return (
    <ToastProvider>
      <NotionSynthesisView
        notionId={notionId}
        notionName={notion.name}
        synthesis={synthesis}
        fiches={fiches}
        isAdmin={isAdmin}
        prevNotion={adjacentNotions.prev}
        nextNotion={adjacentNotions.next}
        readProgress={readProgress}
        masteryProgress={masteryProgress}
      />
    </ToastProvider>
  );
}
