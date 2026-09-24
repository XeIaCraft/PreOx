import { getCurrentProfile } from "@/lib/auth/dal";
import { getEffectiveIsAdmin } from "@/lib/el-profesor/preview-mode";

// Server Actions invoked from this page (e.g. suggestBookChapters in
// actions/split-book.ts, which can process up to 2000 pages of a book PDF
// in one Gemini call) run under this page's function duration — the
// platform default is comfortably short for that, so raised explicitly as
// a safety margin.
export const maxDuration = 60;
import { getReadingPosition } from "@/lib/el-profesor/dal";
import { DashboardWithLocalCache } from "@/components/el-profesor/dashboard-with-local-cache";
import { ToastProvider } from "@/components/ui/toast";
import { recordAppVisit } from "@/app/actions/discovery";

export default async function ElProfesorPage() {
  const profile = (await getCurrentProfile())!;
  const realIsAdmin = profile.role === "admin";
  const { effectiveIsAdmin: isAdmin, previewingAsUser } = await getEffectiveIsAdmin(realIsAdmin);

  // Both single cheap indexed lookups (analytics insert, one row by user
  // id). Nothing heavier is computed here any more (piste 2026-09-24):
  // DashboardWithLocalCache renders the whole dashboard from the local cache
  // and only fetches a full snapshot itself when this device has none yet.
  // Starting that snapshot here on every render was pure waste — this
  // render also runs inside every Server Action response on the dashboard
  // (revalidatePath re-renders the current page), so each settings save or
  // admin action paid for a whole-library aggregation nobody displayed.
  const [, readingPosition] = await Promise.all([recordAppVisit(profile.id, "el-profesor"), getReadingPosition(profile.id)]);

  return (
    <ToastProvider>
      <DashboardWithLocalCache
        isAdmin={isAdmin}
        realIsAdmin={realIsAdmin}
        previewingAsUser={previewingAsUser}
        serverResumeChapterId={readingPosition?.chapterId ?? null}
      />
    </ToastProvider>
  );
}
