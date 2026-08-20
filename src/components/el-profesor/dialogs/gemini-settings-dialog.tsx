"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { updateGeminiModel, updateGeminiApiKey, clearGeminiApiKey } from "@/app/apps/el-profesor/actions/settings";
import { useToast } from "@/components/ui/toast";

// Kept in sync with EL_PROFESOR_GEMINI_MODEL_DEFAULT in src/lib/el-profesor/gemini.ts
// (that module is server-only and can't be imported from a client component).
const DEFAULT_MODEL = "gemini-flash-latest";

export function GeminiSettingsDialog({
  currentModel,
  hasApiKey,
  onClose,
}: {
  currentModel: string;
  hasApiKey: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isKeyPending, startKeyTransition] = useTransition();
  const [model, setModel] = useState(currentModel);
  const [apiKey, setApiKey] = useState("");
  const [keyConfigured, setKeyConfigured] = useState(hasApiKey);

  function handleSave() {
    if (!model.trim()) return;
    startTransition(async () => {
      const result = await updateGeminiModel(model);
      if (result.error) toast(result.error, { variant: "error" });
      else toast(result.success ?? "Modèle mis à jour.", { variant: "success" });
    });
  }

  function handleSaveKey() {
    if (!apiKey.trim()) return;
    startKeyTransition(async () => {
      const result = await updateGeminiApiKey(apiKey);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Clé API enregistrée.", { variant: "success" });
        setApiKey("");
        setKeyConfigured(true);
      }
    });
  }

  function handleClearKey() {
    startKeyTransition(async () => {
      const result = await clearGeminiApiKey();
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Clé API supprimée.", { variant: "success" });
        setKeyConfigured(false);
      }
    });
  }

  return (
    <Modal
      title="Réglages IA (Gemini)"
      description="Clé API et modèle Gemini utilisés pour l'extraction, le complément et les propositions."
      onClose={onClose}
      size="sm"
    >
      <div className="space-y-1.5">
        <Label htmlFor="gemini-api-key">Clé API Gemini</Label>
        <div className="flex gap-2">
          <Input
            id="gemini-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoFocus
            placeholder={keyConfigured ? "Clé configurée — laisser vide pour la conserver" : "Coller votre clé API Gemini"}
          />
          <Button variant="secondary" onClick={handleSaveKey} disabled={isKeyPending || !apiKey.trim()}>
            {isKeyPending ? "…" : "Enregistrer"}
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-foreground-subtle">
            {keyConfigured ? "Une clé est configurée." : "Aucune clé configurée — l'extraction et les propositions échoueront."}
          </p>
          {keyConfigured && (
            <button type="button" onClick={handleClearKey} disabled={isKeyPending} className="text-xs text-danger underline">
              Supprimer
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-1.5 border-t border-border pt-4">
        <Label htmlFor="gemini-model">Nom du modèle</Label>
        <Input id="gemini-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gemini-flash-latest" />
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
          Fermer
        </Button>
        <Button onClick={handleSave} disabled={isPending || !model.trim() || model === currentModel}>
          {isPending ? "Enregistrement…" : "Enregistrer le modèle"}
        </Button>
      </div>
    </Modal>
  );
}
