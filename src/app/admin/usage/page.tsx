import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { renderIcon } from "@/lib/icon-map";

export const metadata: Metadata = { title: "Usage & santé" };

const INACTIVE_THRESHOLD_DAYS = 30;

/**
 * Per-module "recent activity" signal, aggregated across every user via the
 * service-role client (an anonymous count, same precedent as the admin-only
 * global flashcard-difficulty stat elsewhere — no individual's data is
 * exposed, just a total). There's no generic activity table, so this is
 * hand-wired per known module slug; a module we don't recognize shows "—"
 * rather than a fabricated number.
 *
 * This page deliberately does NOT claim to track errors or uptime — this
 * app has no error-telemetry system, so a real "dernière erreur" or
 * incident feed isn't something honest to fake. What it does show:
 * configured availability (is_active/status) and a real recent-activity
 * signal, which together answer "is this module actually being used".
 */
async function getRecentActivityCount(slug: string): Promise<number | null> {
  const admin = createAdminClient();
  const since = new Date();
  since.setDate(since.getDate() - 7);

  if (slug === "a-table") {
    const { count } = await admin.from("a_table_history").select("id", { count: "exact", head: true }).gte("cooked_at", since.toISOString());
    return count ?? 0;
  }
  if (slug === "el-profesor") {
    const { count } = await admin.from("el_profesor_review_log").select("id", { count: "exact", head: true }).gte("reviewed_at", since.toISOString());
    return count ?? 0;
  }
  return null;
}

export default async function AdminUsagePage() {
  const supabase = await createClient();

  const { data: apps } = await supabase.from("apps").select("*").order("sort_order", { ascending: true });
  const { data: directAccess } = await supabase.from("user_app_access").select("app_id, user_id");
  const { data: groupAccess } = await supabase.from("user_group_app_access").select("app_id, group_id");
  const { data: groupMembers } = await supabase.from("user_group_members").select("group_id, user_id");

  const groupUsersByGroup = new Map<string, Set<string>>();
  for (const row of groupMembers ?? []) {
    if (!groupUsersByGroup.has(row.group_id)) groupUsersByGroup.set(row.group_id, new Set());
    groupUsersByGroup.get(row.group_id)!.add(row.user_id);
  }

  const usersByApp = new Map<string, Set<string>>();
  for (const row of directAccess ?? []) {
    if (!usersByApp.has(row.app_id)) usersByApp.set(row.app_id, new Set());
    usersByApp.get(row.app_id)!.add(row.user_id);
  }
  for (const row of groupAccess ?? []) {
    const groupUsers = groupUsersByGroup.get(row.group_id);
    if (!groupUsers) continue;
    if (!usersByApp.has(row.app_id)) usersByApp.set(row.app_id, new Set());
    for (const userId of groupUsers) usersByApp.get(row.app_id)!.add(userId);
  }

  const rows = await Promise.all(
    (apps ?? []).map(async (app) => ({
      app,
      grantedUsers: usersByApp.get(app.id)?.size ?? 0,
      recentActivity: await getRecentActivityCount(app.slug),
    }))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif-display text-2xl font-medium text-foreground">Usage &amp; santé</h1>
        <p className="mt-1.5 text-foreground-muted">
          Utilisation réelle de chaque module. Pas de suivi d&rsquo;erreurs applicatives pour l&rsquo;instant — ce tableau montre la
          disponibilité configurée et l&rsquo;activité constatée, pas des incidents.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ app, grantedUsers, recentActivity }) => {
          const isInactive = grantedUsers > 0 && recentActivity === 0;
          return (
            <Card key={app.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-surface-muted text-foreground-muted">
                    {renderIcon(app.icon, "h-4 w-4")}
                  </span>
                  <Badge variant={app.is_active ? "success" : "outline"}>{app.is_active ? "Disponible" : "Désactivé"}</Badge>
                </div>
                <p className="mt-3 font-medium text-foreground">{app.name}</p>
                <p className="text-sm text-foreground-muted">
                  {grantedUsers} utilisateur{grantedUsers > 1 ? "s" : ""} avec accès
                </p>
                <p className="mt-1 text-sm text-foreground-muted">
                  {recentActivity === null ? "Activité non suivie" : `${recentActivity} action${recentActivity > 1 ? "s" : ""} cette semaine`}
                </p>
                {isInactive && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-accent">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Aucune activité récente malgré des accès attribués — module potentiellement inactif depuis plus de{" "}
                    {INACTIVE_THRESHOLD_DAYS} jours.
                  </p>
                )}
                {!isInactive && recentActivity !== null && recentActivity > 0 && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Utilisé activement.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
