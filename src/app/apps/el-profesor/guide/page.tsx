import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { GuideView } from "@/components/el-profesor/guide-view";

export default async function GuidePage() {
  const profile = await requireElProfesorAccess();
  return <GuideView isAdmin={profile.role === "admin"} />;
}
