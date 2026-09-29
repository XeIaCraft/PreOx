"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, RefreshCw } from "lucide-react";
import { inviteUser } from "@/app/actions/admin";
import type { ActionState } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { generateTemporaryPassword } from "@/lib/auth/temp-password";
import { cn } from "@/lib/utils";

const initialState: ActionState = {};

export function InviteUserForm() {
  const [state, formAction, pending] = useActionState(inviteUser, initialState);
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "invite">("password");
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Invitation sent: back to the list. Account created with a password: stay to copy it.
    if (state?.success && mode === "invite") {
      router.push("/admin/users");
      router.refresh();
    }
  }, [state?.success, mode, router]);

  if (state?.success && mode === "password")
    return (
      <div className="max-w-md space-y-4">
        <Alert variant="success">{state.success}</Alert>
        <div className="space-y-1.5">
          <Label>Mot de passe provisoire</Label>
          <div className="flex gap-2">
            <Input readOnly value={password} className="font-mono" />
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(password).catch(() => undefined);
                setCopied(true);
              }}
            >
              <Copy className="h-4 w-4" /> {copied ? "Copié" : "Copier"}
            </Button>
          </div>
          <p className="text-xs text-foreground-subtle">Il ne sera plus affiché : transmettez-le maintenant (en main propre ou par message), avec l&apos;adresse de connexion.</p>
        </div>
        <Button onClick={() => router.push("/admin/users")}>Retour aux utilisateurs</Button>
      </div>
    );

  return (
    <form action={formAction} className="max-w-md space-y-4">
      {state?.error && <Alert variant="danger">{state.error}</Alert>}
      <input type="hidden" name="mode" value={mode} />

      <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-md)] border border-border p-1">
        {(
          [
            ["password", "Mot de passe provisoire"],
            ["invite", "Invitation par e-mail"],
          ] as const
        ).map(([code, label]) => (
          <button
            key={code}
            type="button"
            aria-pressed={mode === code}
            onClick={() => {
              setMode(code);
            }}
            className={cn("min-h-10 rounded-[var(--radius-sm)] px-2 text-sm font-medium", mode === code ? "bg-primary text-primary-foreground" : "text-foreground-muted hover:bg-surface-muted")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fullName">Nom complet</Label>
        <Input id="fullName" name="fullName" required placeholder="Marie Dupont" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input id="email" name="email" type="email" required placeholder="marie.dupont@exemple.com" />
      </div>

      {mode === "password" && (
        <div className="space-y-1.5">
          <Label htmlFor="password">Mot de passe provisoire</Label>
          <div className="flex gap-2">
            <Input id="password" name="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" autoComplete="off" placeholder="Tapez-en un ou « Générer »" />
            <Button type="button" variant="secondary" onClick={() => setPassword(generateTemporaryPassword())}>
              <RefreshCw className="h-4 w-4" /> Générer
            </Button>
          </div>
          <p className="text-xs text-foreground-subtle">10 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="role">Rôle</Label>
        <Select id="role" name="role" defaultValue="user">
          <option value="user">Utilisateur</option>
          <option value="admin">Administrateur</option>
        </Select>
      </div>

      <p className="text-xs text-foreground-subtle">
        {mode === "password"
          ? "Le compte est créé tout de suite, sans e-mail. La personne se connecte avec son adresse et ce mot de passe, puis doit en choisir un nouveau. Attribuez-lui ensuite l'accès aux modules depuis sa fiche."
          : "Un e-mail d'invitation est envoyé à cette adresse. La personne définit elle-même son mot de passe en cliquant sur le lien reçu. Vous pourrez ensuite lui attribuer l'accès aux modules depuis sa fiche."}
      </p>

      <Button type="submit" disabled={pending}>
        {pending ? "Création…" : mode === "password" ? "Créer le compte" : "Envoyer l'invitation"}
      </Button>
    </form>
  );
}
