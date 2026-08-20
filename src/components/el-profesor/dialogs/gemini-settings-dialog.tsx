"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { updateGeminiModel } from "@/app/apps/el-profesor/actions/settings";
import { useToast } from "@/components/ui/toast";

// Kept in sync with EL_PROFESOR_GEMINI_MODEL_DEFAULT in src/lib/el-profesor/gemini.ts
// (that module is server-only and can't be imported from a client component).
const DEFAULT_MODEL = "gemini-flash-latest";

export function GeminiSettingsDialog({ currentModel, onClose }: { currentModel: string; onClose: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [model, setModel] = useState(currentModel);

  function handleSave() {
    if (!model.trim()) return;
    startTransition(async () => {
      const result = await updateGeminiModel(model);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Modèle mis à jour.", { variant: "success" });
        onClose();
      }
    });
  }

  return (
    <Modal title="Modèle IA" description="Modèle Gemini utilisé pour l'extraction, le complément et les propositions." onClose={onClose} size="sm">
      <div className="space-y-1.5">
        <Label htmlFor="gemini-model">Nom du modèle</Label>
        <Input id="gemini-model" value={model} onChange={(e) => setModel(e.target.value)} autoFocus placeholder="gemini-flash-latest" />
        <p className="text-xs text-foreground-subtle">
          Préférez un alias « latest » (ex. <code>gemini-flash-latest</code>, <code>gemini-pro-latest</code>) plutôt qu&apos;une
          version datée — Google retire les versions datées après quelques mois, ce qui casse les appels.
        </p>
        {model !== DEFAULT_MODEL && (
          <button type="button" onClick={() => setModel(DEFAULT_MODEL)} className="text-xs text-primary-strong underline">
            Réinitialiser à {DEFAULT_MODEL}
          </button>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={handleSave} disabled={isPending || !model.trim()}>
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </Modal>
  );
}
