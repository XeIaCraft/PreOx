"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createApp, updateApp, type ActionState } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { ICON_OPTIONS, type IconName } from "@/lib/icon-map";
import { IconPicker } from "@/components/admin/icon-picker";
import type { AppModule } from "@/lib/supabase/types";

const initialState: ActionState = {};

export function AppForm({ app }: { app?: AppModule }) {
  const router = useRouter();
  const action = app ? updateApp.bind(null, app.id) : createApp;
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state?.success) {
      router.push("/admin/apps");
      router.refresh();
    }
  }, [state?.success, router]);

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      {state?.error && <Alert variant="danger">{state.error}</Alert>}

      <div className="space-y-1.5">
        <Label htmlFor="name">Nom du module</Label>
        <Input id="name" name="name" required defaultValue={app?.name} placeholder="Cas cliniques" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="slug">Identifiant (slug)</Label>
        <Input
          id="slug"
          name="slug"
          required
          defaultValue={app?.slug}
          placeholder="cas-cliniques"
          pattern="^[a-z0-9]+(-[a-z0-9]+)*$"
        />
        <p className="text-xs text-foreground-subtle">Minuscules, chiffres et tirets uniquement.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          name="description"
          defaultValue={app?.description ?? ""}
          rows={3}
          className="flex w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50"
          placeholder="Courte description visible dans le hub."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1.5">
          <Label>Icône</Label>
          <IconPicker name="icon" defaultValue={(app?.icon as IconName) ?? ICON_OPTIONS[0]} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status">Statut</Label>
          <Select id="status" name="status" defaultValue={app?.status ?? "coming_soon"}>
            <option value="coming_soon">Bientôt disponible</option>
            <option value="available">Disponible</option>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="route">Route (optionnel)</Label>
          <Input id="route" name="route" defaultValue={app?.route ?? ""} placeholder="/apps/cas-cliniques" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sortOrder">Ordre d&rsquo;affichage</Label>
          <Input
            id="sortOrder"
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={app?.sort_order ?? 0}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground-muted">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={app ? app.is_active : true}
          className="h-4 w-4 rounded border-border-strong text-primary focus-visible:ring-primary/30"
        />
        Module actif et visible dans le hub
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : app ? "Enregistrer les modifications" : "Créer le module"}
      </Button>
    </form>
  );
}
