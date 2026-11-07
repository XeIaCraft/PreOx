import type { Metadata } from "next";
import { requirePlanningAccess } from "@/lib/planning-tivoli/dal";

export const metadata: Metadata = { title: "Planning Tivoli" };

export default async function PlanningTivoliLayout({ children }: { children: React.ReactNode }) {
  await requirePlanningAccess();
  return <>{children}</>;
}
