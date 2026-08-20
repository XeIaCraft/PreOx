"use client";

import { useTransition } from "react";
import { Flag as FlagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveFlag } from "@/app/apps/el-profesor/actions/flags";
import { useToast } from "@/components/ui/toast";
import type { Flag } from "@/lib/el-profesor/types";

export function FlagsList({ flags, onResolved }: { flags?: Flag[]; onResolved: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  if (!flags || flags.length === 0) return null;

  function handleResolve(flagId: string) {
    startTransition(async () => {
      const result = await resolveFlag(flagId);
      if (result.error) toast(result.error, { variant: "error" });
      else onResolved();
    });
  }

  return (
    <div className="mt-2 space-y-1.5">
      {flags.map((flag) => (
        <div key={flag.id} className="flex items-start justify-between gap-2 rounded-[var(--radius-sm)] bg-danger-tint/40 px-2.5 py-1.5">
          <p className="flex items-start gap-1.5 text-xs text-foreground-muted">
            <FlagIcon className="mt-0.5 h-3 w-3 shrink-0 text-danger" />
            {flag.reason || "Signalé sans motif précisé."}
          </p>
          <Button variant="ghost" size="sm" onClick={() => handleResolve(flag.id)} disabled={isPending} className="h-6 shrink-0 px-2 text-xs">
            Résolu
          </Button>
        </div>
      ))}
    </div>
  );
}
