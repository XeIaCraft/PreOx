"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/preop/scores";
import { RULE_TARGETS, type Condition, type RuleAction, type RuleTarget, type SourceLevel } from "@/lib/preop/rules/types";
import { ruleTarget } from "@/lib/preop/rules/target";
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
  book: "border border-border text-foreground-muted",
  article: "bg-surface-muted text-foreground-subtle",
};

const TARGET_TAGS: Record<RuleTarget, { text: string; className: string }> = {
  surgery: { text: "Concerne la chirurgie", className: "bg-accent-tint text-accent" },
  anaesthesia: { text: "Concerne l'anesthésie", className: "bg-primary-tint text-primary-strong" },
  both: { text: "Chirurgie et anesthésie", className: "bg-surface-muted text-foreground-muted" },
};

/** What the rule protects — the surgery, the anaesthesia or both — with the meaning on hover. */
export function TargetTag({ rule }: { rule: { conditions: Condition[]; action: RuleAction } }) {
  const target = ruleTarget(rule);
  const tag = TARGET_TAGS[target];
  return (
    <span title={RULE_TARGETS.find((t) => t.code === target)?.detail} className={cn("inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", tag.className)}>
      {tag.text}
    </span>
  );
}

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

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="block text-xs font-medium uppercase tracking-wide text-foreground-subtle">{children}</span>;
}

/** Multi-line text, uncontrolled like NumberField (the form above it can be remounted with a key). */
export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        rows={rows}
        placeholder={placeholder}
        defaultValue={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full min-w-0 resize-y rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      />
    </label>
  );
}

/** A titled block of a screen — same look everywhere in the module. */
export function Panel({ title, actions, children, className }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3 sm:p-4", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="font-serif-display text-lg font-medium text-foreground">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** "2026-10-08T08:00" (datetime-local, local time) → ISO, or undefined. */
export function localToIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** ISO → "2026-10-08T08:00" for a datetime-local input. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-BE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Compact number field: small label, unit inside the box — three per row on a phone. */
export function MiniNumber({ label, value, onChange, unit, placeholder }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; unit?: string; placeholder?: string }) {
  return (
    <label className="block min-w-0">
      <span className="block truncate text-[11px] font-medium text-foreground-subtle">{label}</span>
      <span className="relative mt-0.5 block">
        <input
          type="text"
          inputMode="decimal"
          placeholder={placeholder}
          defaultValue={value === undefined ? "" : String(value).replace(".", ",")}
          onChange={(e) => {
            const raw = e.target.value.trim().replace(",", ".");
            const n = Number(raw);
            if (raw === "") onChange(undefined);
            else if (Number.isFinite(n)) onChange(n);
          }}
          className={cn(
            "h-9 w-full min-w-0 rounded-[var(--radius-sm)] border border-border bg-surface pl-2.5 text-sm tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
            unit ? "pr-11" : "pr-2"
          )}
        />
        {unit && <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-foreground-subtle">{unit}</span>}
      </span>
    </label>
  );
}

export interface ComboOption {
  key: string;
  label: string;
  hint?: string;
}

/**
 * Type → suggestions → tap to add. `onFree` adds what was typed when
 * nothing fits. The list stays under the field, above what follows.
 */
export function Combobox({
  placeholder,
  search,
  onPick,
  onFree,
  freeLabel = (q: string) => `Ajouter « ${q} »`,
  autoFocus,
}: {
  placeholder: string;
  search: (q: string) => ComboOption[];
  onPick: (o: ComboOption) => void;
  onFree?: (q: string) => void;
  freeLabel?: (q: string) => string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = open && q.trim() ? search(q) : [];
  const exact = results.some((r) => r.label.toLowerCase() === q.trim().toLowerCase());
  const pick = (o: ComboOption) => {
    onPick(o);
    setQ("");
  };
  return (
    <div className="relative">
      <input
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (results[0]) pick(results[0]);
          else if (onFree && q.trim()) {
            onFree(q.trim());
            setQ("");
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="h-10 w-full min-w-0 rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      />
      {open && q.trim() && (results.length > 0 || onFree) && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface shadow-lg">
          {results.map((o) => (
            <button key={o.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted">
              <span className="min-w-0 truncate">{o.label}</span>
              {o.hint && <span className="shrink-0 text-[11px] text-foreground-subtle">{o.hint}</span>}
            </button>
          ))}
          {onFree && !exact && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onFree(q.trim());
                setQ("");
              }}
              className="w-full px-3 py-2 text-left text-sm text-primary hover:bg-surface-muted"
            >
              {freeLabel(q.trim())}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A removable tag. */
export function Tag({ children, onRemove, tone = "default", onClick }: { children: React.ReactNode; onRemove?: () => void; tone?: "default" | "auto" | "danger"; onClick?: () => void }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pl-2.5 text-xs",
        onRemove ? "pr-1" : "pr-2.5",
        tone === "default" && "border-primary/40 bg-primary-tint text-primary-strong",
        tone === "auto" && "border-dashed border-primary/40 bg-surface text-primary-strong",
        tone === "danger" && "border-danger/40 bg-danger-tint text-danger"
      )}
    >
      {onClick ? (
        <button type="button" onClick={onClick} className="min-w-0 truncate text-left">
          {children}
        </button>
      ) : (
        <span className="min-w-0 truncate">{children}</span>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} className="rounded-full p-0.5 opacity-70 hover:opacity-100" aria-label="Retirer">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

/** A <details> whose open state is kept by React (it stays open while its content changes). */
export function Disclosure({ initialOpen = false, summary, children, className, summaryClassName }: { initialOpen?: boolean; summary: React.ReactNode; children: React.ReactNode; className?: string; summaryClassName?: string }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <details className={className} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={summaryClassName}>{summary}</summary>
      {children}
    </details>
  );
}
