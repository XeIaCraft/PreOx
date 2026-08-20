"use client";

import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { flagContent } from "@/app/apps/el-profesor/actions/flags";
import { useToast } from "@/components/ui/toast";
import type { FlagTargetType } from "@/lib/el-profesor/types";

export function FlagButton({ targetType, targetId }: { targetType: FlagTargetType; targetId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      const result = await flagContent(targetType, targetId, reason);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Signalé.", { variant: "success" });
        setOpen(false);
        setReason("");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-foreground-subtle transition-colors hover:text-danger"
        aria-label="Signaler une erreur"
        title="Signaler une erreur"
      >
        <Flag className="h-3.5 w-3.5" />
      </button>
      {open && (
        <Modal title="Signaler une erreur" onClose={() => setOpen(false)} size="sm">
          <p className="text-sm text-foreground-muted">
            Décris rapidement ce qui te semble faux ou imprécis — un administrateur relira ce contenu.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Optionnel"
            className="mt-3 w-full rounded-[var(--radius-sm)] border border-border bg-surface p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              Envoyer
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
