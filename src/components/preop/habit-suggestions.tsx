"use client";

import { useMemo, useState } from "react";
import { GitBranchPlus, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Panel } from "@/components/preop/ui";
import type { ProtocolInput } from "@/components/preop/use-protocols";
import type { Dossier } from "@/lib/preop/dossier";
import { applyChanges, habitSuggestions, variantName, type HabitSuggestion } from "@/lib/preop/plan-habits";
import type { Protocol } from "@/lib/preop/protocols";

const DISMISSED_KEY = "preox:preop:habits-dismissed";

function readDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/**
 * Habits of this protocol (plan-habits.ts): the same change made almost every
 * time → update the protocol; a recurring set of changes while the protocol is
 * still used as it is → a variant. Nothing changes until it is accepted.
 */
export function HabitSuggestions({
  protocol,
  dossiers,
  canEdit,
  onSaveProtocol,
  onUseVariant,
}: {
  protocol: Protocol | undefined;
  dossiers: Dossier[];
  canEdit: boolean;
  onSaveProtocol: (p: ProtocolInput) => Promise<Protocol>;
  onUseVariant: (p: Protocol) => void;
}) {
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState<Set<string>>(() => (typeof window === "undefined" ? new Set() : readDismissed()));
  const [busy, setBusy] = useState(false);
  const suggestions = useMemo(() => (protocol ? habitSuggestions(protocol, dossiers, dismissed) : []), [protocol, dossiers, dismissed]);
  if (!protocol || !canEdit || suggestions.length === 0) return null;

  function dismiss(s: HabitSuggestion) {
    const next = new Set(dismissed).add(s.id);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
    } catch {
      // private window: forgotten at the next visit
    }
  }

  async function accept(s: HabitSuggestion) {
    if (!protocol) return;
    setBusy(true);
    try {
      const content = applyChanges(protocol.content, s.changes);
      if (s.kind === "update") {
        await onSaveProtocol({ id: protocol.id, name: protocol.name, surgery: protocol.surgery, operation_category: protocol.operation_category, hospital: protocol.hospital, content, source: protocol.source });
        toast(`Protocole « ${protocol.name} » mis à jour.`, { variant: "success" });
      } else {
        const saved = await onSaveProtocol({ id: crypto.randomUUID(), name: variantName(protocol, s.changes), surgery: protocol.surgery, operation_category: protocol.operation_category, hospital: protocol.hospital, content, source: "" });
        toast(`Variante « ${saved.name} » créée.`, { variant: "success" });
        if (confirm(`Appliquer la variante « ${saved.name} » à ce patient ?`)) onUseVariant(saved);
      }
      dismiss(s);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Enregistrement impossible.", { variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Vos habitudes">
      <ul className="space-y-3">
        {suggestions.map((s) => (
          <li key={s.id} className="space-y-2 rounded-[var(--radius-md)] border border-border p-3 text-sm">
            <p className="text-foreground">
              {s.kind === "update" ? (
                <>Sur les {s.total} derniers plans « {s.protocolName} », vous avez fait ce changement {s.count} fois : mettre à jour le plan de base ?</>
              ) : (
                <>Sur les {s.total} derniers plans « {s.protocolName} », {s.count} ont les mêmes changements, les autres gardent le plan de base : en faire une variante ?</>
              )}
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-foreground-muted">
              {s.changes.map((c) => (
                <li key={c.key}>{c.label}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => void accept(s)}>
                {s.kind === "update" ? <RefreshCcw className="h-3.5 w-3.5" /> : <GitBranchPlus className="h-3.5 w-3.5" />}
                {s.kind === "update" ? "Mettre à jour le protocole" : "Créer la variante"}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => dismiss(s)}>
                Garder tel quel
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
