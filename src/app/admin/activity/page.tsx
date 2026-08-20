import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";

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
};

export default async function AdminActivityPage() {
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from("hub_activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const actorIds = [...new Set((entries ?? []).map((e) => e.actor_id).filter((id): id is string => Boolean(id)))];
  const { data: actors } =
    actorIds.length > 0 ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [] };
  const actorById = new Map((actors ?? []).map((a) => [a.id, a]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif-display text-2xl font-medium text-foreground">Journal d&rsquo;activité</h1>
        <p className="mt-1.5 text-foreground-muted">Actions administratives récentes sur les comptes et les modules du hub.</p>
      </div>

      <Card className="overflow-hidden">
        {(entries ?? []).length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-foreground-subtle">Aucune activité enregistrée pour l&rsquo;instant.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(entries ?? []).map((entry) => {
              const actor = entry.actor_id ? actorById.get(entry.actor_id) : null;
              return (
                <li key={entry.id} className="px-5 py-3 text-sm">
                  <span className="font-medium text-foreground">{actor?.full_name || actor?.email || "Compte supprimé"}</span>{" "}
                  <span className="text-foreground-muted">{ACTION_LABELS[entry.action] ?? entry.action}</span>{" "}
                  {entry.target_label && <span className="font-medium text-foreground">{entry.target_label}</span>}
                  <span className="ml-2 text-xs text-foreground-subtle">
                    {new Date(entry.created_at).toLocaleString("fr-FR")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
