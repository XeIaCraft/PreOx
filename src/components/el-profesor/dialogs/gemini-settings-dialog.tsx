"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  updateGeminiModel,
  updateGeminiApiKey,
  clearGeminiApiKey,
  addGeminiExtraKeys,
  clearGeminiExtraKeys,
  updateGeminiFallbackModel,
} from "@/app/apps/el-profesor/actions/settings";
import { useToast } from "@/components/ui/toast";

// Kept in sync with EL_PROFESOR_GEMINI_MODEL_DEFAULT in src/lib/el-profesor/gemini.ts
// (that module is server-only and can't be imported from a client component).
const DEFAULT_MODEL = "gemini-flash-latest";

export function GeminiSettingsDialog({
  currentModel,
  hasApiKey,
  extraKeyCount,
  fallbackModel,
  onClose,
}: {
  currentModel: string;
  hasApiKey: boolean;
  extraKeyCount: number;
  fallbackModel: string | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isKeyPending, startKeyTransition] = useTransition();
  const [isExtraKeysPending, startExtraKeysTransition] = useTransition();
  const [isFallbackPending, startFallbackTransition] = useTransition();
  const [model, setModel] = useState(currentModel);
  const [apiKey, setApiKey] = useState("");
  const [keyConfigured, setKeyConfigured] = useState(hasApiKey);
  const [extraKeysText, setExtraKeysText] = useState("");
  const [savedExtraKeyCount, setSavedExtraKeyCount] = useState(extraKeyCount);
  const [fallbackModelInput, setFallbackModelInput] = useState(fallbackModel ?? "");

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

  function handleAddExtraKeys() {
    const keys = extraKeysText.split(/[\n,]/).map((k) => k.trim()).filter(Boolean);
    if (keys.length === 0) return;
    startExtraKeysTransition(async () => {
      const result = await addGeminiExtraKeys(keys);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Clés ajoutées.", { variant: "success" });
        setSavedExtraKeyCount((c) => c + keys.length);
        setExtraKeysText("");
      }
    });
  }

  function handleClearExtraKeys() {
    startExtraKeysTransition(async () => {
      const result = await clearGeminiExtraKeys();
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Clés supplémentaires retirées.", { variant: "success" });
        setSavedExtraKeyCount(0);
      }
    });
  }

  function handleSaveFallbackModel() {
    startFallbackTransition(async () => {
      const result = await updateGeminiFallbackModel(fallbackModelInput);
      if (result.error) toast(result.error, { variant: "error" });
      else toast(result.success ?? "Modèle de secours enregistré.", { variant: "success" });
    });
  }

  return (
    <Modal
      title="Réglages IA (Gemini)"
      description="Clé API et modèle Gemini utilisés pour l'extraction, le complément et les propositions."
      onClose={onClose}
      size="md"
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

      <div className="mt-5 space-y-1.5 border-t border-border pt-4">
        <Label htmlFor="gemini-extra-keys">Clés de secours (une par ligne)</Label>
        <textarea
          id="gemini-extra-keys"
          value={extraKeysText}
          onChange={(e) => setExtraKeysText(e.target.value)}
          rows={2}
          placeholder="Clés API supplémentaires, essayées si la clé principale est à quota"
          className="w-full resize-none rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-foreground-subtle">
            {savedExtraKeyCount > 0
              ? `${savedExtraKeyCount} clé(s) de secours configurée(s).`
              : "Aucune clé de secours — un dépassement de quota fera simplement échouer l'appel."}
          </p>
          {savedExtraKeyCount > 0 && (
            <button type="button" onClick={handleClearExtraKeys} disabled={isExtraKeysPending} className="text-xs text-danger underline">
              Tout retirer
            </button>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={handleAddExtraKeys} disabled={isExtraKeysPending || !extraKeysText.trim()}>
          {isExtraKeysPending ? "…" : "Ajouter"}
        </Button>
        <p className="text-xs text-foreground-subtle">
          Essayées dans l&apos;ordre après la clé principale, uniquement si l&apos;appel échoue par quota (429) ou surcharge (503) —
          jamais pour d&apos;autres erreurs.
        </p>
      </div>

      <div className="mt-5 space-y-1.5 border-t border-border pt-4">
        <Label htmlFor="gemini-fallback-model">Modèle de secours (optionnel)</Label>
        <div className="flex gap-2">
          <Input
            id="gemini-fallback-model"
            value={fallbackModelInput}
            onChange={(e) => setFallbackModelInput(e.target.value)}
            placeholder="ex. gemini-pro-latest"
          />
          <Button
            variant="secondary"
            onClick={handleSaveFallbackModel}
            disabled={isFallbackPending || fallbackModelInput.trim() === (fallbackModel ?? "")}
          >
            {isFallbackPending ? "…" : "Enregistrer"}
          </Button>
        </div>
        <p className="text-xs text-foreground-subtle">
          Essayé (avec chaque clé) si le modèle principal échoue encore après avoir épuisé toutes les clés.
        </p>
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
