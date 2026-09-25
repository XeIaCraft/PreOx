"use client";

import { AlertOctagon, AlertTriangle, ClipboardCopy, Info, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Panel } from "@/components/preop/ui";
import type { AttentionLevel, AttentionPoint } from "@/lib/preop/attention";
import { FASTING_SOURCE, instructionsText, type Instructions } from "@/lib/preop/instructions";
import { cn } from "@/lib/utils";

const ICONS: Record<AttentionLevel, typeof Info> = { high: AlertOctagon, medium: AlertTriangle, info: Info };
const COLORS: Record<AttentionLevel, string> = { high: "text-danger", medium: "text-accent", info: "text-foreground-subtle" };

/**
 * What this patient calls for, generated from the consultation. In the case
 * preparation, `onAdd` puts a point's equipment and risk into the plan.
 */
export function AttentionPanel({ points, onAdd, added, title = "Points d'attention" }: { points: AttentionPoint[]; onAdd?: (p: AttentionPoint) => void; added?: (p: AttentionPoint) => boolean; title?: string }) {
  if (points.length === 0) return null;
  const addable = onAdd ? points.filter((p) => (p.material?.length || p.risk) && !added?.(p)) : [];
  return (
    <Panel
      title={title}
      actions={
        addable.length > 1 && (
          <Button size="sm" variant="secondary" onClick={() => addable.forEach((p) => onAdd!(p))}>
            <ListPlus className="h-3.5 w-3.5" /> Tout ajouter au plan
          </Button>
        )
      }
    >
      <ul className="space-y-2">
        {points.map((p) => {
          const Icon = ICONS[p.level];
          const canAdd = onAdd && (p.material?.length || p.risk);
          const isAdded = added?.(p);
          return (
            <li key={p.id} className="flex gap-2">
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", COLORS[p.level])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{p.title}</p>
                <p className="text-xs text-foreground-muted">{p.detail}</p>
                {p.material?.length ? <p className="text-[11px] text-foreground-subtle">Matériel : {p.material.join(", ")}</p> : null}
              </div>
              {canAdd &&
                (isAdded ? (
                  <span className="shrink-0 self-start rounded bg-success-tint px-1.5 py-0.5 text-[11px] text-success">au plan</span>
                ) : (
                  <Button size="sm" variant="ghost" className="shrink-0 self-start" onClick={() => onAdd!(p)} aria-label={`Ajouter au plan : ${p.title}`}>
                    <ListPlus className="h-3.5 w-3.5" />
                  </Button>
                ))}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-foreground-subtle">Rappels générés à partir de la consultation : précautions générales, à adapter ; les délais et doses viennent de vos règles et protocoles.</p>
    </Panel>
  );
}

export function InstructionsPanel({ instructions }: { instructions: Instructions }) {
  const { toast } = useToast();
  const text = instructionsText(instructions);
  if (!instructions.fasting.length && !instructions.treatments.length && !instructions.undecided.length) return null;
  return (
    <Panel
      title="Consignes au patient"
      actions={
        text && (
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                toast("Consignes copiées.", { variant: "success" });
              } catch {
                toast("Copie impossible sur ce navigateur.", { variant: "error" });
              }
            }}
          >
            <ClipboardCopy className="h-3.5 w-3.5" /> Copier
          </Button>
        )
      }
    >
      {instructions.fasting.length > 0 ? (
        <div className="space-y-0.5">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Jeûne</p>
          <ul className="list-disc space-y-0.5 pl-4 text-sm text-foreground">
            {instructions.fasting.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="text-[11px] text-foreground-subtle">Délais : {FASTING_SOURCE}.</p>
        </div>
      ) : (
        <p className="text-xs text-foreground-subtle">Fixez la date et l&apos;heure prévues : les heures de jeûne se calculent.</p>
      )}
      {instructions.treatments.length > 0 && (
        <div className="space-y-0.5">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Traitements</p>
          <ul className="list-disc space-y-0.5 pl-4 text-sm text-foreground">
            {instructions.treatments.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      {instructions.undecided.length > 0 && <p className="text-xs text-accent">Sans consigne de vos règles : {instructions.undecided.join(", ")} — à préciser au patient.</p>}
    </Panel>
  );
}
