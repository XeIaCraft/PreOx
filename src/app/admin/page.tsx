import type { Metadata } from "next";
import Link from "next/link";
import { Users, ShieldCheck, Boxes, KeyRound, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Vue d'ensemble" };

export default async function AdminOverviewPage() {
  const supabase = await createClient();

  const [{ count: userCount }, { count: adminCount }, { count: appCount }, { count: accessCount }] =
    await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "admin"),
      supabase.from("apps").select("*", { count: "exact", head: true }),
      supabase.from("user_app_access").select("*", { count: "exact", head: true }),
    ]);

  const { data: recentUsers } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  const stats = [
    { label: "Utilisateurs", value: userCount ?? 0, icon: Users },
    { label: "Administrateurs", value: adminCount ?? 0, icon: ShieldCheck },
    { label: "Modules configurés", value: appCount ?? 0, icon: Boxes },
    { label: "Accès attribués", value: accessCount ?? 0, icon: KeyRound },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif-display text-2xl font-medium text-foreground">Vue d&rsquo;ensemble</h1>
        <p className="mt-1.5 text-foreground-muted">
          État actuel du hub : utilisateurs, modules et attributions d&rsquo;accès.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <stat.icon className="h-5 w-5 text-primary-strong" />
              <p className="mt-3 text-2xl font-semibold text-foreground">{stat.value}</p>
              <p className="text-sm text-foreground-muted">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-foreground">Derniers utilisateurs</h2>
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-1 text-sm text-primary-strong hover:underline"
            >
              Tout voir <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <ul className="mt-4 divide-y divide-border">
            {(recentUsers ?? []).map((user) => (
              <li key={user.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{user.full_name || user.email}</p>
                  <p className="text-xs text-foreground-subtle">{user.email}</p>
                </div>
                <span className="text-xs text-foreground-subtle">
                  {new Date(user.created_at).toLocaleDateString("fr-FR")}
                </span>
              </li>
            ))}
            {(recentUsers ?? []).length === 0 && (
              <li className="py-3 text-sm text-foreground-subtle">Aucun utilisateur pour l&rsquo;instant.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
