import {
  requireElProfesorAccess,
  getGlossary,
  getNotionCategories,
  getNotionReadiness,
  getNotionRecommendations,
  getDoseCalculators,
  getCaseJournalCountsByNotion,
} from "@/lib/el-profesor/dal";
import { getEffectiveIsAdmin } from "@/lib/el-profesor/preview-mode";
import { GlossaryView } from "@/components/el-profesor/glossary-view";
import { DalLoadError } from "@/components/el-profesor/dal-load-error";
import { RenderErrorBoundary } from "@/components/el-profesor/render-error-boundary";
import { ToastProvider } from "@/components/ui/toast";

async function loadGlossaryData(profileId: string, realIsAdmin: boolean) {
  const { effectiveIsAdmin: isAdmin } = await getEffectiveIsAdmin(realIsAdmin);
  const notions = await getGlossary();
  const notionIds = notions.map((n) => n.notion.id);
  const [categories, readiness, recommendations, doseCalculators, caseCounts] = await Promise.all([
    getNotionCategories(),
    getNotionReadiness(profileId, notions),
    getNotionRecommendations(notionIds),
    getDoseCalculators(notionIds),
    getCaseJournalCountsByNotion(profileId, notionIds),
  ]);
  return { isAdmin, notions, categories, readiness, recommendations, doseCalculators, caseCounts };
}

export default async function GlossaryPage() {
  const profile = await requireElProfesorAccess();

  // JSX must stay outside the try — React defers rendering, so wrapping a
  // <Component/> construction itself in try/catch never actually catches
  // that component's own render errors (only genuinely synchronous-to-this-
  // await-chain errors, i.e. the data fetch above it — which is exactly
  // what this guards).
  let data: Awaited<ReturnType<typeof loadGlossaryData>> | null = null;
  let loadError: unknown = null;
  try {
    data = await loadGlossaryData(profile.id, profile.role === "admin");
  } catch (error) {
    loadError = error;
  }

  if (!data) return <DalLoadError title="Glossaire" error={loadError} />;
  return (
    <ToastProvider>
      <RenderErrorBoundary fallbackTitle="Glossaire">
        <GlossaryView
          notions={data.notions}
          categories={data.categories}
          readiness={data.readiness}
          recommendations={data.recommendations}
          doseCalculators={data.doseCalculators}
          caseCounts={data.caseCounts}
          isAdmin={data.isAdmin}
        />
      </RenderErrorBoundary>
    </ToastProvider>
  );
}
