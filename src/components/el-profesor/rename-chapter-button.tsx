"use client";

import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";

/**
 * Inline rename for a chapter's own title — RenameFicheButton/
 * RenameNotionButton's counterpart, for the chapter card on the dashboard.
 * Local-first (piste 2026-09-24 — "module 100% local"): onRename applies
 * the new title to the board's optimistic state and the local cache, then
 * queues the real write — so this closes the instant it's called, no
 * network wait, works offline. See ElProfesorBoard's handleRenameChapter.
 */
export function RenameChapterButton({
  chapterId,
  currentTitle,
  onRename,
}: {
  chapterId: string;
  currentTitle: string;
  onRename: (chapterId: string, title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentTitle);

  function handleSave() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === currentTitle) {
      setEditing(false);
      return;
    }
    onRename(chapterId, trimmed);
    setEditing(false);
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
          className="rounded-[var(--radius-sm)] border border-border bg-surface px-1.5 py-0.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!value.trim()}
          aria-label="Enregistrer le nouveau titre"
          className="text-success disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => setEditing(false)} aria-label="Annuler le renommage" className="text-foreground-subtle">
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
