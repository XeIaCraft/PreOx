import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <AuthShell
      title="Bon retour"
      description="Connectez-vous pour accéder à votre espace PreOx."
      footer={
        <Link href="/" className="hover:text-foreground">
          ← Retour à l&rsquo;accueil
        </Link>
      }
    >
      <LoginForm next={next} />
    </AuthShell>
  );
}
