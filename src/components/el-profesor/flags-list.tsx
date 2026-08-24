"use client";

import { useState, useTransition } from "react";
import { Flag as FlagIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveFlag } from "@/app/apps/el-profesor/actions/flags";
import { useToast } from "@/components/ui/toast";
import type { Flag } from "@/lib/el-profesor/types";

/**
 * `onSuggestFix` (piste 2026-08-24, "boucler les signalements vers la
 * régénération") is optional and provided only by editors that know how
 * to apply the result (block text vs. flashcard front/back) — it never
 * applies anything itself, just hands the flag to the caller and reports
 * pending state per flag id.
 */
export function FlagsList({
  flags,
  onResolved,
  onSuggestFix,
}: {
  flags?: Flag[];
  onResolved: () => void;
  onSuggestFix?: (flag: Flag) => Promise<void>;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [suggestingId, setSuggestingId] = useState<string | null>(null);

  if (!flags || flags.length === 0) return null;

  function handleResolve(flagId: string) {
    startTransition(async () => {
      const result = await resolveFlag(flagId);
      if (result.error) toast(result.error, { variant: "error" });
      else onResolved();
    });
  }

  function handleSuggestFix(flag: Flag) {
    if (!onSuggestFix) return;
    setSuggestingId(flag.id);
    onSuggestFix(flag).finally(() => setSuggestingId(null));
  }

  return (
    <div className="mt-2 space-y-1.5">
      {flags.map((flag) => (
        <div key={flag.id} className="flex items-start justify-between gap-2 rounded-[var(--radius-sm)] bg-danger-tint/40 px-2.5 py-1.5">
          <p className="flex items-start gap-1.5 text-xs text-foreground-muted">
            <FlagIcon className="mt-0.5 h-3 w-3 shrink-0 text-danger" />
            {flag.reason || "Signalé sans motif précisé."}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {onSuggestFix && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSuggestFix(flag)}
                disabled={suggestingId !== null}
                className="h-6 px-2 text-xs"
                title="Pré-remplir le formulaire avec une correction suggérée par IA — à relire avant d'enregistrer"
              >
                <Sparkles className="h-3 w-3" /> {suggestingId === flag.id ? "…" : "Corriger (IA)"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => handleResolve(flag.id)} disabled={isPending} className="h-6 px-2 text-xs">
              Résolu
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
