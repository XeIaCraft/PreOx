import Link from "next/link";
import { Logo } from "@/components/logo";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 sm:flex-row sm:justify-between sm:px-6">
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <Logo />
          <p className="text-sm text-foreground-subtle">Hub applicatif privé.</p>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-foreground-muted">
          <Link href="/login" className="hover:text-foreground">
            Connexion
          </Link>
          <Link href="/admin" className="text-foreground-subtle hover:text-foreground">
            Accès administrateur
          </Link>
        </nav>
      </div>
      <p className="mt-8 text-center text-xs text-foreground-subtle">© {year} PreOx. Tous droits réservés.</p>
    </footer>
  );
}
