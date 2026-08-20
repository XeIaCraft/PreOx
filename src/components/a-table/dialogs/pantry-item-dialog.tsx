"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { addPantryItem } from "@/app/apps/a-table/actions/pantry";
import { useToast } from "@/components/ui/toast";

export function PantryItemDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");

  function handleSave() {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await addPantryItem({ name, quantity: quantity ? Number(quantity) : null, unit });
      if (result.error) toast(result.error, { variant: "error" });
      else {
        onSaved();
        onClose();
      }
    });
  }

  return (
    <Modal title="Ajouter au garde-manger" onClose={onClose} size="sm">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="pi-name">Nom</Label>
          <Input id="pi-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pi-qty">Quantité</Label>
            <Input id="pi-qty" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pi-unit">Unité</Label>
            <Input id="pi-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="g, pièce…" />
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={handleSave} disabled={isPending || !name.trim()}>
          Ajouter
        </Button>
      </div>
    </Modal>
  );
}
