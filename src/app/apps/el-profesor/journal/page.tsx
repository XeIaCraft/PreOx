import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { getElProfesorCaseJournalData } from "@/app/apps/el-profesor/actions/offline-sync";
import { CaseJournalWithLocalCache } from "@/components/el-profesor/case-journal-with-local-cache";
import { RenderErrorBoundary } from "@/components/el-profesor/render-error-boundary";
import { ToastProvider } from "@/components/ui/toast";

/**
 * Un-awaited, same "cache first, live promise as fallback" pattern as the
 * dashboard (piste 2026-09-24 — "module 100% local", extension aux autres
 * écrans) — see CaseJournalWithLocalCache. requireElProfesorAccess still
 * runs here (not just inside the exported action) so a genuinely
 * unauthenticated visit redirects immediately rather than rendering a shell
 * that only fails once the client-side fetch runs.
 */
export default async function CaseJournalPage({ searchParams }: { searchParams: Promise<{ notionId?: string }> }) {
  await requireElProfesorAccess();
  const { notionId } = await searchParams;

  return (
    <ToastProvider>
      <RenderErrorBoundary fallbackTitle="Journal de cas">
        <CaseJournalWithLocalCache initialDataPromise={getElProfesorCaseJournalData()} filterNotionId={notionId ?? null} />
      </RenderErrorBoundary>
    </ToastProvider>
  );
}
