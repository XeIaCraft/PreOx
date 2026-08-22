"use client";

import { useState, useTransition } from "react";
import { Trash2, Save } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { DAY_LABELS } from "@/lib/a-table/constants";
import { saveWeekAsTemplate, applyWeekTemplate, deleteWeekTemplate } from "@/app/apps/a-table/actions/week_templates";
import { useToast } from "@/components/ui/toast";
import type { Recipe, WeekTemplate } from "@/lib/a-table/types";

export function WeekTemplatesDialog({
  templates,
  recipesById,
  weekStart,
  onClose,
  onSaved,
}: {
  templates: WeekTemplate[];
  recipesById: Map<string, Recipe>;
  weekStart: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");

  function handleSave() {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await saveWeekAsTemplate(name, weekStart);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        setName("");
        onSaved();
      }
    });
  }

  function handleApply(templateId: string) {
    startTransition(async () => {
      const result = await applyWeekTemplate(templateId, weekStart);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onSaved();
        onClose();
      }
    });
  }

  function handleDelete(templateId: string) {
    startTransition(async () => {
      const result = await deleteWeekTemplate(templateId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onSaved();
      }
    });
  }

  return (
    <Modal title="Modèles de semaine" description="Enregistrez la disposition actuelle pour la réutiliser plus tard." onClose={onClose} size="md">
      <div className="space-y-1.5">
        <Label htmlFor="template-name">Enregistrer la semaine actuelle comme modèle</Label>
        <div className="flex gap-2">
          <Input id="template-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Semaine type, Semaine légère…" />
          <Button onClick={handleSave} disabled={isPending || !name.trim()}>
            <Save className="h-4 w-4" /> Enregistrer
          </Button>
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-2 text-sm font-medium text-foreground-muted">Modèles enregistrés</p>
        {templates.length === 0 ? (
          <p className="text-sm text-foreground-subtle">Aucun modèle pour l&rsquo;instant.</p>
        ) : (
          <ul className="space-y-2">
            {templates.map((t) => (
              <li key={t.id} className="rounded-[var(--radius-md)] border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{t.name}</p>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" onClick={() => handleApply(t.id)} disabled={isPending}>
                      Appliquer
                    </Button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      disabled={isPending}
                      title="Supprimer ce modèle"
                      className="rounded p-1.5 text-foreground-subtle hover:bg-danger-tint hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-foreground-subtle">
                  {t.items
                    .map((i) => `${DAY_LABELS[i.placement]} : ${recipesById.get(i.recipe_id)?.title ?? "recette supprimée"}`)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
