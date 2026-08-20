import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { GroupDetailPanel } from "@/components/admin/group-detail-panel";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: group } = await supabase.from("user_groups").select("name").eq("id", id).single();
  return { title: group?.name ?? "Groupe" };
}

export default async function AdminGroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: group }, { data: users }, { data: apps }, { data: members }, { data: access }] = await Promise.all([
    supabase.from("user_groups").select("*").eq("id", id).single(),
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("apps").select("*").order("sort_order", { ascending: true }),
    supabase.from("user_group_members").select("user_id").eq("group_id", id),
    supabase.from("user_group_app_access").select("app_id").eq("group_id", id),
  ]);

  if (!group) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/groups" className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Retour aux groupes
        </Link>
        <h1 className="mt-3 font-serif-display text-2xl font-medium text-foreground">{group.name}</h1>
      </div>

      <GroupDetailPanel
        group={group}
        users={users ?? []}
        apps={apps ?? []}
        memberUserIds={(members ?? []).map((m) => m.user_id)}
        grantedAppIds={(access ?? []).map((a) => a.app_id)}
      />
    </div>
  );
}
