import { Suspense } from "react";
import type { Metadata } from "next";
import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { SyncQueueRunner } from "@/components/el-profesor/sync-queue-runner";
import { LocalNavShell } from "@/components/el-profesor/local-nav-shell";

export const metadata: Metadata = { title: "El Profesor" };

export default async function ElProfesorLayout({ children }: { children: React.ReactNode }) {
  await requireElProfesorAccess();
  return (
    <>
      <SyncQueueRunner />
      {/* useSearchParams() (used by LocalNavShell) requires a Suspense boundary — the fallback is never actually seen since the first render always has a real pathname/searchParams available synchronously on the client. */}
      <Suspense fallback={children}>
        <LocalNavShell>{children}</LocalNavShell>
      </Suspense>
    </>
  );
}
