"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { renameFiche } from "@/app/apps/el-profesor/actions/extraction";
import { useToast } from "@/components/ui/toast";

/**
 * Small inline rename control for a fiche's title (requested 2026-08-26,
 * for both the chapter admin-review screen and every notion-grouped fiche
 * listing) — a pencil icon that turns the title into an editable field in
 * place, rather than a separate dialog, since renaming is a quick one-field
 * edit that doesn't need its own modal.
 */
export function RenameFicheButton({ ficheId, currentTitle, onRenamed }: { ficheId: string; currentTitle: string; onRenamed: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentTitle);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed === currentTitle) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const result = await renameFiche(ficheId, trimmed);
      if (result.error) {
        toast(result.error, { variant: "error" });
        return;
      }
      setEditing(false);
      onRenamed();
    });
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setEditing(false);
          }}
          disabled={isPending}
          className="rounded-[var(--radius-sm)] border border-border bg-surface px-1.5 py-0.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !value.trim()}
          aria-label="Enregistrer le nouveau titre"
          className="text-success disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={isPending} aria-label="Annuler le renommage" className="text-foreground-subtle">
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setValue(currentTitle);
        setEditing(true);
      }}
      aria-label="Renommer cette fiche"
      title="Renommer"
      className="shrink-0 text-foreground-subtle hover:text-primary-strong"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  );
}
