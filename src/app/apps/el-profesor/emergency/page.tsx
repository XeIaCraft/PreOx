import { requireElProfesorAccess, getEmergencyBlocks } from "@/lib/el-profesor/dal";
import { EmergencyView } from "@/components/el-profesor/emergency-view";

export default async function EmergencyPage() {
  await requireElProfesorAccess();
  const entries = await getEmergencyBlocks();

  return <EmergencyView entries={entries} />;
}
