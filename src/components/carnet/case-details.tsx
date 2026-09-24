"use client";

import { useRef, useState } from "react";
import { ChevronDown, Copy, FlaskConical, Plus, X } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { MultiChipGroup } from "@/components/carnet/ui";
import { DRUG_CLASSES, DRUG_ROUTES, PROCEDURE_GROUPS, drugSuggestions, defaultRoute, routeShort } from "@/lib/carnet/pharmaco";
import { cn } from "@/lib/utils";
import type { CaseDetails, CaseDrug } from "@/lib/carnet/types";

/** "Propofol IVD · Rocuronium · 3 procédures" — the collapsed summary. */
export function detailsSummary(details: CaseDetails): string {
  const drugs = details.drugs ?? [];
  const procedures = details.procedures ?? [];
  const parts: string[] = [];
  if (drugs.length > 0) parts.push(drugs.length <= 3 ? drugs.map((d) => `${d.name} ${routeShort(d.route)}`).join(" · ") : `${drugs.length} produits`);
  if (procedures.length > 0) parts.push(`${procedures.length} procédure${procedures.length > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

export function isEmptyDetails(details: CaseDetails): boolean {
  return !details.drugs?.length && !details.procedures?.length;
}

/**
 * Optional record of what was given and done — for the candidate only,
 * never exported to the official carnet. Built for speed: the drugs used
 * most often come first, typing searches names and Belgian brands, and each
 * drug arrives with its usual route (bolus, PSE, AIVOC, périnerveux…) —
 * one tap to change it, dose optional. Procedure chips are grouped by the
 * moment of the anaesthetic and follow the chosen techniques.
 */
export function CaseDetailsEditor({
  value,
  onChange,
  history,
  general,
  regional,
  previous,
}: {
  value: CaseDetails;
  onChange: (value: CaseDetails) => void;
  /** Drugs of past cases (drugHistory) — most used first in suggestions. */
  history: { name: string; route: string }[];
  general: boolean;
  regional: boolean;
  /** Protocol of the previous comparable case, offered as a one-tap copy. */
  previous?: { label: string; details: CaseDetails } | null;
}) {
  const [open, setOpen] = useState(!isEmptyDetails(value));
  const [query, setQuery] = useState("");
  const [klass, setKlass] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const drugs = value.drugs ?? [];
  const procedures = value.procedures ?? [];

  const suggestions = drugSuggestions(query, history, { klass, exclude: drugs.map((d) => d.name), limit: klass ? 40 : 8 });

  const setDrugs = (next: CaseDrug[]) => onChange({ ...value, drugs: next });
  /**
   * `fromTyping`: added from the search field — focus stays there for the next one. A tap on a chip
   * (frequent drugs, class list) never moves focus: that would pop the keyboard up and scroll the form.
   */
  function addDrug(name: string, route?: string, fromTyping = false) {
    const clean = name.trim();
    if (!clean || drugs.some((d) => d.name.toLowerCase() === clean.toLowerCase())) return;
    setDrugs([...drugs, { name: clean, route: route ?? defaultRoute(clean), dose: "" }]);
    setQuery("");
    if (fromTyping) searchRef.current?.focus();
  }
  const updateDrug = (index: number, patch: Partial<CaseDrug>) => setDrugs(drugs.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  const groups = PROCEDURE_GROUPS.filter((g) => (g.code === "alr" ? regional : g.code === "induction" || g.code === "airway" || g.code === "entretien" ? general : true));
  const summary = detailsSummary(value);
  // The dropdown only follows typing; the most used drugs are plain chips below (a dropdown left open over them would catch the tap).
  const showSuggestions = focused && query.trim() !== "" && suggestions.length > 0;
  const frequent = !klass && !query.trim() ? drugSuggestions("", history, { exclude: drugs.map((d) => d.name), limit: 10 }) : [];

  return (
    <div className="rounded-[var(--radius-md)] border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm"
      >
        <FlaskConical className="h-4 w-4 shrink-0 text-foreground-subtle" />
        <span className="font-medium text-foreground">Produits & procédures</span>
        <span className="min-w-0 flex-1 truncate text-xs text-foreground-subtle">{summary || "facultatif — pour vous, jamais exporté"}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-foreground-subtle transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border p-3">
          {previous && isEmptyDetails(value) && !isEmptyDetails(previous.details) && (
            <button
              type="button"
              onClick={() => onChange(structuredClone(previous.details))}
              className="flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-border-strong px-3 py-2 text-left text-xs text-foreground-muted hover:bg-surface-muted"
            >
              <Copy className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Reprendre le protocole de {previous.label} : {detailsSummary(previous.details)}
              </span>
            </button>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Produits</p>
            {drugs.length > 0 && (
              <ul className="space-y-1.5">
                {drugs.map((drug, i) => (
                  <li key={drug.name} className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-md)] bg-surface-muted/60 px-2 py-1.5">
                    <span className="min-w-0 basis-full truncate text-sm font-medium text-foreground sm:flex-1 sm:basis-auto">{drug.name}</span>
                    <Select value={drug.route} onChange={(e) => updateDrug(i, { route: e.target.value })} className="h-8 w-auto min-w-0 flex-1 px-2 text-xs sm:flex-none" aria-label={`Mode d'administration de ${drug.name}`}>
                      {DRUG_ROUTES.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.label}
                        </option>
                      ))}
                    </Select>
                    <Input
                      value={drug.dose}
                      onChange={(e) => updateDrug(i, { dose: e.target.value.slice(0, 120) })}
                      placeholder="dose"
                      className="h-8 w-24 px-2 text-xs"
                      aria-label={`Dose de ${drug.name}`}
                    />
                    <button type="button" onClick={() => setDrugs(drugs.filter((_, j) => j !== i))} className="rounded p-1 text-foreground-subtle hover:text-danger" aria-label={`Retirer ${drug.name}`}>
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="relative">
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (suggestions[0] && query.trim()) addDrug(suggestions[0].name, suggestions[0].route, true);
                    else addDrug(query, undefined, true);
                  }
                }}
                placeholder="Ajouter un produit (ex. propofol, Dipidolor, céfazoline…)"
                autoComplete="off"
                className="h-10"
              />
              {showSuggestions && (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface shadow-lg">
                  {suggestions.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addDrug(s.name, s.route, true)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted"
                    >
                      <span className="truncate text-foreground">{s.name}</span>
                      <span className="shrink-0 text-xs text-foreground-subtle">
                        {routeShort(s.route)}
                        {s.uses > 0 ? ` · ${s.uses}×` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {query.trim() && !suggestions.some((s) => s.name.toLowerCase() === query.trim().toLowerCase()) && (
                <button type="button" onClick={() => addDrug(query, undefined, true)} className="mt-1 flex items-center gap-1 text-xs font-medium text-primary">
                  <Plus className="h-3.5 w-3.5" /> Ajouter « {query.trim()} »
                </button>
              )}
            </div>

            {frequent.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-foreground-subtle">Fréquents :</span>
                {frequent.map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    onClick={() => addDrug(f.name, f.route)}
                    className="min-h-8 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-xs font-medium text-foreground hover:bg-surface-muted"
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            )}

            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
              {DRUG_CLASSES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  aria-pressed={klass === c.code}
                  onClick={() => setKlass((k) => (k === c.code ? null : c.code))}
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors",
                    klass === c.code ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground-muted hover:bg-surface-muted"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {klass && (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => addDrug(s.name, s.route)}
                    className="min-h-9 rounded-[var(--radius-md)] border border-border bg-surface px-2.5 text-xs font-medium text-foreground hover:bg-surface-muted"
                  >
                    {s.name}
                  </button>
                ))}
                {suggestions.length === 0 && <p className="text-xs text-foreground-subtle">Tous les produits de cette classe sont déjà ajoutés.</p>}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Procédures</p>
            {groups.map((group) => (
              <div key={group.code} className="space-y-1.5">
                <p className="text-xs text-foreground-muted">{group.label}</p>
                <MultiChipGroup
                  options={group.items}
                  value={procedures.filter((p) => group.items.some((i) => i.code === p))}
                  onChange={(selected) =>
                    onChange({ ...value, procedures: [...procedures.filter((p) => !group.items.some((i) => i.code === p)), ...selected] })
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
