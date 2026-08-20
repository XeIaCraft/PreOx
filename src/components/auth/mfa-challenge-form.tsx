"use client";

import { useActionState } from "react";
import { verifyMfaChallenge, type ActionState } from "@/app/actions/mfa";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

const initialState: ActionState = {};

export function MfaChallengeForm() {
  const [state, formAction, pending] = useActionState(verifyMfaChallenge, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && <Alert variant="danger">{state.error}</Alert>}

      <div className="space-y-1.5">
        <Label htmlFor="code">Code à 6 chiffres</Label>
        <Input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          autoFocus
          placeholder="000000"
          className="text-center text-lg tracking-[0.3em]"
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Vérification…" : "Vérifier"}
      </Button>
    </form>
  );
}
