"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select, Label } from "@/components/ui/input";
import { proposeFromSelection } from "@/app/apps/el-profesor/actions/proposals";
import { useToast } from "@/components/ui/toast";
import type { PdfSelection } from "@/components/el-profesor/pdf-viewer";

export function ProposeFromSelectionDialog({
  chapterId,
  chapterTitle,
  subEntities,
  selection,
  onClose,
  onSubmitted,
}: {
  chapterId: string;
  chapterTitle: string;
  subEntities: { id: string; name: string }[];
  selection: PdfSelection;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [subEntityId, setSubEntityId] = useState(subEntities[0]?.id ?? "");
  const [quote, setQuote] = useState(selection.quote);

  function handleSubmit() {
    if (!subEntityId) return;
    startTransition(async () => {
      const result = await proposeFromSelection(chapterId, subEntityId, chapterTitle, selection.page, quote);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Proposition envoyée.", { variant: "success" });
        onSubmitted();
      }
    });
  }

  return (
    <Modal title="Compléter à partir de ce passage" description={`Page ${selection.page}`} onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="proposal-quote">Passage sélectionné</Label>
          <textarea
            id="proposal-quote"
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            rows={4}
            className="w-full rounded-[var(--radius-sm)] border border-border bg-surface p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          <p className="text-xs text-foreground-subtle">Corrige-le si la sélection a pris un peu de texte en trop ou en moins.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="proposal-sub-entity">Concerne</Label>
          <Select id="proposal-sub-entity" value={subEntityId} onChange={(e) => setSubEntityId(e.target.value)}>
            {subEntities.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>

        <p className="text-xs text-foreground-subtle">
          Un bloc de fiche (et une flashcard si le passage s&apos;y prête) sera généré à partir de ce texte exact, puis mis en brouillon
          en attendant la relecture d&apos;un administrateur.
        </p>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isPending || !subEntityId || quote.trim().length < 10}>
          {isPending ? "Génération…" : "Générer"}
        </Button>
      </div>
    </Modal>
  );
}
