import { requireProfile } from "@/lib/auth/dal";
import { getAppsForProfile } from "@/lib/apps";
import { HubHeader } from "@/components/hub/hub-header";
import { AccessChangeListener } from "@/components/hub/access-change-listener";
import { CommandPalette } from "@/components/hub/command-palette";
import { FeedbackWidget } from "@/components/hub/feedback-widget";
import { HubRuntime } from "@/components/hub/hub-runtime";
import { listRecentApps } from "@/app/actions/discovery";

export default async function AppsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const apps = await getAppsForProfile(profile);
  const recent = await listRecentApps(2);
  const prefetchIds = new Set([...profile.pinned_app_ids, ...recent.map((r) => r.appId)]);
  const prefetchHrefs = apps.filter((a) => a.hasAccess && prefetchIds.has(a.id)).map((a) => `/apps/${a.slug}`);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <HubHeader profile={profile} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">{children}</main>
      <AccessChangeListener userId={profile.id} />
      <CommandPalette apps={apps} isAdmin={profile.role === "admin"} />
      <FeedbackWidget />
      <HubRuntime prefetchHrefs={prefetchHrefs} />
    </div>
  );
}
