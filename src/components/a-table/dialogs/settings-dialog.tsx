"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/a-table/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DIET_OPTIONS,
  ALLERGY_OPTIONS,
  EQUIPMENT_OPTIONS,
  OBJECTIVE_OPTIONS,
  MAX_OBJECTIVES,
  APPETITE_LABELS,
  TIME_PROFILE_LABELS,
  COMPLEXITY_LABELS,
} from "@/lib/a-table/constants";
import { updatePreferences, updateGenerationRules, updateApiKeys, analyzeTastes, clearCardsAndHistory } from "@/app/apps/a-table/actions/settings";
import { useToast } from "@/components/a-table/toast";
import type { ATableSettings, Preferences, GenerationRules } from "@/lib/a-table/types";

interface SettingsDialogProps {
  settings: ATableSettings;
  onClose: () => void;
  onSaved: () => void;
}

const TABS = ["Général", "Régimes", "Goûts", "Équipements", "Objectifs", "Clés API", "Avancé"] as const;
type Tab = (typeof TABS)[number];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        active ? "border-primary/40 bg-primary-tint text-primary-strong" : "border-border text-foreground-muted hover:border-border-strong"
      )}
    >
      {children}
    </button>
  );
}

export function SettingsDialog({ settings, onClose, onSaved }: SettingsDialogProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("Général");
  const [isPending, startTransition] = useTransition();
  const [prefs, setPrefs] = useState<Preferences>(settings.preferences);
  const [rules, setRules] = useState<GenerationRules>(settings.generation_rules);
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState(settings.gemini_model);
  const [pexelsKey, setPexelsKey] = useState("");
  const [suggestions, setSuggestions] = useState<{ liked: string[]; disliked: string[] }>({ liked: [], disliked: [] });
  const [confirmingClear, setConfirmingClear] = useState(false);

  function setPref<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  function toggleInArray(key: keyof Preferences, value: string) {
    setPrefs((p) => {
      const arr = (p[key] as string[]) ?? [];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...p, [key]: next };
    });
  }

  function handleSave() {
    startTransition(async () => {
      const results = await Promise.all([
        updatePreferences(prefs),
        updateGenerationRules(rules),
        geminiKey || pexelsKey || geminiModel !== settings.gemini_model
          ? updateApiKeys({
              geminiApiKey: geminiKey || undefined,
              geminiModel: geminiModel !== settings.gemini_model ? geminiModel : undefined,
              pexelsApiKey: pexelsKey || undefined,
            })
          : Promise.resolve({}),
      ]);
      const error = results.find((r) => "error" in r && r.error);
      if (error && "error" in error) toast(error.error!, { variant: "error" });
      else {
        toast("Réglages enregistrés.", { variant: "success" });
        onSaved();
        onClose();
      }
    });
  }

  function handleAnalyzeTastes() {
    startTransition(async () => {
      const result = await analyzeTastes();
      if (result.error) toast(result.error, { variant: "error" });
      else if (result.data) {
        setSuggestions({ liked: result.data.liked_suggestions, disliked: result.data.disliked_suggestions });
      }
    });
  }

  function handleClearAll() {
    startTransition(async () => {
      const result = await clearCardsAndHistory();
      setConfirmingClear(false);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onSaved();
      }
    });
  }

  const objectivesMax = prefs.objectives.length >= MAX_OBJECTIVES;

  return (
    <Modal title="Réglages" onClose={onClose} size="xl" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button onClick={handleSave} disabled={isPending}>Enregistrer</Button>
      </>
    }>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-border pb-3">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t ? "bg-primary-tint text-primary-strong" : "text-foreground-muted hover:bg-surface-muted"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Général" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Portions par défaut</Label>
              <Input type="number" min={1} value={prefs.default_servings} onChange={(e) => setPref("default_servings", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Appétit</Label>
              <Select value={prefs.appetite} onChange={(e) => setPref("appetite", e.target.value as Preferences["appetite"])}>
                {Object.entries(APPETITE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Magasin habituel</Label>
              <Input value={prefs.grocery_store} onChange={(e) => setPref("grocery_store", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Budget par portion (€)</Label>
              <Input
                type="number"
                value={prefs.budget_per_serving ?? ""}
                onChange={(e) => setPref("budget_per_serving", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Temps de cuisson</Label>
              <Select value={prefs.time_profile} onChange={(e) => setPref("time_profile", e.target.value as Preferences["time_profile"])}>
                {Object.entries(TIME_PROFILE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Complexité</Label>
              <Select value={prefs.complexity} onChange={(e) => setPref("complexity", e.target.value as Preferences["complexity"])}>
                {Object.entries(COMPLEXITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground-muted">
            <input
              type="checkbox"
              checked={prefs.include_personal_recipes_in_context}
              onChange={(e) => setPref("include_personal_recipes_in_context", e.target.checked)}
              className="h-4 w-4 rounded border-border-strong text-primary focus-visible:ring-primary/30"
            />
            Inclure ma bibliothèque personnelle dans le contexte IA
          </label>
          <div className="space-y-1.5">
            <Label>Consigne libre pour l&rsquo;IA</Label>
            <textarea
              value={prefs.custom_context}
              onChange={(e) => setPref("custom_context", e.target.value)}
              rows={2}
              className="w-full resize-none rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </div>

          <div className="border-t border-danger/20 pt-4">
            {confirmingClear ? (
              <div className="flex items-center gap-3">
                <p className="text-sm text-foreground-muted">Supprimer toutes les cartes, recettes et l&rsquo;historique ?</p>
                <Button variant="danger" size="sm" onClick={handleClearAll} disabled={isPending}>Confirmer</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingClear(false)}>Annuler</Button>
              </div>
            ) : (
              <Button variant="danger" size="sm" onClick={() => setConfirmingClear(true)}>
                Vider cartes &amp; historique
              </Button>
            )}
          </div>
        </div>
      )}

      {tab === "Régimes" && (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-foreground-muted">Régimes</p>
            <div className="flex flex-wrap gap-2">
              {DIET_OPTIONS.map((opt) => (
                <Chip key={opt.value} active={prefs.diets.includes(opt.value)} onClick={() => toggleInArray("diets", opt.value)}>
                  {opt.label}
                </Chip>
              ))}
            </div>
            {prefs.diets.includes("other") && (
              <Input
                className="mt-2"
                value={prefs.diet_other_text}
                onChange={(e) => setPref("diet_other_text", e.target.value)}
                placeholder="Précisez votre régime"
              />
            )}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-foreground-muted">Allergies</p>
            <div className="flex flex-wrap gap-2">
              {ALLERGY_OPTIONS.map((opt) => (
                <Chip key={opt.value} active={prefs.allergies.includes(opt.value)} onClick={() => toggleInArray("allergies", opt.value)}>
                  {opt.label}
                </Chip>
              ))}
            </div>
            {prefs.allergies.includes("other") && (
              <Input
                className="mt-2"
                value={prefs.allergies_other_text}
                onChange={(e) => setPref("allergies_other_text", e.target.value)}
                placeholder="Précisez vos allergies"
              />
            )}
          </div>
        </div>
      )}

      {tab === "Goûts" && (
        <div className="space-y-5">
          {(["liked_ingredients", "disliked_ingredients"] as const).map((key) => (
            <div key={key}>
              <p className="mb-2 text-sm font-medium text-foreground-muted">{key === "liked_ingredients" ? "Ingrédients aimés" : "Ingrédients évités"}</p>
              <div className="flex flex-wrap gap-2">
                {(prefs[key] as string[]).map((ing) => (
                  <Badge key={ing} variant="neutral" className="cursor-pointer" onClick={() => toggleInArray(key, ing)}>
                    {ing} ×
                  </Badge>
                ))}
              </div>
              <Input
                className="mt-2"
                placeholder="Appuie sur Entrée pour ajouter"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const value = (e.target as HTMLInputElement).value.trim();
                    if (value) {
                      setPref(key, [...(prefs[key] as string[]), value]);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }
                }}
              />
            </div>
          ))}

          <div className="border-t border-border pt-4">
            <Button variant="secondary" size="sm" onClick={handleAnalyzeTastes} disabled={isPending}>
              {isPending ? "Analyse en cours…" : "Analyser mes habitudes"}
            </Button>
            {(suggestions.liked.length > 0 || suggestions.disliked.length > 0) && (
              <div className="mt-3 space-y-2">
                {suggestions.liked.length > 0 && (
                  <div>
                    <p className="text-xs text-foreground-subtle">Suggestions aimées :</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {suggestions.liked.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setPref("liked_ingredients", [...prefs.liked_ingredients, s]);
                            setSuggestions((prev) => ({ ...prev, liked: prev.liked.filter((i) => i !== s) }));
                          }}
                        >
                          <Badge variant="success">+ {s}</Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {suggestions.disliked.length > 0 && (
                  <div>
                    <p className="text-xs text-foreground-subtle">Suggestions à éviter :</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {suggestions.disliked.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setPref("disliked_ingredients", [...prefs.disliked_ingredients, s]);
                            setSuggestions((prev) => ({ ...prev, disliked: prev.disliked.filter((i) => i !== s) }));
                          }}
                        >
                          <Badge variant="danger">+ {s}</Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "Équipements" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT_OPTIONS.map((opt) => (
              <Chip key={opt.value} active={prefs.available_equipment.includes(opt.value)} onClick={() => toggleInArray("available_equipment", opt.value)}>
                {opt.label}
              </Chip>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Équipement à privilégier</Label>
            <Select
              value={prefs.preferred_equipment ?? ""}
              onChange={(e) => setPref("preferred_equipment", e.target.value || null)}
            >
              <option value="">Aucun</option>
              {prefs.available_equipment.map((value) => {
                const opt = EQUIPMENT_OPTIONS.find((o) => o.value === value);
                return (
                  <option key={value} value={value}>
                    {opt?.label ?? value}
                  </option>
                );
              })}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Niveaux de la plaque de cuisson</Label>
            <Input
              type="number"
              value={prefs.stove_levels ?? ""}
              onChange={(e) => setPref("stove_levels", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        </div>
      )}

      {tab === "Objectifs" && (
        <div>
          <div className="flex flex-wrap gap-2">
            {OBJECTIVE_OPTIONS.map((opt) => {
              const active = prefs.objectives.includes(opt.value);
              const disabled = !active && objectivesMax;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleInArray("objectives", opt.value)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    active ? "border-primary/40 bg-primary-tint text-primary-strong" : "border-border text-foreground-muted"
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-foreground-subtle">Jusqu&rsquo;à {MAX_OBJECTIVES} objectifs.</p>
        </div>
      )}

      {tab === "Clés API" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Clé API Gemini {settings.has_gemini_key && <span className="text-xs text-success">(configurée)</span>}</Label>
            <Input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder={settings.has_gemini_key ? "•••••••• (laisser vide pour ne pas changer)" : "Coller votre clé API Gemini"}
            />
            <p className="text-xs text-foreground-subtle">
              Clé gratuite sur{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline">
                Google AI Studio
              </a>
              .
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Modèle Gemini</Label>
            <Input value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Clé API Pexels (illustrations) {settings.has_pexels_key && <span className="text-xs text-success">(configurée)</span>}</Label>
            <Input
              type="password"
              value={pexelsKey}
              onChange={(e) => setPexelsKey(e.target.value)}
              placeholder={settings.has_pexels_key ? "•••••••• (laisser vide pour ne pas changer)" : "Coller votre clé API Pexels"}
            />
            <p className="text-xs text-foreground-subtle">
              Clé gratuite sur{" "}
              <a href="https://www.pexels.com/api/" target="_blank" rel="noreferrer" className="underline">
                pexels.com/api
              </a>
              . Facultatif — sans clé, les illustrations restent simplement désactivées.
            </p>
          </div>
        </div>
      )}

      {tab === "Avancé" && (
        <div className="space-y-4">
          <p className="text-sm text-foreground-muted">Quotas de diversité des générations IA.</p>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["max_favorites", "Max favoris repris"],
                ["max_recurrence", "Max répétitions vs historique"],
                ["min_new_recipes_pct", "% minimum de nouvelles recettes"],
                ["max_repeat_protein", "Max même protéine"],
                ["max_repeat_starch", "Max même féculent"],
                ["max_repeat_vegetable", "Max même légume"],
              ] as [keyof GenerationRules, string][]
            ).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Input
                  type="number"
                  value={rules[key]}
                  onChange={(e) => setRules((r) => ({ ...r, [key]: Number(e.target.value) }))}
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Objectif calorique / portion (kcal)</Label>
            <Input
              type="number"
              value={prefs.target_kcal_per_serving ?? ""}
              onChange={(e) => setPref("target_kcal_per_serving", e.target.value ? Number(e.target.value) : null)}
            />
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-foreground-muted">
              Répartition macros — {prefs.macro_ratios.protein_pct + prefs.macro_ratios.carb_pct + prefs.macro_ratios.fat_pct}%
            </p>
            {(["protein_pct", "carb_pct", "fat_pct"] as const).map((key) => (
              <div key={key} className="mb-2 flex items-center gap-3">
                <span className="w-24 text-xs text-foreground-subtle">
                  {key === "protein_pct" ? "Protéines" : key === "carb_pct" ? "Glucides" : "Lipides"}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={prefs.macro_ratios[key]}
                  onChange={(e) =>
                    setPref("macro_ratios", { ...prefs.macro_ratios, [key]: Number(e.target.value) })
                  }
                  className="flex-1"
                />
                <span className="w-10 text-right text-xs text-foreground-muted">{prefs.macro_ratios[key]}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
