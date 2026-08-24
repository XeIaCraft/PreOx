"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { proposeManualFlashcard } from "@/app/apps/el-profesor/actions/proposals";
import { useToast } from "@/components/ui/toast";

/** Piste 2026-08-24 ("contributions des utilisateurs") — hand-written flashcard, no AI, no PDF selection required. */
export function ProposeFlashcardDialog({
  subEntityId,
  subEntityName,
  onClose,
  onSubmitted,
}: {
  subEntityId: string;
  subEntityName: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");

  function handleSubmit() {
    startTransition(async () => {
      const result = await proposeManualFlashcard(subEntityId, front, back);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Contribution envoyée.", { variant: "success" });
        onSubmitted();
      }
    });
  }

  return (
    <Modal title="Proposer une flashcard" description={subEntityName} onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="contribution-front">Question</Label>
          <textarea
            id="contribution-front"
            value={front}
            onChange={(e) => setFront(e.target.value)}
            rows={2}
            placeholder="Une question, un moyen mnémotechnique, une précision utile…"
            className="w-full rounded-[var(--radius-sm)] border border-border bg-surface p-2 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contribution-back">Réponse</Label>
          <textarea
            id="contribution-back"
            value={back}
            onChange={(e) => setBack(e.target.value)}
            rows={3}
            className="w-full rounded-[var(--radius-sm)] border border-border bg-surface p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>
        <p className="text-xs text-foreground-subtle">
          Écrite entièrement par vous — pas de génération automatique. Ajoutée en brouillon, un administrateur la relit avant
          publication.
        </p>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isPending || front.trim().length < 5 || back.trim().length < 1}>
          {isPending ? "Envoi…" : "Proposer"}
        </Button>
      </div>
    </Modal>
  );
}
