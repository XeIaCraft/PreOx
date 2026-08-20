import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/auth/dal";
import { getAppsForProfile } from "@/lib/apps";
import { AppCard } from "@/components/hub/app-card";
import { UnifiedSearch } from "@/components/hub/unified-search";

export const metadata: Metadata = { title: "Vos modules" };

export default async function AppsPage() {
  const profile = (await getCurrentProfile())!;
  const apps = await getAppsForProfile(profile);
  const accessibleCount = apps.filter((app) => app.hasAccess).length;
  const hasElProfesor = apps.some((app) => app.slug === "el-profesor" && app.hasAccess);
  const hasATable = apps.some((app) => app.slug === "a-table" && app.hasAccess);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif-display text-2xl font-medium text-foreground sm:text-3xl">
            Bonjour {profile.full_name?.split(" ")[0] || "👋"}
          </h1>
          <p className="mt-1.5 text-foreground-muted">
            {accessibleCount > 0
              ? `Vous avez accès à ${accessibleCount} module${accessibleCount > 1 ? "s" : ""}.`
              : "Aucun module ne vous a encore été attribué — contactez un administrateur."}
          </p>
        </div>
        <UnifiedSearch hasElProfesor={hasElProfesor} hasATable={hasATable} />
      </div>

      {apps.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border-strong p-10 text-center text-foreground-muted">
          Aucun module n&rsquo;a encore été configuré dans le hub.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  );
}
