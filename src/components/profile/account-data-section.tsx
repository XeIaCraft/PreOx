"use client";

import { useState, useTransition } from "react";
import { Download, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { exportMyData, signOutAllDevices } from "@/app/actions/profile";

export function AccountDataSection() {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleExport() {
    setExporting(true);
    exportMyData()
      .then((result) => {
        if (result.error || !result.json) {
          toast(result.error ?? "Export impossible.", { variant: "error" });
          return;
        }
        const blob = new Blob([result.json], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "preox-mes-donnees.json";
        link.click();
        URL.revokeObjectURL(link.href);
      })
      .finally(() => setExporting(false));
  }

  function handleSignOutAll() {
    startTransition(async () => {
      await signOutAllDevices();
    });
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6">
      <h2 className="font-serif-display text-lg font-medium text-foreground">Compte & données</h2>
      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Exporter mes données</p>
            <p className="text-sm text-foreground-muted">
              Un fichier JSON avec tout ce qui vous appartient sur El Profesor et À table.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4" />
            {exporting ? "Préparation…" : "Télécharger"}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium text-foreground">Se déconnecter de tous les appareils</p>
            <p className="text-sm text-foreground-muted">Invalide toutes vos sessions actives, y compris celle-ci.</p>
          </div>
          {confirmingSignOut ? (
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="danger" size="sm" onClick={handleSignOutAll} disabled={isPending}>
                Confirmer
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingSignOut(false)}>
                Annuler
              </Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setConfirmingSignOut(true)}>
              <LogOut className="h-4 w-4" />
              Déconnecter partout
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
