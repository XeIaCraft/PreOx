import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { getElProfesorNotionsPageData } from "@/lib/el-profesor/sync-data";
import { NotionsPageWithLocalCache } from "@/components/el-profesor/notions-page-with-local-cache";
import { ToastProvider } from "@/components/ui/toast";

/**
 * The notions as they were before book fusion (octobre 2026) — kept, with
 * their syntheses, until the admin decides to delete them. Un-awaited,
 * cache-first (piste 2026-09-24) — see NotionsPageWithLocalCache.
 */
export default async function OldNotionsPage() {
  await requireElProfesorAdmin();

  return (
    <ToastProvider>
      <NotionsPageWithLocalCache initialDataPromise={getElProfesorNotionsPageData()} />
    </ToastProvider>
  );
}
