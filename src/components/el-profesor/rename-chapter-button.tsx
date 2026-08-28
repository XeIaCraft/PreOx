"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { renameChapter } from "@/app/apps/el-profesor/actions/library";
import { useToast } from "@/components/ui/toast";

/** Inline rename for a chapter's own title — RenameFicheButton/RenameNotionButton's counterpart, for the chapter card on the dashboard. */
export function RenameChapterButton({ chapterId, currentTitle, onRenamed }: { chapterId: string; currentTitle: string; onRenamed: () => void }) {
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
      const result = await renameChapter(chapterId, trimmed);
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
      aria-label="Renommer ce chapitre"
      title="Renommer"
      className="shrink-0 text-foreground-subtle hover:text-primary-strong"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  );
}
