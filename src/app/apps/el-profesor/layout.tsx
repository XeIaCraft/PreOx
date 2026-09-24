import type { Metadata } from "next";
import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { SyncQueueRunner } from "@/components/el-profesor/sync-queue-runner";

export const metadata: Metadata = { title: "El Profesor" };

export default async function ElProfesorLayout({ children }: { children: React.ReactNode }) {
  await requireElProfesorAccess();
  return (
    <>
      <SyncQueueRunner />
      {children}
    </>
  );
}
