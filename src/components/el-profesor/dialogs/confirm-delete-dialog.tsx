"use client";

import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export function ConfirmDeleteDialog({
  title,
  itemName,
  consequences,
  isPending,
  onConfirm,
  onClose,
}: {
  title: string;
  itemName: string;
  consequences: string[];
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
          <p className="text-sm text-foreground">
            « {itemName} » va être supprimé définitivement, avec :
          </p>
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
          {isPending ? "Suppression…" : "Supprimer définitivement"}
        </Button>
      </div>
    </Modal>
  );
}
