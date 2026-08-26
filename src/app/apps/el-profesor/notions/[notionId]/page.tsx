import { notFound } from "next/navigation";
import { requireElProfesorAccess, getNotionSynthesis, getNotionFiches } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { NotionSynthesisView } from "@/components/el-profesor/notion-synthesis-view";
import { ToastProvider } from "@/components/ui/toast";

export const maxDuration = 60;

export default async function NotionSynthesisPage({ params }: { params: Promise<{ notionId: string }> }) {
  const profile = await requireElProfesorAccess();
  const { notionId } = await params;

  const supabase = await createClient();
  const { data: notion } = await supabase.from("el_profesor_notions").select("id, name").eq("id", notionId).maybeSingle();
  if (!notion) notFound();

  const [synthesis, fiches] = await Promise.all([getNotionSynthesis(notionId), getNotionFiches(notionId)]);

  return (
    <ToastProvider>
      <NotionSynthesisView
        notionId={notionId}
        notionName={notion.name}
        synthesis={synthesis}
        fiches={fiches}
        isAdmin={profile.role === "admin"}
      />
    </ToastProvider>
  );
}
