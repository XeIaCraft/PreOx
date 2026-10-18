import { Suspense } from "react";
import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { getMergeJobs, getMergeSetupData } from "@/app/apps/el-profesor/actions/merge";
import { MergeNotionsView } from "@/components/el-profesor/merge-notions-view";
import { ToastProvider } from "@/components/ui/toast";

/**
 * Notions, refondues en octobre 2026 : une notion est désormais un livre
 * fusionné — plusieurs livres de la bibliothèque réunis en une table des
 * matières pensée pour apprendre, fiche par fiche, sans perte. Les anciennes
 * notions restent accessibles sur /notions/anciennes.
 */
export default async function NotionsPage() {
  await requireElProfesorAdmin();

  return (
    <ToastProvider>
      <Suspense fallback={<p className="mx-auto max-w-4xl px-4 py-10 text-sm text-foreground-subtle">Chargement des notions…</p>}>
        <MergeNotionsView setupPromise={getMergeSetupData()} jobsPromise={getMergeJobs()} />
      </Suspense>
    </ToastProvider>
  );
}
