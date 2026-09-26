"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/preop/scores";
import { RULE_TARGETS, type Condition, type RuleAction, type RuleTarget, type SourceLevel } from "@/lib/preop/rules/types";
import { ruleTarget } from "@/lib/preop/rules/target";
import { sourceLevelShort } from "@/lib/preop/rules/engine";

/**
 * A yes/no item that can also be unanswered: a score stays "incomplete"
 * rather than counting an unasked question as "no". Tap: → oui → non → oui.
 */
export function YesNoChip({
  label,
  value,
  onChange,
  derived,
  byDefault,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  derived?: boolean;
  /** What counts while unanswered (« normal by default »): shown plain, one tap to change it. */
  byDefault?: boolean;
}) {
  const shown = value ?? byDefault;
  const isDefault = value === undefined && byDefault !== undefined;
  return (
    <button
      type="button"
      aria-pressed={shown === true}
      title={derived ? "Déduit des données du patient" : isDefault ? `${byDefault ? "Oui" : "Non"} par défaut — touchez pour changer` : undefined}
      onClick={() => onChange(shown !== true)}
      className={cn(
        "min-h-9 rounded-[var(--radius-md)] border px-2.5 py-1 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        shown === true && !isDefault && "border-primary bg-primary text-primary-foreground",
        shown === true && isDefault && "border-primary/50 bg-primary-tint text-foreground",
        shown === false && !isDefault && "border-border bg-surface-muted text-foreground-subtle line-through decoration-foreground-subtle/60",
        shown === false && isDefault && "border-border bg-surface text-foreground-muted hover:bg-surface-muted",
        shown === undefined && "border-dashed border-border-strong bg-surface text-foreground hover:bg-surface-muted"
      )}
    >
      {label}
      {derived && <span className="ml-1 opacity-70">·auto</span>}
    </button>
  );
}

/**
 * A small « i » that opens an explanation (legend of a score, what a choice
 * means) without taking room on the screen: on hover with a mouse, on tap
 * on a phone. The bubble stays inside the window.
 */
export function InfoTip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const hover = useRef(false);
  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(320, window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
    const below = r.bottom + 6;
    setPos({ top: below + 260 > window.innerHeight && r.top > 280 ? Math.max(8, r.top - 6 - 260) : below, left, width });
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (e.type === "pointerdown" && (btn.current?.contains(e.target as Node) || bubble.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [open]);
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`Explication : ${label}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          // Opened by hovering with a mouse: the click pins it open instead of closing it.
          if (hover.current) {
            hover.current = false;
            setOpen(true);
            return;
          }
          place();
          setOpen((o) => !o);
        }}
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse") return;
          hover.current = true;
          place();
          setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "mouse" || !hover.current) return;
          hover.current = false;
          setOpen(false);
        }}
        className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-foreground-subtle hover:bg-surface-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", className)}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && pos && (
        <div
          ref={bubble}
          role="tooltip"
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
          className="z-50 max-h-[260px] overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface p-2.5 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-foreground shadow-lg"
        >
          <p className="mb-1 font-semibold">{label}</p>
          {children}
        </div>
      )}
    </>
  );
}

/** A legend as a short list: « I — palais mou, luette, piliers visibles ». */
export function Legend({ rows, source }: { rows: { code: React.ReactNode; text: React.ReactNode }[]; source?: string }) {
  return (
    <div className="space-y-1">
      <ul className="space-y-0.5">
        {rows.map((r, i) => (
          <li key={i} className="flex gap-2">
            <span className="w-10 shrink-0 font-mono font-semibold tabular-nums">{r.code}</span>
            <span className="min-w-0 text-foreground-muted">{r.text}</span>
          </li>
        ))}
      </ul>
      {source && <p className="text-[10px] text-foreground-subtle">{source}</p>}
    </div>
  );
}

/**
 * One choice among a few, with a « normal » value that counts until another
 * is picked: shown selected in a lighter tone, so a tap is needed only to
 * report a problem.
 */
export function DefaultChips<T extends string | number>({
  options,
  value,
  fallback,
  onChange,
}: {
  options: { code: T; label: string; title?: string }[];
  value: T | undefined;
  fallback: T;
  onChange: (v: T | undefined) => void;
}) {
  const shown = value ?? fallback;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const selected = o.code === shown;
        const isDefault = selected && value === undefined;
        return (
          <button
            key={String(o.code)}
            type="button"
            title={isDefault ? "Par défaut — touchez une autre valeur pour signaler un problème" : o.title}
            aria-pressed={selected}
            onClick={() => onChange(o.code === fallback && value !== undefined && selected ? undefined : o.code)}
            className={cn(
              "min-h-9 rounded-[var(--radius-md)] border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              selected && !isDefault && "border-primary bg-primary text-primary-foreground",
              isDefault && "border-primary/50 bg-primary-tint text-foreground",
              !selected && "border-border bg-surface text-foreground hover:bg-surface-muted"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
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

/** A draft rule: shown for information, applied only once checked and activated. */
export function DraftPill() {
  return (
    <span title="Règle en brouillon : à vérifier dans la source puis activer (Réglages › Règles). Jamais appliquée automatiquement." className="inline-flex w-fit items-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
      À valider
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
  onEmpty,
  ariaLabel,
}: {
  placeholder: string;
  search: (q: string) => ComboOption[];
  onPick: (o: ComboOption) => void;
  onFree?: (q: string) => void;
  freeLabel?: (q: string) => string;
  autoFocus?: boolean;
  /** Options shown on focus before anything is typed (suggestions). */
  onEmpty?: () => ComboOption[];
  ariaLabel?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = open ? (q.trim() ? search(q) : (onEmpty?.() ?? [])) : [];
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
        aria-label={ariaLabel ?? placeholder}
        autoComplete="off"
        className="h-10 w-full min-w-0 rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      />
      {open && (q.trim() ? results.length > 0 || onFree : results.length > 0) && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface shadow-lg">
          {results.map((o) => (
            <button key={o.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted">
              <span className="min-w-0 truncate">{o.label}</span>
              {o.hint && <span className="shrink-0 text-[11px] text-foreground-subtle">{o.hint}</span>}
            </button>
          ))}
          {onFree && q.trim() && !exact && (
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
