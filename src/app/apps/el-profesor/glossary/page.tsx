import { requireElProfesorAccess, getGlossary, getNotionReadiness, getNotionRecommendations } from "@/lib/el-profesor/dal";
import { GlossaryView } from "@/components/el-profesor/glossary-view";

export default async function GlossaryPage() {
  const profile = await requireElProfesorAccess();
  const notions = await getGlossary();
  const [readiness, recommendations] = await Promise.all([
    getNotionReadiness(profile.id, notions),
    getNotionRecommendations(notions.map((n) => n.notion.id)),
  ]);

  return <GlossaryView notions={notions} readiness={readiness} recommendations={recommendations} />;
}
