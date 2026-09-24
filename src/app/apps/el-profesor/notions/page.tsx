import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { getElProfesorNotionsPageData } from "@/app/apps/el-profesor/actions/offline-sync";
import { NotionsPageWithLocalCache } from "@/components/el-profesor/notions-page-with-local-cache";
import { ToastProvider } from "@/components/ui/toast";

/** Un-awaited, cache-first (piste 2026-09-24 — "module 100% local") — see NotionsPageWithLocalCache. */
export default async function NotionsPage() {
  await requireElProfesorAdmin();

  return (
    <ToastProvider>
      <NotionsPageWithLocalCache initialDataPromise={getElProfesorNotionsPageData()} />
    </ToastProvider>
  );
}
