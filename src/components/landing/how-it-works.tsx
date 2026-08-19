import { UserPlus, KeyRound, LayoutGrid } from "lucide-react";

const STEPS = [
  {
    icon: UserPlus,
    title: "Un compte créé pour vous",
    description:
      "Aucune inscription libre : un administrateur crée votre compte et vous envoie une invitation par e-mail.",
  },
  {
    icon: KeyRound,
    title: "Des accès attribués",
    description:
      "L'administrateur choisit précisément les modules auxquels vous avez droit, selon votre rôle.",
  },
  {
    icon: LayoutGrid,
    title: "Votre espace, à vous",
    description:
      "Une fois connecté·e, vous retrouvez uniquement les outils qui vous concernent — rien de superflu.",
  },
];

export function HowItWorks() {
  return (
    <section id="fonctionnement" className="border-t border-border bg-surface-muted/40 py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-strong">
            Fonctionnement
          </p>
          <h2 className="mt-3 text-balance font-serif-display text-3xl font-medium text-foreground sm:text-4xl">
            Un accès pensé pour rester simple
          </h2>
        </div>

        <div className="relative mt-14 grid grid-cols-1 gap-10 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title} className="relative text-center sm:text-left">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface text-primary-strong sm:mx-0">
                <step.icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                Étape {index + 1}
              </p>
              <h3 className="mt-1 font-medium text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm text-foreground-muted">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
