"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Pill, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChipGroup, MultiChipGroup } from "@/components/carnet/ui";
import { Panel } from "@/components/preop/ui";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { parseQuickEntry } from "@/lib/preop/quick-entry";
import { cbipSearchUrl } from "@/lib/preop/medications";
import { sourceLevelShort } from "@/lib/preop/rules/engine";
import { treatmentGuide, type GuideContext, type GuideRule, type TreatmentGuideEntry } from "@/lib/preop/treatment-guide";
import type { Rule, Technique } from "@/lib/preop/rules/types";
import { cn } from "@/lib/utils";

// « Traitements » tab: paste the patient's treatment list, read for each one
// what to do around the operation and why. Nothing is kept: the list stays
// on this screen only (patient data).

const TECHNIQUE_OPTIONS: { code: Technique; label: string; title: string }[] = [
  { code: "general", label: "AG", title: "Anesthésie générale" },
  { code: "sedation", label: "Sédation", title: "Sédation" },
  { code: "neuraxial", label: "Rachi / péridurale", title: "Ponction neuraxiale (rachianesthésie, péridurale, cathéter)" },
  { code: "deep_block", label: "Bloc profond", title: "ALR périphérique profonde, non compressible (plexus lombaire, paravertébral, infraclaviculaire…)" },
  { code: "superficial_block", label: "Bloc superficiel", title: "ALR périphérique superficielle, compressible (fémoral, axillaire, poplité, TAP…)" },
];
const BLEEDING_OPTIONS = [
  { code: "minimal" as const, label: "Minime", title: "Cataracte, extraction dentaire simple, endoscopie sans biopsie…" },
  { code: "low" as const, label: "Faible", title: "Arthroscopie, main, hernie inguinale, sein…" },
  { code: "high" as const, label: "Élevé", title: "Chirurgie majeure abdominale, thoracique, orthopédique, vasculaire, urologique ; neurochirurgie, rachis" },
];

const EXAMPLE = "Eliquis 5 mg 2x/j\nAsaflow 80 mg\nmetformine 850 mg 3x/j\nbisoprolol 5 mg\nramipril 10 mg\nJardiance 10 mg";

export function TreatmentsGuideView({ rules }: { rules: Rule[] }) {
  const { catalogs } = useCatalogs();
  const [text, setText] = useState("");
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [bleeding, setBleeding] = useState<"minimal" | "low" | "high" | null>(null);
  const [crcl, setCrcl] = useState("");

  const parsed = useMemo(() => (text.trim() ? parseQuickEntry(`Traitements :\n${text}`, catalogs) : null), [text, catalogs]);
  const clearance = crcl.trim() ? Number(crcl.replace(",", ".")) : undefined;
  const entries = useMemo(() => {
    const ctx: GuideContext = { techniques: techniques.length ? techniques : undefined, bleedingRisk: bleeding ?? undefined, crcl: Number.isFinite(clearance) ? clearance : undefined };
    return (parsed?.treatments ?? []).map((t) => treatmentGuide(t, rules, catalogs, ctx));
  }, [parsed, rules, catalogs, techniques, bleeding, clearance]);
  const unknown = parsed?.freeTreatments ?? [];

  return (
    <div className="space-y-4">
      <Panel title="Traitements du patient">
        <p className="text-sm text-foreground-muted">
          Collez la liste telle quelle (courrier, prescription, résumé du médecin traitant) : pour chaque traitement, ce qu&apos;il faut faire autour de
          l&apos;intervention, combien de temps, chez qui, pourquoi et selon quelle source. Rien n&apos;est enregistré.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={EXAMPLE}
          className="w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="Liste des traitements"
        />
        <div className="flex flex-wrap gap-2">
          {!text && (
            <Button size="sm" variant="ghost" onClick={() => setText(EXAMPLE)}>
              Essayer avec un exemple
            </Button>
          )}
          {text && (
            <Button size="sm" variant="ghost" onClick={() => setText("")}>
              <X className="h-3.5 w-3.5" /> Effacer
            </Button>
          )}
        </div>
        <details className="rounded-[var(--radius-md)] bg-surface-muted/60 px-3 py-2" open={techniques.length > 0 || !!bleeding || !!crcl}>
          <summary className="cursor-pointer text-sm font-medium text-foreground">Préciser le contexte (facultatif)</summary>
          <p className="mt-1 text-xs text-foreground-subtle">Toutes les règles restent affichées ; le contexte indique seulement lesquelles s&apos;appliquent à ce patient.</p>
          <div className="mt-2 space-y-2">
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">Geste prévu</p>
              <MultiChipGroup options={TECHNIQUE_OPTIONS} value={techniques} onChange={(v) => setTechniques(v as Technique[])} />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">Risque hémorragique de la chirurgie</p>
              <ChipGroup size="sm" allowClear options={BLEEDING_OPTIONS} value={bleeding} onChange={setBleeding} />
            </div>
            <label className="block max-w-48 space-y-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">Clairance de la créatinine (mL/min)</span>
              <Input inputMode="decimal" value={crcl} onChange={(e) => setCrcl(e.target.value)} className="h-9" placeholder="ex. 45" />
            </label>
          </div>
        </details>
      </Panel>

      {entries.length > 0 && <Summary entries={entries} />}
      {entries.map((e) => (
        <TreatmentCard key={`${e.treatment.id}-${e.treatment.from ?? ""}`} entry={e} />
      ))}
      {unknown.length > 0 && (
        <Panel title="Non reconnus">
          <p className="text-xs text-foreground-subtle">Vérifiez l&apos;orthographe, ou cherchez le produit sur le CBIP.</p>
          <ul className="space-y-1">
            {unknown.map((u) => (
              <li key={u} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-foreground">{u}</span>
                <a href={cbipSearchUrl(u)} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
                  CBIP <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

const VERDICT_STYLE: Record<TreatmentGuideEntry["verdict"]["kind"], string> = {
  stop: "bg-danger-tint text-danger",
  depends: "bg-accent-tint text-accent",
  continue: "bg-success-tint text-success",
  none: "bg-surface-muted text-foreground-muted",
};

function Summary({ entries }: { entries: TreatmentGuideEntry[] }) {
  return (
    <Panel title="En résumé">
      <ul className="divide-y divide-border">
        {entries.map((e) => (
          <li key={`${e.treatment.id}-${e.treatment.from ?? ""}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
            <span className="min-w-0 font-medium text-foreground">{e.treatment.name}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", VERDICT_STYLE[e.verdict.kind])}>{e.verdict.text}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function TreatmentCard({ entry: e }: { entry: TreatmentGuideEntry }) {
  const notes = [e.medication?.attention, ...e.classes.map((k) => k.attention)].filter((a): a is NonNullable<typeof a> => !!a);
  const seen = new Set<string>();
  const uniqueNotes = notes.filter((n) => (seen.has(n.text) ? false : (seen.add(n.text), true)));
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Pill className="h-4 w-4 text-foreground-subtle" /> {e.treatment.name}
        </span>
      }
      actions={<span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", VERDICT_STYLE[e.verdict.kind])}>{e.verdict.text}</span>}
    >
      <p className="text-xs text-foreground-subtle">
        {e.classes.length ? e.classes.map((k) => k.label).join(" · ") : "Classe non reconnue"}
        {e.treatment.from && e.treatment.from.trim().toLowerCase() !== e.treatment.name.toLowerCase() ? ` — lu dans « ${e.treatment.from.trim()} »` : ""}
      </p>

      {uniqueNotes.length > 0 && (
        <div className="space-y-1 rounded-[var(--radius-md)] bg-surface-muted/60 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">À savoir</p>
          {uniqueNotes.map((n) => (
            <p key={n.text} className="text-sm text-foreground">
              {n.text}
            </p>
          ))}
        </div>
      )}

      <RuleSection title="Arrêt avant le geste" rules={e.stop} empty={e.verdict.kind === "continue" ? "Pas d'arrêt prévu." : undefined} />
      <RuleSection title="Reprise après" rules={e.resume} />
      <RuleSection title="À vérifier" rules={e.other} />

      {e.interactions.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">Interactions avec l&apos;anesthésie</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground-muted">
            {e.interactions.map((i) => (
              <li key={`${i.with}-${i.effect}`}>
                <span className="font-medium text-foreground">{i.with}</span> : {i.effect}
              </li>
            ))}
          </ul>
        </div>
      )}

      <a href={cbipSearchUrl(e.treatment.name)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        Notice et RCP sur le CBIP <ExternalLink className="h-3 w-3" />
      </a>
    </Panel>
  );
}

const APPLIES_LABEL = { yes: "S'applique ici", no: "Pas dans ce contexte", unknown: "Selon le patient" } as const;
const APPLIES_STYLE = { yes: "bg-primary-tint text-primary-strong", no: "bg-surface-muted text-foreground-subtle", unknown: "bg-surface-muted text-foreground-muted" } as const;

function RuleSection({ title, rules, empty }: { title: string; rules: GuideRule[]; empty?: string }) {
  if (!rules.length && !empty) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">{title}</p>
      {!rules.length && <p className="text-sm text-foreground-muted">{empty}</p>}
      <ul className="space-y-1.5">
        {rules.map((g) => (
          <RuleRow key={g.rule.id} g={g} />
        ))}
      </ul>
    </div>
  );
}

function RuleRow({ g }: { g: GuideRule }) {
  const s = g.rule.source;
  const sentence = g.action.charAt(0).toUpperCase() + g.action.slice(1);
  return (
    <li className={cn("rounded-[var(--radius-md)] border border-border px-3 py-2", g.applies === "no" && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium text-foreground">{sentence}</p>
        <span className="flex shrink-0 gap-1">
          {g.draft && <span className="rounded-full bg-accent-tint px-1.5 py-px text-[10px] font-semibold text-accent">Brouillon à vérifier</span>}
          <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", APPLIES_STYLE[g.applies])}>{APPLIES_LABEL[g.applies]}</span>
        </span>
      </div>
      <p className="mt-0.5 text-xs text-foreground-muted">
        <span className="font-medium">Chez qui :</span> {g.when.length ? g.when.join(" ; ") : "tous les patients sous ce traitement"}
      </p>
      <details className="mt-1">
        <summary className="cursor-pointer text-xs font-medium text-primary">Pourquoi ? Source</summary>
        <div className="mt-1 space-y-1.5 text-xs text-foreground-muted">
          {g.rule.explanations.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4">
              {g.rule.explanations.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
          {s.quote && <p className="italic">« {s.quote} »</p>}
          <p>
            <span className="font-medium text-foreground">{s.organisation}</span>
            {s.year ? ` ${s.year}` : ""} — {s.title}
            {s.grade ? ` (${s.grade})` : ""} · {sourceLevelShort(s.level)}
          </p>
          <p className="flex flex-wrap gap-3">
            {s.pmid && (
              <a href={`https://pubmed.ncbi.nlm.nih.gov/${s.pmid}/`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                PubMed {s.pmid} <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {s.doi && (
              <a href={`https://doi.org/${s.doi}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                DOI <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </p>
          {g.rule.divergences.length > 0 && (
            <div>
              <p className="font-medium text-foreground">Autres sources, avis différents :</p>
              <ul className="list-disc space-y-0.5 pl-4">
                {g.rule.divergences.map((d) => (
                  <li key={d.summary}>
                    {d.summary} — {d.source}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}
