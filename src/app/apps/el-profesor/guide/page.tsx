import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { getEffectiveIsAdmin } from "@/lib/el-profesor/preview-mode";
import { GuideView } from "@/components/el-profesor/guide-view";

export default async function GuidePage() {
  const profile = await requireElProfesorAccess();
  const { effectiveIsAdmin: isAdmin } = await getEffectiveIsAdmin(profile.role === "admin");
  return <GuideView isAdmin={isAdmin} />;
}
