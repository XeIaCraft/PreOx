import { getCurrentProfile } from "@/lib/auth/dal";
import { getPlanningData } from "@/lib/planning-tivoli/dal";
import { PlanningApp } from "@/components/planning-tivoli/planning-app";
import { ToastProvider } from "@/components/ui/toast";
import { recordAppVisit } from "@/app/actions/discovery";

// The OCR of a planning (server actions of this page) takes a few seconds; the fetch of the published page too.
export const maxDuration = 60;

export default async function PlanningTivoliPage() {
  const profile = (await getCurrentProfile())!;
  const [data] = await Promise.all([getPlanningData(), recordAppVisit(profile.id, "planning-tivoli")]);
  return (
    <ToastProvider>
      <PlanningApp data={data} />
    </ToastProvider>
  );
}
