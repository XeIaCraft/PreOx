"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { updateFlashcard, deleteFlashcard } from "@/app/apps/el-profesor/actions/extraction";
import { FlagsList } from "@/components/el-profesor/flags-list";
import { EditableCitations } from "@/components/el-profesor/editable-citations";
import { useToast } from "@/components/ui/toast";
import type { Citation, Flag, Flashcard } from "@/lib/el-profesor/types";

export function FlashcardEditor({
  flashcard,
  onChanged,
  onCitationClick,
  flags,
}: {
  flashcard: Flashcard;
  onChanged: () => void;
  onCitationClick?: (c: Citation) => void;
  flags?: Flag[];
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [front, setFront] = useState(flashcard.front.text);
  const [back, setBack] = useState(flashcard.back.text);
  const [citations, setCitations] = useState(flashcard.citations);

  function handleSave() {
    startTransition(async () => {
      const result = await updateFlashcard(flashcard.id, { front: { text: front }, back: { text: back }, citations });
      if (result.error) toast(result.error, { variant: "error" });
      else onChanged();
    });
  }

  function handleDelete() {
    if (!confirm("Supprimer cette flashcard ?")) return;
    startTransition(async () => {
      const result = await deleteFlashcard(flashcard.id);
      if (result.error) toast(result.error, { variant: "error" });
      else onChanged();
    });
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Flashcard</span>
        <div className="flex gap-1.5">
          {flashcard.status === "draft" && <Badge variant="neutral">Brouillon</Badge>}
          {flashcard.needsReview && <Badge variant="accent">À vérifier</Badge>}
        </div>
      </div>
      <div className="mt-2 space-y-2">
        <textarea
          value={front}
          onChange={(e) => setFront(e.target.value)}
          rows={2}
          placeholder="Recto (question)"
          className="w-full rounded-[var(--radius-sm)] border border-border bg-surface p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
        <textarea
          value={back}
          onChange={(e) => setBack(e.target.value)}
          rows={2}
          placeholder="Verso (réponse)"
          className="w-full rounded-[var(--radius-sm)] border border-border bg-surface p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </div>

      <FlagsList flags={flags} onResolved={onChanged} />

      <EditableCitations citations={citations} onChange={setCitations} onCitationClick={onCitationClick} />
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={handleDelete} disabled={isPending}>
          <Trash2 className="h-3.5 w-3.5" /> Supprimer
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
