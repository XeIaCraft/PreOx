"use client";

import { useState, useTransition } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { rateRecipe } from "@/app/apps/a-table/actions/recipes";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { Rating } from "@/lib/a-table/types";

interface RateDialogProps {
  recipeId: string;
  recipeTitle: string;
  pastRatings?: Rating[];
  onClose: () => void;
  onSaved: () => void;
}

export function RateDialog({ recipeId, recipeTitle, pastRatings, onClose, onSaved }: RateDialogProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [liked, setLiked] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");

  function handleSave() {
    if (liked === null) return;
    startTransition(async () => {
      const result = await rateRecipe(recipeId, liked, comment);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onSaved();
        onClose();
      }
    });
  }

  return (
    <Modal title="Alors, c'était bon ?" description={recipeTitle} onClose={onClose} size="sm">
      <div className="flex justify-center gap-4">
        <button
          type="button"
          onClick={() => setLiked(true)}
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full border-2 transition-colors",
            liked === true ? "border-success bg-success-tint text-success" : "border-border text-foreground-subtle"
          )}
        >
          <ThumbsUp className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={() => setLiked(false)}
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full border-2 transition-colors",
            liked === false ? "border-danger bg-danger-tint text-danger" : "border-border text-foreground-subtle"
          )}
        >
          <ThumbsDown className="h-6 w-6" />
        </button>
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Un commentaire ? (optionnel)"
        rows={2}
        className="mt-4 w-full resize-none rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      />

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Passer
        </Button>
        <Button onClick={handleSave} disabled={isPending || liked === null}>
          Enregistrer
        </Button>
      </div>

      {pastRatings && pastRatings.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground-subtle">Historique des retours</p>
          <ul className="max-h-32 space-y-1.5 overflow-y-auto text-sm">
            {[...pastRatings]
              .reverse()
              .map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-foreground-muted">
                  {r.liked ? (
                    <ThumbsUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  ) : (
                    <ThumbsDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                  )}
                  <span>
                    <span className="text-xs text-foreground-subtle">{new Date(r.date).toLocaleDateString("fr-FR")}</span>
                    {r.comment && <> — {r.comment}</>}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
