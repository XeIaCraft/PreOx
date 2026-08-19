"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { inviteUser } from "@/app/actions/admin";
import type { ActionState } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

const initialState: ActionState = {};

export function InviteUserForm() {
  const [state, formAction, pending] = useActionState(inviteUser, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state?.success) {
      router.push("/admin/users");
      router.refresh();
    }
  }, [state?.success, router]);

  return (
    <form action={formAction} className="max-w-md space-y-4">
      {state?.error && <Alert variant="danger">{state.error}</Alert>}

      <div className="space-y-1.5">
        <Label htmlFor="fullName">Nom complet</Label>
        <Input id="fullName" name="fullName" required placeholder="Marie Dupont" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input id="email" name="email" type="email" required placeholder="marie.dupont@exemple.com" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="role">Rôle</Label>
        <Select id="role" name="role" defaultValue="user">
          <option value="user">Utilisateur</option>
          <option value="admin">Administrateur</option>
        </Select>
      </div>

      <p className="text-xs text-foreground-subtle">
        Un e-mail d&rsquo;invitation est envoyé à cette adresse. La personne définit elle-même son mot de
        passe en cliquant sur le lien reçu. Vous pourrez ensuite lui attribuer l&rsquo;accès aux modules
        depuis sa fiche.
      </p>

      <Button type="submit" disabled={pending}>
        {pending ? "Envoi de l'invitation…" : "Envoyer l'invitation"}
      </Button>
    </form>
  );
}
