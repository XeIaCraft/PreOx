"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { enrollMfa, confirmMfaEnrollment, unenrollMfa, type MfaFactor } from "@/app/actions/mfa";

export function MfaSection({ factors }: { factors: MfaFactor[] }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const verified = factors.find((f) => f.status === "verified");
  const [enrolling, setEnrolling] = useState<{ factorId: string; qrCodeSvg: string; secret: string } | null>(null);
  const [code, setCode] = useState("");

  function handleStart() {
    startTransition(async () => {
      const result = await enrollMfa();
      if (result.error || !result.factorId || !result.qrCodeSvg || !result.secret) {
        toast(result.error ?? "Impossible de démarrer l'activation.", { variant: "error" });
        return;
      }
      setEnrolling({ factorId: result.factorId, qrCodeSvg: result.qrCodeSvg, secret: result.secret });
    });
  }

  function handleConfirm() {
    if (!enrolling || !code.trim()) return;
    startTransition(async () => {
      const result = await confirmMfaEnrollment(enrolling.factorId, code);
      if (result.error) {
        toast(result.error, { variant: "error" });
        return;
      }
      toast(result.success ?? "", { variant: "success" });
      setEnrolling(null);
      setCode("");
    });
  }

  function handleDisable() {
    if (!verified) return;
    startTransition(async () => {
      const result = await unenrollMfa(verified.id);
      if (result.error) toast(result.error, { variant: "error" });
      else toast(result.success ?? "", { variant: "success" });
    });
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6">
      <h2 className="font-serif-display text-lg font-medium text-foreground">Authentification à deux facteurs</h2>
      <p className="mt-1 text-sm text-foreground-muted">
        Optionnelle : demande un code à 6 chiffres généré par une application d&rsquo;authentification (Google Authenticator, Authy…) en plus
        de votre mot de passe.
      </p>

      <div className="mt-4">
        {verified ? (
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-success-tint bg-success-tint px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium text-success">
              <ShieldCheck className="h-4 w-4" />
              Activée
            </span>
            <Button variant="secondary" size="sm" onClick={handleDisable} disabled={isPending}>
              <ShieldOff className="h-4 w-4" />
              Désactiver
            </Button>
          </div>
        ) : enrolling ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground-muted">
              Scannez ce code avec votre application d&rsquo;authentification, ou entrez la clé manuellement, puis confirmez avec le code généré.
            </p>
            <div
              className="h-40 w-40 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: enrolling.qrCodeSvg }}
            />
            <p className="break-all rounded-[var(--radius-sm)] bg-surface-muted px-2 py-1 font-mono text-xs text-foreground-muted">
              {enrolling.secret}
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="mfa-code">Code de confirmation</Label>
                <Input
                  id="mfa-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                />
              </div>
              <Button onClick={handleConfirm} disabled={isPending || !code.trim()}>
                Confirmer
              </Button>
              <Button variant="secondary" onClick={() => setEnrolling(null)} disabled={isPending}>
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={handleStart} disabled={isPending}>
            <ShieldCheck className="h-4 w-4" />
            Activer la 2FA
          </Button>
        )}
      </div>
    </div>
  );
}
