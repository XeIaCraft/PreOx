import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth/dal";
import { ProfileForm } from "@/components/profile/profile-form";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const profile = await requireProfile();

  return (
    <ToastProvider>
      <div className="space-y-8">
        <div>
          <h1 className="font-serif-display text-2xl font-medium text-foreground">Mon profil</h1>
          <p className="mt-1.5 text-foreground-muted">{profile.email}</p>
        </div>

        <ProfileForm profile={profile} />

        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6">
          <h2 className="font-serif-display text-lg font-medium text-foreground">Mot de passe</h2>
          <p className="mt-1 text-sm text-foreground-muted">Choisissez un nouveau mot de passe.</p>
          <div className="mt-4">
            <SetPasswordForm next="/profile" />
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
