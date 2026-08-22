"use client";

import { useMemo, useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addRecipe, importRecipe, importRecipeFromUrl } from "@/app/apps/a-table/actions/recipes";
import { importPaprikaExport } from "@/app/apps/a-table/actions/paprika";
import { useToast } from "@/components/ui/toast";
import { fileToBase64 } from "@/lib/client-file";
import { findSimilarRecipe } from "@/lib/a-table/dedupe";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

interface AddRecipeDialogProps {
  existingTags?: string[];
  existingRecipes?: { id: string; title: string }[];
  onClose: () => void;
  onSaved: () => void;
}

export function AddRecipeDialog({ existingTags, existingRecipes, onClose, onSaved }: AddRecipeDialogProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"ai" | "manual">("ai");
  const [isPending, startTransition] = useTransition();

  // AI tab
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [aiLabel, setAiLabel] = useState("Importer");
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [isImportingPaprika, setIsImportingPaprika] = useState(false);

  // Manual tab
  const [title, setTitle] = useState("");
  const [servings, setServings] = useState(2);
  const [cookingMinutes, setCookingMinutes] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [pricePerServing, setPricePerServing] = useState("");

  const similarRecipe = useMemo(
    () => (existingRecipes ? findSimilarRecipe(title, existingRecipes) : null),
    [title, existingRecipes]
  );

  function handleImport() {
    if (!text.trim() && !photo) return;
    startTransition(async () => {
      let imageBase64: string | undefined;
      let imageMimeType: string | undefined;
      if (photo) {
        setAiLabel("Envoi de la photo…");
        imageBase64 = await fileToBase64(photo);
        imageMimeType = photo.type || "image/jpeg";
      }
      setAiLabel("Analyse en cours…");
      const result = await importRecipe({ text: text || undefined, imageBase64, imageMimeType });
      setAiLabel("Importer");
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onSaved();
        onClose();
      }
    });
  }

  function handleImportUrl() {
    if (!url.trim()) return;
    setIsImportingUrl(true);
    importRecipeFromUrl(url.trim())
      .then((result) => {
        if (result.error) toast(result.error, { variant: "error" });
        else {
          toast(result.success ?? "", { variant: "success" });
          onSaved();
          onClose();
        }
      })
      .finally(() => setIsImportingUrl(false));
  }

  function handleImportPaprika(file: File | null) {
    if (!file) return;
    setIsImportingPaprika(true);
    fileToBase64(file)
      .then((base64) => importPaprikaExport(base64))
      .then((result) => {
        if (result.error) toast(result.error, { variant: "error" });
        else {
          toast(result.success ?? "", { variant: "success" });
          onSaved();
          onClose();
        }
      })
      .finally(() => setIsImportingPaprika(false));
  }

  function parseIngredients(): { name: string; quantity: number | null; unit: string }[] {
    return ingredientsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [qty, unit, ...rest] = line.split(",").map((s) => s.trim());
        const quantity = Number(qty);
        return {
          quantity: Number.isFinite(quantity) && qty !== "" ? quantity : null,
          unit: unit ?? "",
          name: rest.join(", ") || qty,
        };
      });
  }

  function handleManualSave() {
    if (!title.trim()) return;
    startTransition(async () => {
      const result = await addRecipe({
        title,
        servings,
        cookingMinutes: cookingMinutes ? Number(cookingMinutes) : null,
        tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
        ingredients: parseIngredients(),
        steps: stepsText.split("\n").map((s) => s.trim()).filter(Boolean),
        notes,
        nutrition: {},
        pricePerServing: pricePerServing ? Number(pricePerServing) : null,
      });
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onSaved();
        onClose();
      }
    });
  }

  return (
    <Modal title="Ajouter une recette" onClose={onClose} size="lg">
      <div className="mb-4 flex gap-1 rounded-full border border-border bg-surface-muted p-1">
        {(["ai", "manual"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-full py-1.5 text-sm font-medium transition-colors",
              tab === t ? "bg-surface text-foreground shadow-sm" : "text-foreground-muted"
            )}
          >
            {t === "ai" ? "Avec l'IA" : "Manuellement"}
          </button>
        ))}
      </div>

      {tab === "ai" ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ar-text">Texte de la recette</Label>
            <textarea
              id="ar-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Colle ici le texte d'une recette…"
              className="w-full resize-none rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ar-url">Ou une URL de recette</Label>
            <div className="flex gap-2">
              <Input
                id="ar-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className="flex-1"
              />
              <Button variant="secondary" onClick={handleImportUrl} disabled={isImportingUrl || !url.trim()}>
                {isImportingUrl ? "Import…" : "Importer"}
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ar-photo">Ou une photo</Label>
            <Input
              id="ar-photo"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                if (file && !file.type.startsWith("image/")) {
                  toast("Seules les images sont acceptées.", { variant: "error" });
                  e.target.value = "";
                  setPhoto(null);
                  return;
                }
                if (file && file.size > MAX_PHOTO_BYTES) {
                  toast("Photo trop lourde (8 Mo maximum).", { variant: "error" });
                  e.target.value = "";
                  setPhoto(null);
                  return;
                }
                setPhoto(file);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ar-paprika">Ou un export Paprika (.paprikarecipes)</Label>
            <Input
              id="ar-paprika"
              type="file"
              accept=".paprikarecipes"
              disabled={isImportingPaprika}
              onChange={(e) => {
                handleImportPaprika(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <p className="text-xs text-foreground-subtle">
              {isImportingPaprika ? "Import en cours (peut prendre une minute)…" : "Jusqu'à 15 recettes par import, structurées par l'IA."}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={handleImport} disabled={isPending || (!text.trim() && !photo)}>
              {isPending ? aiLabel : "Importer"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mr-title">Titre</Label>
            <Input id="mr-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            {similarRecipe && (
              <p className="text-xs text-accent">Une recette similaire existe déjà : « {similarRecipe.title} ».</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mr-servings">Portions</Label>
              <Input id="mr-servings" type="number" min={1} value={servings} onChange={(e) => setServings(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mr-time">Temps de cuisson (min)</Label>
              <Input id="mr-time" type="number" value={cookingMinutes} onChange={(e) => setCookingMinutes(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mr-ingredients">Ingrédients (un par ligne : quantité, unité, nom)</Label>
            <textarea
              id="mr-ingredients"
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
              rows={4}
              placeholder={"200, g, pâtes\n2, pièce, œufs"}
              className="w-full resize-none rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mr-steps">Étapes (une par ligne)</Label>
            <textarea
              id="mr-steps"
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mr-tags">Tags (séparés par des virgules)</Label>
              <Input id="mr-tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} list="mr-tags-list" />
              {existingTags && existingTags.length > 0 && (
                <datalist id="mr-tags-list">
                  {existingTags.map((tag) => (
                    <option key={tag} value={tag} />
                  ))}
                </datalist>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mr-price">Prix / portion (€)</Label>
              <Input id="mr-price" type="number" value={pricePerServing} onChange={(e) => setPricePerServing(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mr-notes">Notes</Label>
            <Input id="mr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={handleManualSave} disabled={isPending || !title.trim()}>
              Ajouter
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
