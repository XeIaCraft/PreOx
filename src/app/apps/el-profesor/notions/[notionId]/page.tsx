import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { getEffectiveIsAdmin } from "@/lib/el-profesor/preview-mode";
import { getElProfesorNotionSynthesis } from "@/app/apps/el-profesor/actions/offline-sync";
import { NotionSynthesisWithLocalCache } from "@/components/el-profesor/notion-synthesis-with-local-cache";
import { ToastProvider } from "@/components/ui/toast";

export const maxDuration = 60;

/** Un-awaited, cache-first (piste 2026-09-24 — "module 100% local") — see NotionSynthesisWithLocalCache. */
export default async function NotionSynthesisPage({ params }: { params: Promise<{ notionId: string }> }) {
  const profile = await requireElProfesorAccess();
  const { notionId } = await params;
  const { effectiveIsAdmin: isAdmin } = await getEffectiveIsAdmin(profile.role === "admin");

  return (
    <ToastProvider>
      <NotionSynthesisWithLocalCache notionId={notionId} isAdmin={isAdmin} initialDataPromise={getElProfesorNotionSynthesis(notionId)} />
    </ToastProvider>
  );
}
