import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Retours utilisateurs" };

export default async function AdminFeedbackPage() {
  const supabase = await createClient();
  const { data: reports } = await supabase.from("feedback_reports").select("*").order("created_at", { ascending: false }).limit(100);

  const userIds = [...new Set((reports ?? []).map((r) => r.user_id))];
  const { data: users } = userIds.length > 0 ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds) : { data: [] };
  const userById = new Map((users ?? []).map((u) => [u.id, u]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif-display text-2xl font-medium text-foreground">Retours utilisateurs</h1>
        <p className="mt-1.5 text-foreground-muted">Signalements envoyés depuis le widget de retour.</p>
      </div>

      <Card className="overflow-hidden">
        {(reports ?? []).length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-foreground-subtle">Aucun retour pour l&rsquo;instant.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(reports ?? []).map((report) => {
              const user = userById.get(report.user_id);
              return (
                <li key={report.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">{user?.full_name || user?.email || "Utilisateur supprimé"}</span>
                    <span className="text-xs text-foreground-subtle">{new Date(report.created_at).toLocaleString("fr-FR")}</span>
                  </div>
                  <p className="mt-1 text-sm text-foreground-muted">{report.message}</p>
                  {report.page_url && <p className="mt-1 text-xs text-foreground-subtle">Page : {report.page_url}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
