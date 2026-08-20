import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ChangelogForm } from "@/components/admin/changelog-form";
import { ChangelogList } from "@/components/admin/changelog-list";

export const metadata: Metadata = { title: "Nouveautés" };

export default async function AdminChangelogPage() {
  const supabase = await createClient();
  const [{ data: entries }, { data: apps }] = await Promise.all([
    supabase.from("changelog_entries").select("*").order("published_at", { ascending: false }),
    supabase.from("apps").select("*").order("sort_order", { ascending: true }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif-display text-2xl font-medium text-foreground">Nouveautés</h1>
        <p className="mt-1.5 text-foreground-muted">Publiez ce qui a changé — visible par tous les utilisateurs sur /apps/nouveautes.</p>
      </div>

      <ChangelogForm apps={apps ?? []} />
      <ChangelogList entries={entries ?? []} />
    </div>
  );
}
