import { requireElProfesorAccess, getCaseJournalEntries, getGlossary } from "@/lib/el-profesor/dal";
import { CaseJournalView } from "@/components/el-profesor/case-journal-view";
import { DalLoadError } from "@/components/el-profesor/dal-load-error";
import { RenderErrorBoundary } from "@/components/el-profesor/render-error-boundary";

async function loadJournalData() {
  const [entries, notionSummaries] = await Promise.all([getCaseJournalEntries(), getGlossary()]);
  return { entries, notions: notionSummaries.map((s) => ({ id: s.notion.id, name: s.notion.name })) };
}

export default async function CaseJournalPage({ searchParams }: { searchParams: Promise<{ notionId?: string }> }) {
  await requireElProfesorAccess();
  const { notionId } = await searchParams;

  // JSX must stay outside the try — React defers rendering, so wrapping a
  // <Component/> construction itself in try/catch never actually catches
  // that component's own render errors (only genuinely synchronous-to-this-
  // await-chain errors, i.e. the data fetch above it — which is exactly
  // what this guards).
  let data: Awaited<ReturnType<typeof loadJournalData>> | null = null;
  let loadError: unknown = null;
  try {
    data = await loadJournalData();
  } catch (error) {
    loadError = error;
  }

  if (!data) return <DalLoadError title="Journal de cas" error={loadError} />;
  return (
    <RenderErrorBoundary fallbackTitle="Journal de cas">
      <CaseJournalView entries={data.entries} notions={data.notions} filterNotionId={notionId ?? null} />
    </RenderErrorBoundary>
  );
}
