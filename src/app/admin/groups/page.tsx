import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { CreateGroupForm } from "@/components/admin/create-group-form";

export const metadata: Metadata = { title: "Groupes" };

export default async function AdminGroupsPage() {
  const supabase = await createClient();

  const [{ data: groups }, { data: memberRows }, { data: accessRows }] = await Promise.all([
    supabase.from("user_groups").select("*").order("created_at", { ascending: false }),
    supabase.from("user_group_members").select("group_id"),
    supabase.from("user_group_app_access").select("group_id"),
  ]);

  const memberCounts = new Map<string, number>();
  for (const row of memberRows ?? []) memberCounts.set(row.group_id, (memberCounts.get(row.group_id) ?? 0) + 1);
  const accessCounts = new Map<string, number>();
  for (const row of accessRows ?? []) accessCounts.set(row.group_id, (accessCounts.get(row.group_id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif-display text-2xl font-medium text-foreground">Groupes</h1>
        <p className="mt-1.5 text-foreground-muted">
          Attribuez l&rsquo;accès à plusieurs modules à un ensemble d&rsquo;utilisateurs d&rsquo;un coup, sans les toucher un par un.
        </p>
      </div>

      <CreateGroupForm />

      <Card className="overflow-hidden">
        {(groups ?? []).length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-foreground-subtle">Aucun groupe pour l&rsquo;instant.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(groups ?? []).map((group) => (
              <li key={group.id}>
                <Link href={`/admin/groups/${group.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-surface-muted/60">
                  <p className="font-medium text-foreground">{group.name}</p>
                  <p className="text-sm text-foreground-subtle">
                    {memberCounts.get(group.id) ?? 0} membre{(memberCounts.get(group.id) ?? 0) > 1 ? "s" : ""} · {accessCounts.get(group.id) ?? 0}{" "}
                    module{(accessCounts.get(group.id) ?? 0) > 1 ? "s" : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
