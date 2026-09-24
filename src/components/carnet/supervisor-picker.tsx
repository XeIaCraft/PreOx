"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { newId, putRow } from "@/lib/carnet/mutations";
import { supervisorName } from "@/lib/carnet/referentiel";
import type { CarnetSupervisor } from "@/lib/carnet/types";
import { cn } from "@/lib/utils";

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Supervisor field of the case/duty/stage forms. One tap on a quick pick
 * (the supervisors used most on this hospital), otherwise type to search
 * the referential — and if nobody matches, create the supervisor on the
 * spot ("Dr Martin" → nom "Martin", prénom vide, completable later in
 * Superviseurs) without leaving the form.
 */
export function SupervisorPicker({
  value,
  onChange,
  hospital,
  usage,
  placeholder = "Rechercher ou ajouter un superviseur…",
  defaultRole = "",
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  /** Hospital of the current stage — its usual supervisors are offered first. */
  hospital?: string;
  /** How many times each supervisor was used in this context (quick picks, most used first). */
  usage?: Map<string, number>;
  placeholder?: string;
  defaultRole?: string;
}) {
  const { data, commit } = useCarnet();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = data.supervisors.find((s) => s.id === value) ?? null;

  const ranked = useMemo(() => {
    const score = (s: CarnetSupervisor) => (usage?.get(s.id) ?? 0) * 10 + (hospital && normalize(s.usual_hospital) === normalize(hospital) ? 5 : 0);
    return data.supervisors.filter((s) => !s.archived).sort((a, b) => score(b) - score(a) || a.last_name.localeCompare(b.last_name));
  }, [data.supervisors, usage, hospital]);

  const quickPicks = ranked.filter((s) => (usage?.get(s.id) ?? 0) > 0 || (hospital && normalize(s.usual_hospital) === normalize(hospital))).slice(0, 4);
  const q = normalize(query.trim());
  const matches = q ? ranked.filter((s) => normalize(`${s.first_name} ${s.last_name} ${s.last_name} ${s.first_name}`).includes(q)).slice(0, 8) : ranked.slice(0, 8);

  function create() {
    const raw = query.trim().replace(/^(dr\.?|docteur|pr\.?|professeur)\s+/i, "");
    if (!raw) return;
    const parts = raw.split(/\s+/);
    const supervisor: CarnetSupervisor = {
      id: newId(),
      last_name: parts.length > 1 ? parts.slice(1).join(" ") : parts[0],
      first_name: parts.length > 1 ? parts[0] : "",
      role: defaultRole,
      usual_hospital: hospital ?? "",
      archived: false,
      created_at: new Date().toISOString(),
    };
    commit([putRow("supervisors", supervisor)]);
    onChange(supervisor.id);
    setQuery("");
    setOpen(false);
  }

  if (selected && !open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-primary bg-primary-tint px-3 text-sm font-medium text-primary-strong">
          {supervisorName(selected)}
          <button type="button" onClick={() => onChange(null)} aria-label="Retirer" className="rounded-full p-0.5 hover:bg-primary/10">
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
        <button type="button" onClick={() => setOpen(true)} className="min-h-11 px-2 text-sm text-foreground-muted underline-offset-4 hover:underline">
          Changer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {quickPicks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {quickPicks.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                onChange(s.id);
                setOpen(false);
                setQuery("");
              }}
              className={cn(
                "min-h-11 rounded-[var(--radius-md)] border px-3 text-sm font-medium",
                s.id === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface hover:bg-surface-muted"
              )}
            >
              {supervisorName(s)}
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className="h-11"
        />
        {open && (matches.length > 0 || query.trim()) && (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-[var(--radius-md)] border border-border bg-surface shadow-lg">
            {matches.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onChange(s.id);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-muted"
              >
                <span className="font-medium text-foreground">{supervisorName(s)}</span>
                <span className="truncate text-xs text-foreground-subtle">{[s.role, s.usual_hospital].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
            {query.trim() && !matches.some((s) => normalize(supervisorName(s)) === q) && (
              <button type="button" onClick={create} className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm text-primary-strong hover:bg-primary-tint">
                <Plus className="h-4 w-4" /> Ajouter « {query.trim()} »
              </button>
            )}
            {selected && (
              <button type="button" onClick={() => setOpen(false)} className="w-full border-t border-border px-3 py-2 text-left text-xs text-foreground-subtle hover:bg-surface-muted">
                Garder {supervisorName(selected)}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
