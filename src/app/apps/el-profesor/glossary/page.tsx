import {
  requireElProfesorAccess,
  getGlossary,
  getNotionReadiness,
  getNotionRecommendations,
  getDoseCalculators,
  getCaseJournalCountsByNotion,
} from "@/lib/el-profesor/dal";
import { GlossaryView } from "@/components/el-profesor/glossary-view";

export default async function GlossaryPage() {
  const profile = await requireElProfesorAccess();
  const notions = await getGlossary();
  const notionIds = notions.map((n) => n.notion.id);
  const [readiness, recommendations, doseCalculators, caseCounts] = await Promise.all([
    getNotionReadiness(profile.id, notions),
    getNotionRecommendations(notionIds),
    getDoseCalculators(notionIds),
    getCaseJournalCountsByNotion(profile.id, notionIds),
  ]);

  return (
    <GlossaryView
      notions={notions}
      readiness={readiness}
      recommendations={recommendations}
      doseCalculators={doseCalculators}
      caseCounts={caseCounts}
      isAdmin={profile.role === "admin"}
    />
  );
}
