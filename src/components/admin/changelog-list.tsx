"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteChangelogEntry } from "@/app/actions/changelog";
import type { ChangelogEntryRow } from "@/lib/supabase/types";

export function ChangelogList({ entries }: { entries: ChangelogEntryRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteChangelogEntry(id);
      router.refresh();
    });
  }

  if (entries.length === 0) return <p className="text-sm text-foreground-subtle">Aucune nouveauté publiée.</p>;

  return (
    <ul className="divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-surface">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
          <div>
            <p className="text-sm font-medium text-foreground">{entry.title}</p>
            <p className="text-xs text-foreground-subtle">{new Date(entry.published_at).toLocaleDateString("fr-FR")}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => handleDelete(entry.id)} disabled={isPending} title="Supprimer">
            <Trash2 className="h-4 w-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
