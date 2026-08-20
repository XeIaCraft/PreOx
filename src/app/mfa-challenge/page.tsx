import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form";
import { getCurrentUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Vérification en deux étapes" };

export default async function MfaChallengePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aal || aal.nextLevel !== "aal2" || aal.currentLevel === "aal2") redirect("/apps");

  return (
    <AuthShell title="Vérification en deux étapes" description="Entrez le code généré par votre application d'authentification.">
      <MfaChallengeForm />
    </AuthShell>
  );
}
