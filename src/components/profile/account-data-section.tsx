"use client";

import { useState, useTransition } from "react";
import { Download, LogOut, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { exportMyData, signOutAllDevices } from "@/app/actions/profile";
import { deleteMyAccount } from "@/app/actions/security";

export function AccountDataSection() {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

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

  function handleDeleteAccount() {
    startDeleteTransition(async () => {
      const result = await deleteMyAccount();
      if (result?.error) toast(result.error, { variant: "error" });
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

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">Supprimer mon compte</p>
          <p className="text-sm text-foreground-muted">
            Supprime définitivement votre compte et toutes vos données sur À table et El Profesor. Irréversible.
          </p>
          {confirmingDelete ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-foreground-muted">
                Tapez <span className="font-mono font-semibold text-foreground">SUPPRIMER</span> pour confirmer.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="SUPPRIMER"
                  className="max-w-48"
                />
                <Button variant="danger" size="sm" onClick={handleDeleteAccount} disabled={isDeleting || deleteConfirmText !== "SUPPRIMER"}>
                  {isDeleting ? "Suppression…" : "Confirmer la suppression"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setConfirmingDelete(false); setDeleteConfirmText(""); }}>
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" size="sm" className="mt-3" onClick={() => setConfirmingDelete(true)}>
              <Trash2 className="h-4 w-4" />
              Supprimer mon compte
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
