import { getCurrentProfile } from "@/lib/auth/dal";
import { getEffectiveIsAdmin } from "@/lib/el-profesor/preview-mode";

// Server Actions invoked from this page (e.g. suggestBookChapters in
// actions/split-book.ts, which can process up to 2000 pages of a book PDF
// in one Gemini call) run under this page's function duration — the
// platform default is comfortably short for that, so raised explicitly as
// a safety margin.
export const maxDuration = 60;
import { getReadingPosition } from "@/lib/el-profesor/dal";
import {
  getElProfesorDashboardSnapshot,
  getElProfesorSecondaryDashboardData,
  getElProfesorAiConfigData,
  getElProfesorNotionViewData,
} from "@/app/apps/el-profesor/actions/offline-sync";
import { DashboardWithLocalCache } from "@/components/el-profesor/dashboard-with-local-cache";
import { ToastProvider } from "@/components/ui/toast";
import { recordAppVisit } from "@/app/actions/discovery";

export default async function ElProfesorPage() {
  const profile = (await getCurrentProfile())!;
  const realIsAdmin = profile.role === "admin";
  const { effectiveIsAdmin: isAdmin, previewingAsUser } = await getEffectiveIsAdmin(realIsAdmin);

  // recordAppVisit and getReadingPosition are single cheap indexed lookups
  // (analytics insert, one row by user id) — kept awaited, they were never
  // the slow part. The rest are deliberately NOT awaited here: awaiting them
  // would block this whole page behind them on every navigation, which is
  // exactly what made the local cache pointless — the client never got a
  // chance to render from IndexedDB before the slow server round trip
  // finished, since Next.js waits for the page's own response either way.
  // Passed down as promises instead: DashboardWithLocalCache renders
  // instantly from its local cache when one exists, and only ever waits on
  // these when there isn't one yet (first visit).
  const [, readingPosition] = await Promise.all([recordAppVisit(profile.id, "el-profesor"), getReadingPosition(profile.id)]);
  const snapshotPromise = getElProfesorDashboardSnapshot();
  const secondaryDataPromise = getElProfesorSecondaryDashboardData();
  const aiConfigPromise = getElProfesorAiConfigData();
  const notionViewDataPromise = getElProfesorNotionViewData();

  return (
    <ToastProvider>
      <DashboardWithLocalCache
        initialSnapshotPromise={snapshotPromise}
        isAdmin={isAdmin}
        realIsAdmin={realIsAdmin}
        previewingAsUser={previewingAsUser}
        serverResumeChapterId={readingPosition?.chapterId ?? null}
        secondaryDataPromise={secondaryDataPromise}
        aiConfigPromise={aiConfigPromise}
        notionViewDataPromise={notionViewDataPromise}
      />
    </ToastProvider>
  );
}
