import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] [background:radial-gradient(55%_60%_at_50%_-10%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-24 -z-10 h-72 w-72 rounded-full opacity-40 blur-3xl [background:var(--accent-tint)]"
      />

      <div className="mx-auto max-w-4xl px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-28">
        <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-foreground-muted shadow-sm">
          <Sparkles className="h-3.5 w-3.5 text-primary-strong" />
          Hub applicatif privé
        </div>

        <h1 className="animate-fade-up mt-6 text-balance font-serif-display text-4xl font-medium leading-[1.1] text-foreground sm:text-5xl md:text-6xl" style={{ animationDelay: "60ms" }}>
          Un espace central pour vos outils métiers
        </h1>

        <p className="animate-fade-up mx-auto mt-6 max-w-xl text-balance text-lg text-foreground-muted" style={{ animationDelay: "120ms" }}>
          PreOx réunit vos applications dans une plateforme unique. Chaque personne se connecte
          une fois et retrouve uniquement les modules auxquels elle a accès.
        </p>

        <div className="animate-fade-up mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row" style={{ animationDelay: "180ms" }}>
          <Link href="/login">
            <Button size="lg">
              Se connecter
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <a href="#concept">
            <Button variant="secondary" size="lg">
              Découvrir le concept
            </Button>
          </a>
        </div>

        <dl className="animate-fade-up mx-auto mt-16 grid max-w-2xl grid-cols-3 divide-x divide-border border-y border-border py-6 text-left" style={{ animationDelay: "240ms" }}>
          <div className="px-4 first:pl-0 last:pr-0 sm:px-6">
            <dt className="text-xs uppercase tracking-wide text-foreground-subtle">Accès</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">Par profil &amp; par module</dd>
          </div>
          <div className="px-4 sm:px-6">
            <dt className="text-xs uppercase tracking-wide text-foreground-subtle">Comptes</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">Créés par un administrateur</dd>
          </div>
          <div className="px-4 last:pr-0 sm:px-6">
            <dt className="text-xs uppercase tracking-wide text-foreground-subtle">Infrastructure</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">Supabase &amp; Vercel</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
