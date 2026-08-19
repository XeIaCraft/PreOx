import { requireAdmin } from "@/lib/auth/dal";
import { HubHeader } from "@/components/hub/hub-header";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <HubHeader profile={profile} section="Administration" />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:flex-row">
        <aside className="lg:w-56 lg:shrink-0">
          <AdminNav />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
