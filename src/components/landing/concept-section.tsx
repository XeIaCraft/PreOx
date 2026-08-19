import { LayoutGrid, ShieldCheck, TrendingUp } from "lucide-react";

const PILLARS = [
  {
    icon: LayoutGrid,
    title: "Un point d'entrée unique",
    description:
      "Une seule connexion donne accès à l'ensemble de vos outils, réunis dans un espace cohérent et sobre.",
  },
  {
    icon: ShieldCheck,
    title: "Des accès maîtrisés",
    description:
      "Chaque module est activable individuellement, par utilisateur. Ce qui n'est pas autorisé reste invisible ou verrouillé.",
  },
  {
    icon: TrendingUp,
    title: "Pensé pour grandir",
    description:
      "La structure du hub accueille de nouveaux modules au fil du temps, sans remettre en question les fondations.",
  },
];

export function ConceptSection() {
  return (
    <section id="concept" className="border-t border-border bg-surface-muted/40 py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-strong">
            Le concept
          </p>
          <h2 className="mt-3 text-balance font-serif-display text-3xl font-medium text-foreground sm:text-4xl">
            Un hub, pas une application de plus
          </h2>
          <p className="mt-4 text-balance text-foreground-muted">
            PreOx n&rsquo;est pas un outil isolé : c&rsquo;est la plateforme centrale qui organise l&rsquo;accès
            à tous vos futurs outils métiers, avec une gestion des droits pensée dès le départ.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {PILLARS.map((pillar) => (
            <div
              key={pillar.title}
              className="rounded-[var(--radius-lg)] border border-border bg-surface p-6"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-primary-tint text-primary-strong">
                <pillar.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-medium text-foreground">{pillar.title}</h3>
              <p className="mt-2 text-sm text-foreground-muted">{pillar.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
