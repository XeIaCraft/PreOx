import { requireProfile } from "@/lib/auth/dal";
import { HubHeader } from "@/components/hub/hub-header";

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <HubHeader profile={profile} section="Profil" />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
