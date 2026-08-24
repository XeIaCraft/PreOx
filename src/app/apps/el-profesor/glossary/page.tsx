import { requireElProfesorAccess, getGlossary, getNotionReadiness } from "@/lib/el-profesor/dal";
import { GlossaryView } from "@/components/el-profesor/glossary-view";

export default async function GlossaryPage() {
  const profile = await requireElProfesorAccess();
  const notions = await getGlossary();
  const readiness = await getNotionReadiness(profile.id, notions);

  return <GlossaryView notions={notions} readiness={readiness} />;
}
