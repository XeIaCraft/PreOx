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
  updateAiProvider,
  updateClaudeModel,
  updateClaudeApiKey,
  clearClaudeApiKey,
} from "@/app/apps/el-profesor/actions/settings";
import { useToast } from "@/components/ui/toast";
import type { GeminiUsageStats, ElProfesorAiProvider } from "@/lib/el-profesor/dal";

// Kept in sync with EL_PROFESOR_GEMINI_MODEL_DEFAULT in src/lib/el-profesor/gemini.ts
// (that module is server-only and can't be imported from a client component).
const DEFAULT_MODEL = "gemini-flash-latest";
// Same for EL_PROFESOR_CLAUDE_MODEL_DEFAULT in src/lib/el-profesor/anthropic.ts.
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5";

export function GeminiSettingsDialog({
  currentModel,
  hasApiKey,
  extraKeyCount,
  fallbackModel,
  usageStats,
  aiProvider,
  hasClaudeKey,
  claudeModel,
  onClose,
}: {
  currentModel: string;
  hasApiKey: boolean;
  extraKeyCount: number;
  fallbackModel: string | null;
  usageStats: GeminiUsageStats | null;
  aiProvider: ElProfesorAiProvider;
  hasClaudeKey: boolean;
  claudeModel: string;
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

  const [provider, setProvider] = useState<ElProfesorAiProvider>(aiProvider);
  const [isProviderPending, startProviderTransition] = useTransition();
  const [claudeModelInput, setClaudeModelInput] = useState(claudeModel);
  const [isClaudeModelPending, startClaudeModelTransition] = useTransition();
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [claudeKeyConfigured, setClaudeKeyConfigured] = useState(hasClaudeKey);
  const [isClaudeKeyPending, startClaudeKeyTransition] = useTransition();

  function handleSwitchProvider(next: ElProfesorAiProvider) {
    if (next === provider) return;
    startProviderTransition(async () => {
      const result = await updateAiProvider(next);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        setProvider(next);
        toast(result.success ?? "Fournisseur mis à jour.", { variant: "success" });
      }
    });
  }

  function handleSaveClaudeModel() {
    if (!claudeModelInput.trim()) return;
    startClaudeModelTransition(async () => {
      const result = await updateClaudeModel(claudeModelInput);
      if (result.error) toast(result.error, { variant: "error" });
      else toast(result.success ?? "Modèle mis à jour.", { variant: "success" });
    });
  }

  function handleSaveClaudeKey() {
    if (!claudeApiKey.trim()) return;
    startClaudeKeyTransition(async () => {
      const result = await updateClaudeApiKey(claudeApiKey);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Clé API enregistrée.", { variant: "success" });
        setClaudeApiKey("");
        setClaudeKeyConfigured(true);
      }
    });
  }

  function handleClearClaudeKey() {
    startClaudeKeyTransition(async () => {
      const result = await clearClaudeApiKey();
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Clé API supprimée.", { variant: "success" });
        setClaudeKeyConfigured(false);
      }
    });
  }

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
      title="Réglages IA"
      description="Fournisseur, clés API et modèles utilisés pour l'extraction, le complément et les propositions."
      onClose={onClose}
      size="md"
    >
      <div className="space-y-1.5">
        <Label>Fournisseur pour l&apos;extraction et le complément</Label>
        <div className="flex gap-2">
          <Button
            variant={provider === "gemini" ? "primary" : "secondary"}
            size="sm"
            onClick={() => handleSwitchProvider("gemini")}
            disabled={isProviderPending}
          >
            Gemini
          </Button>
          <Button
            variant={provider === "claude" ? "primary" : "secondary"}
            size="sm"
            onClick={() => handleSwitchProvider("claude")}
            disabled={isProviderPending}
          >
            Claude
          </Button>
        </div>
        <p className="text-xs text-foreground-subtle">
          {provider === "claude"
            ? "Claude actif — sans passe de vérification automatique des citations pour l'instant : tout élément généré est marqué « à vérifier »."
            : "Gemini actif. Basculer sur Claude quand le quota Gemini est épuisé, ou pour varier les modèles."}
        </p>
      </div>

      <div className="mt-5 space-y-1.5 border-t border-border pt-4">
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

      <div className="mt-5 space-y-1.5 border-t border-border pt-4">
        <Label htmlFor="claude-api-key">Clé API Claude</Label>
        <div className="flex gap-2">
          <Input
            id="claude-api-key"
            type="password"
            value={claudeApiKey}
            onChange={(e) => setClaudeApiKey(e.target.value)}
            placeholder={claudeKeyConfigured ? "Clé configurée — laisser vide pour la conserver" : "Coller votre clé API Claude"}
          />
          <Button variant="secondary" onClick={handleSaveClaudeKey} disabled={isClaudeKeyPending || !claudeApiKey.trim()}>
            {isClaudeKeyPending ? "…" : "Enregistrer"}
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-foreground-subtle">
            {claudeKeyConfigured ? "Une clé est configurée." : "Aucune clé configurée — l'extraction échouera si Claude est sélectionné."}
          </p>
          {claudeKeyConfigured && (
            <button type="button" onClick={handleClearClaudeKey} disabled={isClaudeKeyPending} className="text-xs text-danger underline">
              Supprimer
            </button>
          )}
        </div>
        <Label htmlFor="claude-model" className="mt-3 block">
          Nom du modèle
        </Label>
        <div className="flex gap-2">
          <Input id="claude-model" value={claudeModelInput} onChange={(e) => setClaudeModelInput(e.target.value)} placeholder={DEFAULT_CLAUDE_MODEL} />
          <Button
            variant="secondary"
            onClick={handleSaveClaudeModel}
            disabled={isClaudeModelPending || !claudeModelInput.trim() || claudeModelInput === claudeModel}
          >
            {isClaudeModelPending ? "…" : "Enregistrer"}
          </Button>
        </div>
        {claudeModelInput !== DEFAULT_CLAUDE_MODEL && (
          <button type="button" onClick={() => setClaudeModelInput(DEFAULT_CLAUDE_MODEL)} className="text-xs text-primary-strong underline">
            Réinitialiser à {DEFAULT_CLAUDE_MODEL}
          </button>
        )}
      </div>

      {usageStats && (
        <div className="mt-5 space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">Consommation ({provider === "claude" ? "Claude" : "Gemini"} actif — le tableau ci-dessous couvre les deux)</p>
          <div className="grid grid-cols-2 gap-3 text-xs text-foreground-muted">
            <div className="rounded-[var(--radius-sm)] border border-border bg-surface-muted/50 p-2.5">
              <p className="font-medium text-foreground">{usageStats.last24h.calls} appel(s) — 24 h</p>
              <p>
                {usageStats.last24h.failures} échec(s) · {usageStats.last24h.totalTokens.toLocaleString("fr-FR")} tokens
              </p>
            </div>
            <div className="rounded-[var(--radius-sm)] border border-border bg-surface-muted/50 p-2.5">
              <p className="font-medium text-foreground">{usageStats.last7d.calls} appel(s) — 7 j</p>
              <p>
                {usageStats.last7d.failures} échec(s) · {usageStats.last7d.totalTokens.toLocaleString("fr-FR")} tokens
              </p>
            </div>
          </div>
          {usageStats.byModel.length > 0 && (
            <ul className="text-xs text-foreground-subtle">
              {usageStats.byModel.map((m) => (
                <li key={m.model}>
                  {m.model} : {m.calls} appel(s){m.failures > 0 ? `, ${m.failures} échec(s)` : ""}
                </li>
              ))}
            </ul>
          )}
          {usageStats.recentFailures.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-danger">{usageStats.recentFailures.length} échec(s) récent(s)</summary>
              <ul className="mt-1.5 space-y-1 text-foreground-subtle">
                {usageStats.recentFailures.map((f, i) => (
                  <li key={i}>
                    {new Date(f.calledAt).toLocaleString("fr-FR")} — {f.model}
                    {f.statusCode ? ` (${f.statusCode})` : ""}
                    {f.errorMessage ? ` — ${f.errorMessage.slice(0, 120)}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

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
