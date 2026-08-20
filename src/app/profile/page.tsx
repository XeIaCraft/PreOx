import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth/dal";
import { ProfileForm } from "@/components/profile/profile-form";
import { AccountDataSection } from "@/components/profile/account-data-section";
import { SessionsSection } from "@/components/profile/sessions-section";
import { MfaSection } from "@/components/profile/mfa-section";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { ToastProvider } from "@/components/ui/toast";
import { listMySessions, listMyLoginHistory } from "@/app/actions/security";
import { listMfaFactors } from "@/app/actions/mfa";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const profile = await requireProfile();
  const [sessions, history, mfaFactors] = await Promise.all([listMySessions(), listMyLoginHistory(), listMfaFactors()]);

  return (
    <ToastProvider>
      <div className="space-y-8">
        <div>
          <Link href="/apps" className="mb-3 inline-flex items-center gap-1.5 text-sm text-foreground-subtle hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour aux modules
          </Link>
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

        <MfaSection factors={mfaFactors} />

        <SessionsSection sessions={sessions} history={history} />

        <AccountDataSection />
      </div>
    </ToastProvider>
  );
}
