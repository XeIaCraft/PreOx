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

export default async function GlossaryPage() {
  const profile = await requireElProfesorAccess();
  const { effectiveIsAdmin: isAdmin } = await getEffectiveIsAdmin(profile.role === "admin");
  const notions = await getGlossary();
  const notionIds = notions.map((n) => n.notion.id);
  const [categories, readiness, recommendations, doseCalculators, caseCounts] = await Promise.all([
    getNotionCategories(),
    getNotionReadiness(profile.id, notions),
    getNotionRecommendations(notionIds),
    getDoseCalculators(notionIds),
    getCaseJournalCountsByNotion(profile.id, notionIds),
  ]);

  return (
    <GlossaryView
      notions={notions}
      categories={categories}
      readiness={readiness}
      recommendations={recommendations}
      doseCalculators={doseCalculators}
      caseCounts={caseCounts}
      isAdmin={isAdmin}
    />
  );
}
