import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
        <h2 className="text-balance font-serif-display text-3xl font-medium text-foreground sm:text-4xl">
          Votre espace PreOx vous attend
        </h2>
        <p className="mx-auto mt-4 max-w-md text-balance text-foreground-muted">
          Connectez-vous pour retrouver les modules qui vous ont été attribués.
        </p>
        <div className="mt-8">
          <Link href="/login">
            <Button size="lg">
              Se connecter
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
