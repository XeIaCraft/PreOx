"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <Logo />
      <div>
        <p className="font-serif-display text-2xl font-medium text-foreground">Une erreur est survenue</p>
        <p className="mt-2 text-sm text-foreground-muted">
          Quelque chose s&rsquo;est mal passé. Vous pouvez réessayer ou revenir au hub.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-strong"
        >
          Réessayer
        </button>
        <Link href="/apps" className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground-muted hover:text-foreground">
          Retour au hub
        </Link>
      </div>
    </div>
  );
}
