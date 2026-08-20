"use client";

import { useActionState } from "react";
import { updatePassword, type ActionState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

const initialState: ActionState = {};

export function SetPasswordForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(updatePassword, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      {state?.error && <Alert variant="danger">{state.error}</Alert>}

      <div className="space-y-1.5">
        <Label htmlFor="password">Nouveau mot de passe</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
        />
      </div>

      <p className="text-xs text-foreground-subtle">
        10 caractères minimum, avec au moins une majuscule, une minuscule, un chiffre et un caractère spécial. Aucune expiration
        obligatoire ensuite.
      </p>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Enregistrement…" : "Définir le mot de passe"}
      </Button>
    </form>
  );
}
