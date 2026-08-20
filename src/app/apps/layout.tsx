import { requireProfile } from "@/lib/auth/dal";
import { HubHeader } from "@/components/hub/hub-header";
import { AccessChangeListener } from "@/components/hub/access-change-listener";

export default async function AppsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <HubHeader profile={profile} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">{children}</main>
      <AccessChangeListener userId={profile.id} />
    </div>
  );
}
