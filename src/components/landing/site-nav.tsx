import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-foreground-muted md:flex">
          <a href="#concept" className="transition-colors hover:text-foreground">
            Le concept
          </a>
          <a href="#modules" className="transition-colors hover:text-foreground">
            Modules
          </a>
          <a href="#fonctionnement" className="transition-colors hover:text-foreground">
            Fonctionnement
          </a>
        </nav>

        <Link href="/login">
          <Button size="sm">Se connecter</Button>
        </Link>
      </div>
    </header>
  );
}
