import { requireElProfesorAccess, getGlossary } from "@/lib/el-profesor/dal";
import { GlossaryView } from "@/components/el-profesor/glossary-view";

export default async function GlossaryPage() {
  await requireElProfesorAccess();
  const notions = await getGlossary();

  return <GlossaryView notions={notions} />;
}
