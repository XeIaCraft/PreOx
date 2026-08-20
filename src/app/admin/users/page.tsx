import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Utilisateurs" };

export default async function AdminUsersPage() {
  const supabase = await createClient();

  const { data: users } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: accessRows } = await supabase.from("user_app_access").select("user_id");
  const accessCounts = new Map<string, number>();
  (accessRows ?? []).forEach((row) => {
    accessCounts.set(row.user_id, (accessCounts.get(row.user_id) ?? 0) + 1);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-2xl font-medium text-foreground">Utilisateurs</h1>
          <p className="mt-1.5 text-foreground-muted">
            {users?.length ?? 0} compte{(users?.length ?? 0) > 1 ? "s" : ""} sur le hub.
          </p>
        </div>
        <Link href="/admin/users/new">
          <Button>
            <Plus className="h-4 w-4" />
            Inviter un utilisateur
          </Button>
        </Link>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-subtle">
              <tr>
                <th className="px-5 py-3 font-medium">Utilisateur</th>
                <th className="px-5 py-3 font-medium">Rôle</th>
                <th className="px-5 py-3 font-medium">Modules</th>
                <th className="px-5 py-3 font-medium">Inscrit le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(users ?? []).map((user) => (
                <tr key={user.id} className="transition-colors hover:bg-surface-muted/60">
                  <td className="px-5 py-[var(--row-py)]">
                    <Link href={`/admin/users/${user.id}`} className="block">
                      <p className="font-medium text-foreground">{user.full_name || "—"}</p>
                      <p className="text-xs text-foreground-subtle">{user.email}</p>
                    </Link>
                  </td>
                  <td className="px-5 py-[var(--row-py)]">
                    <Badge variant={user.role === "admin" ? "accent" : "neutral"}>
                      {user.role === "admin" ? "Administrateur" : "Utilisateur"}
                    </Badge>
                  </td>
                  <td className="px-5 py-[var(--row-py)] text-foreground-muted">
                    {accessCounts.get(user.id) ?? 0}
                  </td>
                  <td className="px-5 py-[var(--row-py)] text-foreground-subtle">
                    {new Date(user.created_at).toLocaleDateString("fr-FR")}
                  </td>
                </tr>
              ))}
              {(users ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-foreground-subtle">
                    Aucun utilisateur pour l&rsquo;instant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
