import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { ActivityFilters } from "@/components/admin/activity-filters";
import { ActivityLogList, type ActivityEntryView } from "@/components/admin/activity-log-list";

export const metadata: Metadata = { title: "Journal d'activité" };

const ACTION_LABELS: Record<string, string> = {
  invite_user: "a invité",
  update_user_role: "a changé le rôle de",
  delete_user: "a supprimé",
  grant_app_access: "a donné accès à un module à",
  revoke_app_access: "a retiré l'accès à un module à",
  create_app: "a créé le module",
  update_app: "a modifié le module",
  activate_app: "a activé le module",
  deactivate_app: "a désactivé le module",
  create_group: "a créé le groupe",
  delete_group: "a supprimé le groupe",
  grant_group_app_access: "a donné accès à un module au groupe",
  revoke_group_app_access: "a retiré l'accès à un module au groupe",
  preview_user: "a consulté l'aperçu de",
};

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; action?: string; from?: string; to?: string }>;
}) {
  const { actor, action, from, to } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("hub_activity_log").select("*").order("created_at", { ascending: false }).limit(500);
  if (actor) query = query.eq("actor_id", actor);
  if (action) query = query.eq("action", action);
  if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  const { data: entries } = await query;

  const actorIds = [...new Set((entries ?? []).map((e) => e.actor_id).filter((id): id is string => Boolean(id)))];
  const { data: actors } =
    actorIds.length > 0 ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [] };
  const actorById = new Map((actors ?? []).map((a) => [a.id, a]));

  const { data: allActors } = await supabase.from("profiles").select("id, full_name, email").order("full_name");

  const entryViews: ActivityEntryView[] = (entries ?? []).map((entry) => {
    const person = entry.actor_id ? actorById.get(entry.actor_id) : null;
    return {
      id: entry.id,
      actorLabel: person?.full_name || person?.email || "Compte supprimé",
      actionLabel: ACTION_LABELS[entry.action] ?? entry.action,
      targetLabel: entry.target_label,
      createdAt: entry.created_at,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif-display text-2xl font-medium text-foreground">Journal d&rsquo;activité</h1>
        <p className="mt-1.5 text-foreground-muted">Actions administratives récentes sur les comptes et les modules du hub.</p>
      </div>

      <Card className="overflow-hidden">
        <ActivityFilters
          actors={(allActors ?? []).map((a) => ({ id: a.id, label: a.full_name || a.email }))}
          actions={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
          current={{ actor, action, from, to }}
        />
        <ActivityLogList entries={entryViews} />
      </Card>
    </div>
  );
}
