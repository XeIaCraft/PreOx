import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { renderIcon } from "@/lib/icon-map";
import { Badge } from "@/components/ui/badge";
import type { AppModule } from "@/lib/supabase/types";

const FALLBACK_MODULES: Pick<AppModule, "id" | "name" | "description" | "icon" | "status">[] = [
  {
    id: "fallback-0",
    name: "À table",
    description: "Organisez repas et recettes, sans y penser.",
    icon: "utensils",
    status: "coming_soon",
  },
  {
    id: "fallback-1",
    name: "Cas cliniques",
    description: "Des situations pratiques pour raisonner et s'entraîner.",
    icon: "stethoscope",
    status: "coming_soon",
  },
  {
    id: "fallback-2",
    name: "Fiches",
    description: "Des synthèses claires, organisées et faciles à consulter.",
    icon: "file-text",
    status: "coming_soon",
  },
  {
    id: "fallback-3",
    name: "Checklists",
    description: "Des protocoles étape par étape pour ne rien oublier.",
    icon: "clipboard-check",
    status: "coming_soon",
  },
  {
    id: "fallback-4",
    name: "Révision",
    description: "Des parcours de révision structurés et progressifs.",
    icon: "graduation-cap",
    status: "coming_soon",
  },
  {
    id: "fallback-5",
    name: "Outils spécialisés",
    description: "Des utilitaires ciblés pour des besoins spécifiques.",
    icon: "flask-conical",
    status: "coming_soon",
  },
];

async function getPublishedModules() {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("apps")
      .select("id, name, description, icon, status")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    return data;
  } catch {
    // Supabase not configured yet, or momentarily unreachable — the public
    // landing page still renders with representative module content.
    return null;
  }
}

export async function ModulesSection() {
  const data = await getPublishedModules();
  const modules = data && data.length > 0 ? data : FALLBACK_MODULES;

  return (
    <section id="modules" className="py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-strong">Modules</p>
          <h2 className="mt-3 text-balance font-serif-display text-3xl font-medium text-foreground sm:text-4xl">
            Les futurs outils du hub
          </h2>
          <p className="mt-4 text-balance text-foreground-muted">
            Voici les modules déjà prévus pour PreOx. Chacun sera activable indépendamment selon
            le profil de chaque utilisateur.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((mod) => {
            return (
              <div
                key={mod.id}
                className="group relative flex flex-col rounded-[var(--radius-lg)] border border-border bg-surface p-6 transition-colors hover:border-primary/30"
              >
                <div className="flex items-start justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-primary-tint text-primary-strong">
                    {renderIcon(mod.icon, "h-5 w-5")}
                  </span>
                  <Lock className="h-4 w-4 text-foreground-subtle" />
                </div>
                <h3 className="mt-4 font-medium text-foreground">{mod.name}</h3>
                <p className="mt-1.5 text-sm text-foreground-subtle">{mod.description}</p>
                <div className="mt-4">
                  <Badge variant={mod.status === "available" ? "success" : "accent"}>
                    {mod.status === "available" ? "Disponible" : "Bientôt disponible"}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
