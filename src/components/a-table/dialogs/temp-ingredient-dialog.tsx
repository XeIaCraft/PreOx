"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/a-table/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { addTemporaryIngredient, updateTemporaryIngredient } from "@/app/apps/a-table/actions/temp_ingredients";
import { useToast } from "@/components/a-table/toast";
import type { TemporaryIngredient } from "@/lib/a-table/types";

interface TempIngredientDialogProps {
  ingredient: TemporaryIngredient | null;
  onClose: () => void;
  onSaved: () => void;
}

export function TempIngredientDialog({ ingredient, onClose, onSaved }: TempIngredientDialogProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(ingredient?.name ?? "");
  const [quantity, setQuantity] = useState(ingredient?.quantity?.toString() ?? "");
  const [unit, setUnit] = useState(ingredient?.unit ?? "");
  const [note, setNote] = useState(ingredient?.note ?? "");
  const [dateLimit, setDateLimit] = useState(ingredient?.date_limit ?? "");

  function handleSave() {
    if (!name.trim()) return;
    startTransition(async () => {
      const input = { name, quantity: quantity ? Number(quantity) : null, unit, note, dateLimit };
      const result = ingredient
        ? await updateTemporaryIngredient(ingredient.id, input)
        : await addTemporaryIngredient(input);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        onSaved();
        onClose();
      }
    });
  }

  return (
    <Modal title={ingredient ? "Modifier l'aliment" : "Ajouter un aliment"} onClose={onClose} size="sm">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ti-name">Nom</Label>
          <Input id="ti-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ti-qty">Quantité</Label>
            <Input id="ti-qty" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ti-unit">Unité</Label>
            <Input id="ti-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="g, pièce…" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ti-note">Note</Label>
          <Input id="ti-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. déjà entamé" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ti-date">À utiliser avant</Label>
          <Input id="ti-date" value={dateLimit} onChange={(e) => setDateLimit(e.target.value)} placeholder="ex. vendredi" />
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={handleSave} disabled={isPending || !name.trim()}>
          Enregistrer
        </Button>
      </div>
    </Modal>
  );
}
