import { requireElProfesorAccess, getCaseJournalEntries, getGlossary } from "@/lib/el-profesor/dal";
import { CaseJournalView } from "@/components/el-profesor/case-journal-view";

export default async function CaseJournalPage({ searchParams }: { searchParams: Promise<{ notionId?: string }> }) {
  await requireElProfesorAccess();
  const { notionId } = await searchParams;
  const [entries, notionSummaries] = await Promise.all([getCaseJournalEntries(), getGlossary()]);
  const notions = notionSummaries.map((s) => ({ id: s.notion.id, name: s.notion.name }));

  return <CaseJournalView entries={entries} notions={notions} filterNotionId={notionId ?? null} />;
}
