"use client";

import { cn } from "@/lib/utils";

/** Big tap targets for one-handed entry between two patients. Single choice; tapping the selected chip again clears it when `allowClear`. */
export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  allowClear = false,
  className,
  size = "md",
}: {
  options: { code: T; label: string; title?: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
  allowClear?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const selected = o.code === value;
        return (
          <button
            key={String(o.code)}
            type="button"
            title={o.title}
            aria-pressed={selected}
            onClick={() => onChange(selected && allowClear ? null : o.code)}
            className={cn(
              "rounded-[var(--radius-md)] border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              size === "md" ? "min-h-11 px-3 text-sm" : "min-h-9 px-2.5 text-xs",
              selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground hover:bg-surface-muted"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Multiple choice: each chip toggles its code in or out of `value`. */
export function MultiChipGroup({
  options,
  value,
  onChange,
  className,
}: {
  options: { code: string; label: string; title?: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const selected = value.includes(o.code);
        return (
          <button
            key={o.code}
            type="button"
            title={o.title}
            aria-pressed={selected}
            onClick={() => onChange(selected ? value.filter((v) => v !== o.code) : [...value, o.code])}
            className={cn(
              "min-h-9 rounded-[var(--radius-md)] border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground hover:bg-surface-muted"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Independent on/off chip (multi-select groups). */
export function ToggleChip({ pressed, onChange, children, className }: { pressed: boolean; onChange: (pressed: boolean) => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={cn(
        "min-h-11 rounded-[var(--radius-md)] border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        pressed ? "border-primary bg-primary-tint text-primary-strong" : "border-border bg-surface text-foreground hover:bg-surface-muted",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">{label}</p>
      {children}
      {hint && <p className="text-xs text-foreground-subtle">{hint}</p>}
    </div>
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full resize-y rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        props.className
      )}
    />
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-border-strong bg-surface px-5 py-8 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {children && <div className="mt-2 text-sm text-foreground-muted">{children}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-serif-display text-xl font-medium text-foreground">{children}</h2>
      {action}
    </div>
  );
}
