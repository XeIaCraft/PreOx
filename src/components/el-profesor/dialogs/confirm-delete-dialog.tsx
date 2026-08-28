"use client";

import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export function ConfirmDeleteDialog({
  title,
  itemName,
  introText,
  consequences,
  confirmLabel = "Supprimer définitivement",
  pendingLabel = "Suppression…",
  isPending,
  onConfirm,
  onClose,
}: {
  title: string;
  itemName: string;
  /** Overrides the default "« {itemName} » va être supprimé définitivement, avec :" sentence — for a confirmation that isn't literally deleting itemName itself (e.g. wiping a chapter's content but keeping the chapter). */
  introText?: string;
  consequences: string[];
  /** Confirm button label when idle. Defaults to "Supprimer définitivement" — override for a non-deletion destructive action. */
  confirmLabel?: string;
  /** Confirm button label while pending. Defaults to "Suppression…". */
  pendingLabel?: string;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose} size="sm">
      <div className="flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-tint text-danger">
          <AlertTriangle className="h-4.5 w-4.5" />
        </span>
        <div className="space-y-2">
          <p className="text-sm text-foreground">{introText ?? `« ${itemName} » va être supprimé définitivement, avec :`}</p>
          <ul className="list-disc space-y-1 pl-4 text-sm text-foreground-muted">
            {consequences.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          <p className="text-sm font-medium text-danger">Cette action est irréversible.</p>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={isPending}>
          {isPending ? pendingLabel : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
