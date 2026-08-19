import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Définir un mot de passe" };

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await requireUser();
  const { next } = await searchParams;

  return (
    <AuthShell
      title="Choisissez un mot de passe"
      description="Cette étape sécurise votre accès à l'espace PreOx."
    >
      <SetPasswordForm next={next} />
    </AuthShell>
  );
}
