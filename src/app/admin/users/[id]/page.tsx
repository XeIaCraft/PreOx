import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/dal";
import { UserDetailPanel } from "@/components/admin/user-detail-panel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: user } = await supabase.from("profiles").select("full_name, email").eq("id", id).single();
  return { title: user?.full_name || user?.email || "Utilisateur" };
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = await requireAdmin();
  const supabase = await createClient();

  const [{ data: user }, { data: apps }, { data: access }, { data: groupMemberships }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).single(),
    supabase.from("apps").select("*").order("sort_order", { ascending: true }),
    supabase.from("user_app_access").select("app_id").eq("user_id", id),
    supabase.from("user_group_members").select("group_id, user_groups(id, name)").eq("user_id", id),
  ]);

  if (!user) notFound();

  const groupIds = (groupMemberships ?? []).map((g) => g.group_id);
  const { data: groupAccessRows } =
    groupIds.length > 0 ? await supabase.from("user_group_app_access").select("app_id, group_id").in("group_id", groupIds) : { data: [] };

  const groupById = new Map((groupMemberships ?? []).map((g) => [g.group_id, (g.user_groups as unknown as { name: string } | null)?.name ?? "groupe"]));
  const appIdToGroupNames: Record<string, string[]> = {};
  for (const row of groupAccessRows ?? []) {
    (appIdToGroupNames[row.app_id] ??= []).push(groupById.get(row.group_id) ?? "groupe");
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux utilisateurs
        </Link>
        <h1 className="mt-3 font-serif-display text-2xl font-medium text-foreground">
          {user.full_name || user.email}
        </h1>
        <p className="text-foreground-subtle">{user.email}</p>
      </div>

      <UserDetailPanel
        user={user}
        apps={apps ?? []}
        grantedAppIds={(access ?? []).map((row) => row.app_id)}
        groupGrantedAppNames={appIdToGroupNames}
        isSelf={admin.id === user.id}
      />
    </div>
  );
}
