import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/dal";
import { getAppsForProfile } from "@/lib/apps";
import { AppCard } from "@/components/hub/app-card";
import { UnifiedSearch } from "@/components/hub/unified-search";
import { listRecentApps } from "@/app/actions/discovery";
import { createClient } from "@/lib/supabase/server";
import { renderIcon } from "@/lib/icon-map";
import { Clock, ListChecks, GraduationCap, AlertTriangle, ShieldAlert } from "lucide-react";

export const metadata: Metadata = { title: "Vos modules" };

export default async function AppsPage() {
  const profile = (await getCurrentProfile())!;
  const apps = await getAppsForProfile(profile);
  const accessibleCount = apps.filter((app) => app.hasAccess).length;
  const hasElProfesor = apps.some((app) => app.slug === "el-profesor" && app.hasAccess);
  const hasATable = apps.some((app) => app.slug === "a-table" && app.hasAccess);

  const pinnedIds = new Set(profile.pinned_app_ids);
  const sortedApps = [...apps].sort((a, b) => {
    const aPinned = pinnedIds.has(a.id) ? 0 : 1;
    const bPinned = pinnedIds.has(b.id) ? 0 : 1;
    return aPinned - bPinned;
  });

  const supabase = await createClient();
  const [recent, changelogResult] = await Promise.all([
    listRecentApps(4),
    supabase.from("changelog_entries").select("*").order("published_at", { ascending: false }).limit(3),
  ]);
  const recentApps = recent.map((r) => apps.find((a) => a.id === r.appId)).filter((a): a is (typeof apps)[number] => Boolean(a && a.hasAccess));
  const changelog = changelogResult.data ?? [];

  const isAdmin = profile.role === "admin";
  const now = new Date();
  const soon = new Date();
  soon.setDate(soon.getDate() + 2);
  const [{ count: dueCount }, { count: expiringCount }, { count: openFlagsCount }] = await Promise.all([
    hasElProfesor
      ? supabase.from("el_profesor_review_state").select("id", { count: "exact", head: true }).eq("user_id", profile.id).lte("due", now.toISOString())
      : Promise.resolve({ count: 0 }),
    hasATable
      ? supabase
          .from("a_table_temporary_ingredients")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .neq("date_limit", "")
          .lte("date_limit", soon.toISOString().slice(0, 10))
      : Promise.resolve({ count: 0 }),
    isAdmin ? supabase.from("el_profesor_flags").select("id", { count: "exact", head: true }).eq("status", "open") : Promise.resolve({ count: 0 }),
  ]);

  const todoItems = [
    dueCount ? { key: "due", icon: <GraduationCap className="h-3.5 w-3.5" />, label: `${dueCount} carte${dueCount > 1 ? "s" : ""} à réviser`, href: "/apps/el-profesor" } : null,
    expiringCount
      ? { key: "expiring", icon: <AlertTriangle className="h-3.5 w-3.5" />, label: `${expiringCount} aliment${expiringCount > 1 ? "s" : ""} à utiliser vite`, href: "/apps/a-table" }
      : null,
    openFlagsCount
      ? { key: "flags", icon: <ShieldAlert className="h-3.5 w-3.5" />, label: `${openFlagsCount} signalement${openFlagsCount > 1 ? "s" : ""} à traiter`, href: "/apps/el-profesor" }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

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

      {todoItems.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground-muted">
            <ListChecks className="h-3.5 w-3.5" /> À traiter
          </p>
          <div className="flex flex-wrap gap-2">
            {todoItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="flex items-center gap-2 rounded-full border border-accent/30 bg-accent-tint px-3 py-1.5 text-sm text-accent hover:border-accent/50"
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {changelog.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface-muted/50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Nouveautés</p>
            <Link href="/apps/nouveautes" className="text-xs text-primary-strong hover:underline">
              Tout voir
            </Link>
          </div>
          <ul className="mt-2 space-y-1.5">
            {changelog.map((entry) => (
              <li key={entry.id} className="text-sm">
                <span className="font-medium text-foreground">{entry.title}</span>{" "}
                <span className="text-foreground-subtle">
                  — {new Date(entry.published_at).toLocaleDateString("fr-FR")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recentApps.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground-muted">
            <Clock className="h-3.5 w-3.5" /> Récemment consulté
          </p>
          <div className="flex flex-wrap gap-2">
            {recentApps.map((app) => (
              <Link
                key={app.id}
                href={`/apps/${app.slug}`}
                className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-foreground-muted hover:border-primary/30 hover:text-foreground"
              >
                {renderIcon(app.icon, "h-3.5 w-3.5")}
                {app.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {apps.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border-strong p-10 text-center text-foreground-muted">
          Aucun module n&rsquo;a encore été configuré dans le hub.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedApps.map((app) => (
            <AppCard key={app.id} app={app} pinned={pinnedIds.has(app.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
