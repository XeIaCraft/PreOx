"use client";

import { useMemo, useState } from "react";
import { Check, Mic, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/preop/ui";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { applyQuickEntry, isEmptyQuickEntry, parseQuickEntry, selectAll, type QuickSelection } from "@/lib/preop/quick-entry";
import { DRUGS, QUALIFIER_LABELS } from "@/lib/preop/history";
import type { ConsultationState } from "@/lib/preop/dossier";
import { cn } from "@/lib/utils";

function Pick({ on, onToggle, children, tone = "default" }: { on: boolean; onToggle: () => void; children: React.ReactNode; tone?: "default" | "danger" | "muted" }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-left text-xs transition-colors",
        !on && "border-dashed border-border-strong bg-surface text-foreground-subtle line-through",
        on && tone === "default" && "border-primary/40 bg-primary-tint text-primary-strong",
        on && tone === "danger" && "border-danger/40 bg-danger-tint text-danger",
        on && tone === "muted" && "border-border bg-surface-muted text-foreground"
      )}
    >
      {on ? <Check className="h-3 w-3 shrink-0" /> : null}
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}

/**
 * Type or dictate (the phone keyboard's microphone) the antecedents,
 * treatments, allergies and habits in one go; check what was recognised,
 * untick what's wrong, add everything in one tap.
 */
export function QuickEntryPanel({ value, onChange, onClose }: { value: ConsultationState; onChange: (c: ConsultationState) => void; onClose: () => void }) {
  const { catalogs } = useCatalogs();
  const [text, setText] = useState("");
  const result = useMemo(() => parseQuickEntry(text, catalogs), [text, catalogs]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExcluded((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const on = (key: string) => !excluded.has(key);
  const all = selectAll(result);
  const selection: QuickSelection = {
    conditions: all.conditions.filter((id) => on(`c:${id}`)),
    treatments: all.treatments.filter((atc) => on(`t:${atc}`)),
    allergies: all.allergies.filter((i) => on(`a:${i}`)),
    substances: on("s"),
    unknownToHistory: on("u"),
  };
  const s = result.substances;
  const substanceText = [
    s.tobacco === "current" ? "Fumeur" : s.tobacco === "former" ? "Ancien fumeur" : s.tobacco === "never" ? "Non-fumeur" : "",
    s.packYears ? `${s.packYears} PA` : "",
    s.alcoholUnitsPerWeek ? `alcool ${s.alcoholUnitsPerWeek} U/sem` : "",
    s.alcoholDependence ? "dépendance à l'alcool" : "",
    s.drugs?.length ? s.drugs.map((d) => DRUGS.find((x) => x.code === d)?.label.split(" (")[0]).join(", ") : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Panel
      title="Saisie rapide"
      actions={
        <button type="button" onClick={onClose} className="rounded p-1 text-foreground-subtle hover:text-foreground" aria-label="Fermer la saisie rapide">
          <X className="h-4 w-4" />
        </button>
      }
    >
      <p className="flex items-start gap-1.5 text-xs text-foreground-muted">
        <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Tapez ou dictez (micro du clavier) : antécédents, traitements et doses, allergies, tabac, alcool — séparés par des virgules.
      </p>
      <textarea
        autoFocus
        rows={3}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setExcluded(new Set());
        }}
        placeholder="ex. HTA mal contrôlée, diabète sous metformine 850 mg 2x/j, stent 2021 sous Asaflow, allergie pénicilline, fumeur 20 PA"
        className="block w-full resize-y rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      />
      {text.trim() && !isEmptyQuickEntry(result) && (
        <div className="space-y-2">
          {result.conditions.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">Antécédents</p>
              <div className="flex flex-wrap gap-1.5">
                {result.conditions.map((c) => (
                  <Pick key={c.id} on={on(`c:${c.id}`)} onToggle={() => toggle(`c:${c.id}`)}>
                    {c.label}
                    {c.qualifiers.length ? ` · ${c.qualifiers.map((q) => catalogs.conditions.find((x) => x.id === c.id)?.qualifiers?.[q] ?? QUALIFIER_LABELS[q]).join(", ")}` : ""}
                  </Pick>
                ))}
              </div>
            </div>
          )}
          {result.treatments.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">Traitements</p>
              <div className="flex flex-wrap gap-1.5">
                {result.treatments.map((t) => (
                  <Pick key={t.atc} on={on(`t:${t.atc}`)} onToggle={() => toggle(`t:${t.atc}`)}>
                    {t.name}
                    {t.dailyDoseMg ? ` · ${t.dailyDoseMg} mg/j` : ""}
                  </Pick>
                ))}
              </div>
            </div>
          )}
          {result.allergies.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">Allergies</p>
              <div className="flex flex-wrap gap-1.5">
                {result.allergies.map((a, i) => (
                  <Pick key={i} tone="danger" on={on(`a:${i}`)} onToggle={() => toggle(`a:${i}`)}>
                    {a.label}
                    {a.allergenId ? "" : " (non reconnue)"}
                  </Pick>
                ))}
              </div>
            </div>
          )}
          {substanceText && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">Assuétudes</p>
              <Pick on={on("s")} onToggle={() => toggle("s")} tone="muted">
                {substanceText}
              </Pick>
            </div>
          )}
          {result.unknown.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">Non reconnu — dans « Autres antécédents »</p>
              <Pick on={on("u")} onToggle={() => toggle("u")} tone="muted">
                {result.unknown.join(" ; ")}
              </Pick>
            </div>
          )}
          <Button
            size="sm"
            onClick={() => {
              onChange(applyQuickEntry(value, result, selection));
              setText("");
              onClose();
            }}
          >
            <Check className="h-3.5 w-3.5" /> Ajouter à la consultation
          </Button>
        </div>
      )}
      {text.trim() && isEmptyQuickEntry(result) && <p className="text-xs text-foreground-subtle">Rien de reconnu pour l&apos;instant.</p>}
    </Panel>
  );
}
