"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/preop/scores";
import type { SourceLevel } from "@/lib/preop/rules/types";
import { sourceLevelShort } from "@/lib/preop/rules/engine";

/**
 * A yes/no item that can also be unanswered: a score stays "incomplete"
 * rather than counting an unasked question as "no". Tap: → oui → non → oui.
 */
export function YesNoChip({ label, value, onChange, derived }: { label: string; value: boolean | undefined; onChange: (v: boolean) => void; derived?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={value === true}
      title={derived ? "Déduit des données du patient" : undefined}
      onClick={() => onChange(value !== true)}
      className={cn(
        "min-h-9 rounded-[var(--radius-md)] border px-2.5 py-1 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        value === true && "border-primary bg-primary text-primary-foreground",
        value === false && "border-border bg-surface-muted text-foreground-subtle line-through decoration-foreground-subtle/60",
        value === undefined && "border-dashed border-border-strong bg-surface text-foreground hover:bg-surface-muted"
      )}
    >
      {label}
      {derived && <span className="ml-1 opacity-70">·auto</span>}
    </button>
  );
}

const LEVEL_STYLES: Record<RiskLevel, string> = {
  low: "bg-success-tint text-success",
  intermediate: "bg-accent-tint text-accent",
  high: "bg-danger-tint text-danger",
  info: "bg-surface-muted text-foreground-muted",
};

export function RiskPill({ level, children }: { level: RiskLevel; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", LEVEL_STYLES[level])}>{children}</span>;
}

/** Collapsible card: the result stays visible in the header when closed. */
export function ScoreCard({
  title,
  summary,
  level,
  missing,
  reference,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: string;
  level: RiskLevel;
  missing?: number;
  reference?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left sm:px-4">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{title}</span>
          {missing ? <span className="block text-xs text-foreground-subtle">{missing} item{missing > 1 ? "s" : ""} à renseigner</span> : null}
        </span>
        {summary && <RiskPill level={level}>{summary}</RiskPill>}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-foreground-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3 sm:px-4">
          {children}
          {reference && <p className="text-[11px] text-foreground-subtle">Référence : {reference}</p>}
        </div>
      )}
    </section>
  );
}

const SOURCE_STYLES: Record<SourceLevel, string> = {
  local: "border border-dashed border-border-strong text-foreground-muted",
  be_inst: "bg-primary text-primary-foreground",
  be_soc: "bg-primary-tint text-primary-strong",
  eu: "bg-accent-tint text-accent",
  int: "bg-surface-muted text-foreground-muted",
  article: "bg-surface-muted text-foreground-subtle",
};

export function SourceBadge({ level }: { level: SourceLevel }) {
  return <span className={cn("inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide", SOURCE_STYLES[level])}>{sourceLevelShort(level)}</span>;
}

export function NumberField({
  label,
  value,
  onChange,
  unit,
  step = "any",
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  unit?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium uppercase tracking-wide text-foreground-subtle">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="text"
          inputMode="decimal"
          step={step}
          placeholder={placeholder}
          // Uncontrolled so typing "1," isn't rewritten while the value is already used by the scores.
          defaultValue={value === undefined ? "" : String(value).replace(".", ",")}
          onChange={(e) => {
            const raw = e.target.value.trim().replace(",", ".");
            const n = Number(raw);
            if (raw === "") onChange(undefined);
            else if (Number.isFinite(n)) onChange(n);
          }}
          className="h-10 w-full min-w-0 rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
        {unit && <span className="shrink-0 text-xs text-foreground-subtle">{unit}</span>}
      </span>
    </label>
  );
}
