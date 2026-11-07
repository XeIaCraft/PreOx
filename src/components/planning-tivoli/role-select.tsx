"use client";

import type { Role } from "@/lib/planning-tivoli/initials";

/** PG or senior: where someone alone goes in a room where either can be (CON). */
export function RoleSelect({ value, onChange }: { value: Role | null; onChange: (r: Role | null) => void }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || null) as Role | null)}
      aria-label="Rôle"
      className="h-9 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-sm text-foreground"
    >
      <option value="">Rôle ?</option>
      <option value="senior">Sénior</option>
      <option value="pg">PG</option>
    </select>
  );
}
