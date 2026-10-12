"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, ExternalLink, ShieldAlert, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/preop/ui";
import { anaesthesiaSheet, defaultSheetMode, PATIENT_PROFILES, SHEET_MODES, sheetModes, type SheetMode, sheetProfiles, sheetRefs, type PhaseCode, type ProfileCode, type ProfileNote, type SheetLine, type SheetPhase } from "@/lib/preop/anaesthesia-sheet";
import type { CiCard } from "@/lib/preop/contraindications";
import { GUIDELINES, doiUrl, pubmedUrl, type GuidelineId } from "@/lib/preop/guideline-refs";
import type { SurgeryItem } from "@/lib/preop/catalog";
import type { Protocol } from "@/lib/preop/protocols";
import { cn } from "@/lib/utils";

// « Protocole anesthésique » of a procedure sheet: one block per phase,
// closed by default (its summary stays visible), with what the procedure
// and its protocol plan, the recent guidelines, what changes with the
// patient (filterable by profile) and the contraindications of what is used.

const profileLabel = (p: ProfileCode) => PATIENT_PROFILES.find((x) => x.code === p)!;

function Refs({ refs, chapter }: { refs?: GuidelineId[]; chapter?: string }) {
  if (!refs?.length) return null;
  return (
    <span className="text-[11px] text-foreground-subtle">
      {" · "}
      {refs.map((id, i) => {
        const g = GUIDELINES[id];
        const label = id === "manual" && chapter ? `${g.short}, ${chapter}` : g.short;
        const href = "doi" in g && g.doi ? doiUrl(g.doi) : "pmid" in g && g.pmid ? pubmedUrl(g.pmid) : undefined;
        return (
          <span key={id}>
            {i > 0 && " ; "}
            {href ? (
              <a href={href} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-primary" title={g.label}>
                {label}
              </a>
            ) : (
              <span title={g.label}>{label}</span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function Line({ line }: { line: SheetLine }) {
  return (
    <li className="text-sm text-foreground">
      {line.text}
      <Refs refs={line.refs} chapter={line.chapter} />
    </li>
  );
}

function CiCardView({ card }: { card: CiCard & { adapt?: string[] } }) {
  return (
    <details className="group rounded-[var(--radius-md)] border border-border bg-surface">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm">
        <ShieldAlert className={cn("h-4 w-4 shrink-0", card.absolute.length ? "text-danger" : "text-accent")} aria-hidden />
        <span className="min-w-0 flex-1 font-medium text-foreground">{card.title}</span>
        <span className="shrink-0 text-xs text-foreground-subtle">
          {card.absolute.length ? `${card.absolute.length} CI` : card.relative.length ? "prudence" : "à savoir"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-foreground-subtle transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-2 border-t border-border px-3 py-2">
        {card.absolute.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-danger">Contre-indications</p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground">
              {card.absolute.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        {card.relative.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">{card.relativeLabel ?? "Contre-indications relatives"}</p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground">
              {card.relative.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        {card.notes.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground-muted">
            {card.notes.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-foreground-subtle">
          Source{card.refs.length > 1 ? "s" : ""} :
          {card.refs.length ? <Refs refs={card.refs} chapter={card.chapter} /> : " usage courant, pas de recommandation formelle citée"}
        </p>
      </div>
    </details>
  );
}

function PatientNotes({ notes }: { notes: ProfileNote[] }) {
  const groups = new Map<ProfileCode, ProfileNote[]>();
  for (const n of notes) groups.set(n.profile, [...(groups.get(n.profile) ?? []), n]);
  return (
    <div className="space-y-2">
      {[...groups.entries()].map(([profile, list]) => (
        <div key={profile}>
          <p className="text-xs font-semibold text-foreground">{profileLabel(profile).label}</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {list.map((n, i) => (
              <li key={i} className="text-sm text-foreground-muted">
                {n.text}
                <Refs refs={n.refs} chapter={n.chapter} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">{title}</p>
      {children}
    </div>
  );
}

function PhaseView({ phase, open, onToggle, filter }: { phase: SheetPhase; open: boolean; onToggle: (open: boolean) => void; filter: Set<ProfileCode> }) {
  const notes = filter.size ? phase.patients.filter((n) => filter.has(n.profile)) : phase.patients;
  return (
    <details open={open} onToggle={(e) => onToggle(e.currentTarget.open)} className="group rounded-[var(--radius-md)] border border-border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{phase.title}</span>
          {phase.summary && <span className="block truncate text-xs text-foreground-muted">{phase.summary}</span>}
        </span>
        {phase.cards.length > 0 && (
          <span className="shrink-0 rounded-full bg-danger-tint px-1.5 py-px text-[10px] font-semibold text-danger" title="Contre-indications à connaître">
            CI {phase.cards.length}
          </span>
        )}
        {notes.length > 0 && (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary-tint px-1.5 py-px text-[10px] font-semibold text-primary-strong" title={`${notes.length} différence${notes.length > 1 ? "s" : ""} selon le patient`}>
            <UserRound className="h-3 w-3" aria-hidden /> {notes.length}
          </span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-foreground-subtle transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3 border-t border-border px-3 py-3">
        {(phase.lines.length > 0 || phase.drugs.length > 0) && (
          <Section title="Pour cette intervention">
            {phase.lines.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5">
                {phase.lines.map((l, i) => (
                  <Line key={i} line={l} />
                ))}
              </ul>
            )}
            {phase.drugs.length > 0 && (
              <ul className="space-y-1.5">
                {phase.drugs.map((d, i) => (
                  <li key={i} className="rounded-[var(--radius-md)] bg-surface-muted/60 px-2.5 py-1.5">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{d.name}</span>
                      {d.dose && <span className="text-foreground-muted"> — {d.dose}</span>}
                      {d.choice && <span className="ml-1 text-[11px] text-foreground-subtle">(au choix)</span>}
                    </p>
                    {d.note && <p className="text-xs text-foreground-muted">{d.note}</p>}
                    {d.reference.length > 0 && <p className="text-[11px] text-foreground-subtle">Manuel 2020 : {d.reference.join(" ; ")}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
        {phase.blocks.map((b) => (
          <Section key={b.title} title={b.title}>
            {b.items.map((it) => (
              <div key={it.label}>
                <p className="text-xs font-medium text-foreground">{it.label}</p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground-muted">
                  {it.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="text-[11px] text-foreground-subtle">
              {b.source}
              {b.pmid && (
                <>
                  {" · "}
                  <a href={pubmedUrl(b.pmid)} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-primary">
                    PMID {b.pmid}
                  </a>
                </>
              )}
            </p>
          </Section>
        ))}
        {phase.recommendations.length > 0 && (
          <Section title="Recommandations récentes">
            <ul className="list-disc space-y-0.5 pl-5">
              {phase.recommendations.map((l, i) => (
                <Line key={i} line={l} />
              ))}
            </ul>
          </Section>
        )}
        {notes.length > 0 && (
          <Section title="Selon le patient">
            <PatientNotes notes={notes} />
          </Section>
        )}
        {phase.cards.length > 0 && (
          <Section title="Contre-indications à connaître">
            <div className="space-y-1.5">
              {phase.cards.map((c) => (
                <CiCardView key={c.id} card={c} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </details>
  );
}

export function AnaesthesiaProtocol({ surgery, protocol, onEdit, commonNote }: { surgery: SurgeryItem; protocol: Protocol | null; onEdit: () => void; commonNote?: React.ReactNode }) {
  const modes = useMemo(() => sheetModes(surgery, protocol), [surgery, protocol]);
  // The technique picked for this procedure (back to its usual one on another procedure).
  const [picked, setPicked] = useState<{ id: string; mode: SheetMode } | null>(null);
  const mode = picked && picked.id === surgery.id && modes.includes(picked.mode) ? picked.mode : defaultSheetMode(surgery, protocol);
  const phases = useMemo(() => anaesthesiaSheet(surgery, protocol, mode), [surgery, protocol, mode]);
  const profiles = useMemo(() => sheetProfiles(phases), [phases]);
  const refs = useMemo(() => sheetRefs(phases).filter((id) => id !== "manual" && id !== "rcp"), [phases]);
  const [open, setOpen] = useState<Partial<Record<PhaseCode, boolean>>>({});
  const [filter, setFilter] = useState<Set<ProfileCode>>(new Set());
  const allOpen = phases.every((p) => open[p.code]);

  const toggleProfile = (p: ProfileCode) => {
    const next = new Set(filter);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setFilter(next);
    // Open the phases that speak of the chosen profiles.
    if (next.size) setOpen(Object.fromEntries(phases.map((ph) => [ph.code, ph.patients.some((n) => next.has(n.profile)) || !!open[ph.code]])));
  };

  return (
    <Panel
      title="Protocole anesthésique"
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => setOpen(Object.fromEntries(phases.map((p) => [p.code, !allOpen])))} className="print:hidden">
            {allOpen ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />} {allOpen ? "Tout replier" : "Tout déplier"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit} className="print:hidden">
            {protocol ? "Changer" : "Lier un protocole"}
          </Button>
        </>
      }
    >
      <div className="space-y-1">
        <p className="text-sm text-foreground">
          {protocol ? (
            <>
              Protocole : <span className="font-medium">{protocol.name}</span>
            </>
          ) : (
            "Aucun protocole lié : technique, recommandations et contre-indications tirées de l'intervention."
          )}
        </p>
        {commonNote}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-foreground-subtle">Technique — la fiche entière s&apos;adapte à celle choisie :</p>
        <div role="radiogroup" aria-label="Technique anesthésique" className="flex flex-wrap gap-1.5">
          {SHEET_MODES.filter((m) => modes.includes(m.code)).map((m) => (
            <button
              key={m.code}
              type="button"
              role="radio"
              aria-checked={mode === m.code}
              onClick={() => setPicked({ id: surgery.id, mode: m.code })}
              className={cn(
                "min-h-9 rounded-lg border px-3 text-sm font-medium transition-colors",
                mode === m.code ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-surface-muted"
              )}
            >
              {m.label}
              {m.code === defaultSheetMode(surgery, protocol) && modes.length > 1 ? <span className="ml-1 text-[11px] font-normal opacity-75">(habituelle)</span> : null}
            </button>
          ))}
        </div>
      </div>

      {profiles.length > 0 && (
        <div className="space-y-1.5 print:hidden">
          <p className="text-xs text-foreground-subtle">Selon le patient — touchez un profil pour ne garder que ce qui change pour lui :</p>
          <div className="flex flex-wrap gap-1.5">
            {profiles.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => toggleProfile(p)}
                aria-pressed={filter.has(p)}
                className={cn(
                  "min-h-8 rounded-full border px-2.5 text-xs transition-colors",
                  filter.has(p) ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-surface-muted"
                )}
              >
                {profileLabel(p).short}
              </button>
            ))}
            {filter.size > 0 && (
              <button type="button" onClick={() => setFilter(new Set())} className="min-h-8 px-2 text-xs text-foreground-subtle underline">
                Tous
              </button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {phases.map((p) => (
          <PhaseView key={p.code} phase={p} open={!!open[p.code]} onToggle={(o) => setOpen((prev) => (prev[p.code] === o ? prev : { ...prev, [p.code]: o }))} filter={filter} />
        ))}
      </div>

      <details className="text-xs text-foreground-muted">
        <summary className="cursor-pointer text-foreground-subtle">Sources ({refs.length + 1})</summary>
        <ul className="mt-1.5 space-y-1 pl-1">
          {refs.map((id) => {
            const g = GUIDELINES[id];
            return (
              <li key={id}>
                {g.label}
                {"doi" in g && g.doi && (
                  <>
                    {" "}
                    <a href={doiUrl(g.doi)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                      DOI <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  </>
                )}
              </li>
            );
          })}
          <li>{GUIDELINES.manual.label} — chapitres cités ; RCP (CBIP) pour les adaptations au rein et au foie.</li>
        </ul>
        <p className="mt-1.5 text-[11px] text-foreground-subtle">Résumé des recommandations : le texte intégral et le protocole du service font foi.</p>
      </details>
    </Panel>
  );
}
