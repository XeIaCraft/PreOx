import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HubGraphic } from "@/components/landing/hub-graphic";

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

      <div className="mx-auto max-w-3xl px-4 pb-6 pt-24 text-center sm:px-6 sm:pt-32">
        <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-foreground-muted shadow-sm">
          <Sparkles className="h-3.5 w-3.5 text-primary-strong" />
          Hub applicatif privé
        </div>

        <h1
          className="animate-fade-up mt-6 text-balance font-serif-display text-4xl font-medium leading-[1.1] text-foreground sm:text-5xl md:text-6xl"
          style={{ animationDelay: "60ms" }}
        >
          Votre espace PreOx
        </h1>

        <p className="animate-fade-up mx-auto mt-5 max-w-sm text-balance text-lg text-foreground-muted" style={{ animationDelay: "120ms" }}>
          Connectez-vous pour retrouver vos outils.
        </p>

        <div className="animate-fade-up mt-9" style={{ animationDelay: "180ms" }}>
          <Link href="/login">
            <Button size="lg">
              Se connecter
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <HubGraphic />
      </div>
    </section>
  );
}
