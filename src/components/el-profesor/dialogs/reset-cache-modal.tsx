"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { flushBeforeReset, resetLocalCacheAndReload } from "@/lib/el-profesor/cache-reset";

type Step = "confirm" | "flushing" | "unsent" | "clearing";

/**
 * Confirms, delivers pending local changes first, and only asks again if
 * some still couldn't be sent — those are the one thing a reset can
 * actually lose (everything else is re-downloaded by the sync that starts
 * right after the reload).
 */
export function ResetCacheModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>("confirm");
  const [unsent, setUnsent] = useState(0);

  async function handleReset() {
    setStep("flushing");
    const remaining = await flushBeforeReset();
    if (remaining > 0) {
      setUnsent(remaining);
      setStep("unsent");
      return;
    }
    setStep("clearing");
    await resetLocalCacheAndReload();
  }

  async function handleResetAnyway() {
    setStep("clearing");
    await resetLocalCacheAndReload();
  }

  const busy = step === "flushing" || step === "clearing";

  return (
    <Modal title="Réinitialiser le cache local" onClose={busy ? () => {} : onClose} size="sm">
      {step === "unsent" ? (
        <>
          <p className="flex items-start gap-1.5 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {unsent > 1
              ? `${unsent} modifications locales n'ont pas pu être envoyées au serveur (hors ligne ?). Elles seront perdues si vous réinitialisez maintenant.`
              : "Une modification locale n'a pas pu être envoyée au serveur (hors ligne ?). Elle sera perdue si vous réinitialisez maintenant."}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button variant="danger" onClick={handleResetAnyway}>
              Réinitialiser quand même
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-foreground-muted">
            Supprime toutes les données d&apos;El Profesor enregistrées sur cet appareil (bibliothèque, progression, statistiques), puis
            les retélécharge depuis le serveur. Vos données sur le serveur ne sont pas touchées, et vos modifications locales sont d&apos;abord
            envoyées.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={handleReset} disabled={busy}>
              {step === "flushing" ? "Envoi des modifications…" : step === "clearing" ? "Réinitialisation…" : "Réinitialiser"}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
