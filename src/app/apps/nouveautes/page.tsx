import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { renderIcon } from "@/lib/icon-map";

export const metadata: Metadata = { title: "Nouveautés" };

export default async function ChangelogPage() {
  const supabase = await createClient();
  const { data: entries } = await supabase.from("changelog_entries").select("*, apps(name, icon)").order("published_at", { ascending: false }).limit(50);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-serif-display text-2xl font-medium text-foreground">Nouveautés</h1>
        <p className="mt-1.5 text-foreground-muted">Ce qui a changé récemment dans PreOx.</p>
      </div>

      {(entries ?? []).length === 0 ? (
        <p className="text-sm text-foreground-subtle">Rien à annoncer pour l&rsquo;instant.</p>
      ) : (
        <ul className="space-y-4">
          {(entries ?? []).map((entry) => {
            const app = entry.apps as unknown as { name: string; icon: string } | null;
            return (
              <li key={entry.id} className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
                <div className="flex items-center gap-2 text-xs text-foreground-subtle">
                  {app && (
                    <span className="flex items-center gap-1">
                      {renderIcon(app.icon, "h-3.5 w-3.5")}
                      {app.name}
                    </span>
                  )}
                  <span>{new Date(entry.published_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>
                </div>
                <h2 className="mt-1.5 font-serif-display text-lg font-medium text-foreground">{entry.title}</h2>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground-muted">{entry.body}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
