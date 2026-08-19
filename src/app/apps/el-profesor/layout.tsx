import type { Metadata } from "next";
import { requireElProfesorAccess } from "@/lib/el-profesor/dal";

export const metadata: Metadata = { title: "El Profesor" };

export default async function ElProfesorLayout({ children }: { children: React.ReactNode }) {
  await requireElProfesorAccess();
  return <>{children}</>;
}
