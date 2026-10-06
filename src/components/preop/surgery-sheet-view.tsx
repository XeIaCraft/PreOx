"use client";

import { useMemo, useState } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox, Panel } from "@/components/preop/ui";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { fold, type SurgeryItem } from "@/lib/preop/catalog";
import { RISK_GRADES } from "@/lib/preop/dossier";
import { matchProtocol, type Protocol } from "@/lib/preop/protocols";
import { POSTOP_ANALGESIA, POSTOP_DESTINATIONS, POSTOP_THROMBO } from "@/lib/preop/postop";
import { TECHNIQUES } from "@/lib/preop/rules/types";
import { searchSurgeries, surgeryVariants } from "@/lib/preop/surgery-search";
import { APPROACH_SPECIFICS } from "@/lib/preop/surgeries-variants";
import { APPROACHES, BLEEDING_RISKS, SURGERY_GRADES } from "@/lib/preop/surgeries";
import { surgerySheet, type SheetExam } from "@/lib/preop/surgery-sheet";
import { cn } from "@/lib/utils";

// « Fiches » tab: one procedure, without a patient — the exams to ask with
// the conditions that call for them, where the patient goes after, the
// bleeding risk and what it implies, and the protocol that applies.

const SETTING_LABEL = { ambulatory: "Ambulatoire", inpatient: "Hospitalisation", icu: "Soins intensifs" } as const;

function hint(x: SurgeryItem): string {
  const approach = x.approach ? APPROACHES.find((a) => a.code === x.approach)?.short : "";
  return [approach && !fold(x.name).includes(fold(approach)) ? approach : "", x.population === "child" ? "enfant" : x.population === "neonate" ? "nouveau-né" : "", x.category, SURGERY_GRADES.find((g) => g.code === x.grade)?.label.toLowerCase()]
    .filter(Boolean)
    .join(" · ");
}

export function SurgerySheetView({ protocols }: { protocols: Protocol[] }) {
  const { catalogs } = useCatalogs();
  const [id, setId] = useState<string | null>(null);
  const surgery = id ? catalogs.surgeries.find((x) => x.id === id) : undefined;

  return (
    <div className="space-y-4">
      <Panel title="Fiche par intervention">
        <p className="text-sm text-foreground-muted">
          Choisissez une intervention : examens à demander et leurs conditions, destination après l&apos;intervention, risque hémorragique et protocole, sans
          patient.
        </p>
        {surgery ? (
          <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-surface-muted/60 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{surgery.name}</p>
              <p className="text-xs text-foreground-subtle">{hint(surgery)}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => window.print()} className="print:hidden" title="Imprimer la fiche">
              <Printer className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setId(null)} className="print:hidden" aria-label="Changer d'intervention">
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Combobox
            autoFocus
            ariaLabel="Intervention"
            placeholder="Intervention (PTG, colectomie cœlio, néphrectomie partielle robot…)"
            search={(q) => searchSurgeries(catalogs.surgeries, q).map((x) => ({ key: x.id, label: x.name, hint: hint(x) }))}
            onPick={(o) => setId(o.key)}
          />
        )}
        {surgery && <Variants surgery={surgery} items={catalogs.surgeries} onPick={setId} />}
      </Panel>
      {surgery && <Sheet key={surgery.id} surgery={surgery} protocol={matchProtocol(protocols, { name: surgery.name, category: surgery.category, catalogId: surgery.id }, "", catalogs.surgeries)} />}
    </div>
  );
}

function Variants({ surgery, items, onPick }: { surgery: SurgeryItem; items: SurgeryItem[]; onPick: (id: string) => void }) {
  const variants = surgeryVariants(items, { catalogId: surgery.id });
  if (!variants.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 print:hidden">
      {variants.map((x) => (
        <button key={x.id} type="button" onClick={() => onPick(x.id)} className="min-h-8 rounded-full border border-border px-2.5 text-xs text-foreground hover:bg-surface-muted">
          {x.name}
        </button>
      ))}
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "danger" | "accent" }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-md)] border border-border px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">{label}</p>
      <p className={cn("text-sm font-medium", tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent" : "text-foreground")}>{value}</p>
    </div>
  );
}

function Sheet({ surgery: s, protocol }: { surgery: SurgeryItem; protocol: Protocol | null }) {
  const sheet = useMemo(() => surgerySheet(s), [s]);
  const bleeding = BLEEDING_RISKS.find((b) => b.code === s.bleedingRisk);
  const plan = protocol?.content;
  const destination = plan?.postopPlan?.destination ? POSTOP_DESTINATIONS.find((d) => d.code === plan.postopPlan!.destination)?.label : s.setting ? SETTING_LABEL[s.setting] : undefined;
  const techniques = (plan?.techniques.length ? plan.techniques : (s.techniques ?? [])).map((t) => TECHNIQUES.find((x) => x.code === t)?.label ?? t);
  const antibio = plan?.drugs.filter((d) => d.phase === "antibio") ?? [];
  const specifics = [...(s.specifics ?? []), ...(s.approach ? (APPROACH_SPECIFICS[s.approach] ?? []) : [])];
  const always = sheet.exams.filter((e) => e.always);
  const conditional = sheet.exams.filter((e) => !e.always);

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact label="Grade (KCE)" value={SURGERY_GRADES.find((g) => g.code === s.grade)?.label ?? "—"} />
        <Fact label="Risque cardiaque (ESC)" value={RISK_GRADES.find((r) => r.code === s.cardiacRisk)?.label ?? "—"} tone={s.cardiacRisk === "high" ? "danger" : undefined} />
        <Fact label="Risque hémorragique" value={bleeding?.label ?? "—"} tone={s.bleedingRisk === "high" ? "danger" : undefined} />
        <Fact label="Destination" value={destination ?? "Selon le patient"} tone={destination === "Soins intensifs" || destination === "Soins intermédiaires" ? "accent" : undefined} />
        {s.durationHours !== undefined && <Fact label="Durée indicative" value={`${String(s.durationHours).replace(".", ",")} h`} />}
        {s.position && <Fact label="Position" value={s.position} />}
        {techniques.length > 0 && <Fact label="Technique" value={techniques.join(", ")} />}
        {(s.tourniquet || s.closedSpace) && <Fact label="À noter" value={[s.tourniquet && "Garrot", s.closedSpace && "Espace clos"].filter(Boolean).join(", ")} tone="accent" />}
      </div>

      <Panel title="Examens à demander">
        <p className="text-xs text-foreground-subtle">{sheet.scope}</p>
        {always.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Pour tous les patients</p>
            <ul className="space-y-1.5">
              {always.map((e) => (
                <ExamRow key={e.code} exam={e} />
              ))}
            </ul>
          </div>
        )}
        {conditional.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Selon le patient</p>
            <ul className="space-y-1.5">
              {conditional.map((e) => (
                <ExamRow key={e.code} exam={e} />
              ))}
            </ul>
          </div>
        )}
        <p className="text-[11px] text-foreground-subtle">
          Un examen n&apos;est utile que si son résultat peut changer la prise en charge ; un résultat récent (moins de 3 à 6 mois, état stable) reste
          valable. Les antécédents du patient (stimulateur, dénutrition, chimiothérapie…) en ajoutent : la consultation les calcule pour lui.
        </p>
      </Panel>

      <Panel title="Saignement">
        <p className="text-sm text-foreground">
          <span className={cn("font-medium", s.bleedingRisk === "high" && "text-danger")}>Risque {bleeding?.label.toLowerCase()}</span> — {bleeding?.definition}
        </p>
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground-muted">
          {s.bleedingRisk === "high" ? (
            <>
              <li>Groupe sanguin et RAI valides le jour de l&apos;intervention ; réserve de concentrés selon le protocole de l&apos;hôpital.</li>
              <li>Hémoglobine avant ; anémie ou carence martiale à corriger avant une chirurgie programmée (épargne sanguine).</li>
              <li>Accès veineux de bon calibre.</li>
            </>
          ) : (
            <li>Pas de groupe sanguin systématique pour cette intervention.</li>
          )}
          <li>Antithrombotiques : arrêt et relais selon ce niveau de risque hémorragique et le risque thrombotique du patient (consultation).</li>
          {s.closedSpace && <li>Espace clos : un hématome est grave quel que soit son volume — aucune activité antithrombotique résiduelle.</li>}
        </ul>
      </Panel>

      {plan && (
        <Panel title={`Protocole : ${protocol.name}`}>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {antibio.length > 0 && (
              <div>
                <dt className="text-xs font-medium text-foreground-subtle">Antibioprophylaxie</dt>
                <dd className="text-foreground">{antibio.map((d) => [d.name, d.amount !== null ? `${String(d.amount).replace(".", ",")} ${d.unit}${d.doseMode === "per_kg" ? "/kg" : ""}` : ""].filter(Boolean).join(" ")).join(" ; ")}</dd>
              </div>
            )}
            {plan.postopPlan?.analgesia.length ? (
              <div>
                <dt className="text-xs font-medium text-foreground-subtle">Analgésie postopératoire</dt>
                <dd className="text-foreground">{plan.postopPlan.analgesia.map((a) => POSTOP_ANALGESIA.find((x) => x.code === a)?.label ?? a).join(", ")}</dd>
              </div>
            ) : null}
            {plan.postopPlan?.thrombo && (
              <div>
                <dt className="text-xs font-medium text-foreground-subtle">Thromboprophylaxie</dt>
                <dd className="text-foreground">{POSTOP_THROMBO.find((x) => x.code === plan.postopPlan!.thrombo)?.label}</dd>
              </div>
            )}
            {plan.postop.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-foreground-subtle">Consignes postopératoires</dt>
                <dd className="text-foreground">{plan.postop.join(" ; ")}</dd>
              </div>
            )}
          </dl>
        </Panel>
      )}

      {specifics.length > 0 && (
        <Panel title="Ce que l'intervention change pour l'anesthésie">
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground-muted">
            {specifics.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

function ExamRow({ exam }: { exam: SheetExam }) {
  const conditions = exam.always ? exam.conditions.filter((c) => !c.when.startsWith("Tous les patients")) : exam.conditions;
  const main = exam.always ? exam.conditions.find((c) => c.when.startsWith("Tous les patients")) : undefined;
  return (
    <li className="rounded-[var(--radius-md)] border border-border px-3 py-2">
      <p className="text-sm font-medium text-foreground">
        {exam.label}
        {main && (
          <span className="ml-1.5 text-xs font-normal text-foreground-subtle" title={main.source.label}>
            {main.when.replace(/^Tous les patients\s*/, "").replace(/^\((.*)\)$/, "$1")} · {main.source.short}
          </span>
        )}
      </p>
      {conditions.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {conditions.map((c, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-foreground-muted">
              <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold", c.strength === "recommended" ? "bg-primary-tint text-primary-strong" : "bg-surface-muted text-foreground-muted")}>
                {c.strength === "recommended" ? "Recommandé" : "À envisager"}
              </span>
              <span>{exam.always ? `Aussi : ${c.when.charAt(0).toLowerCase()}${c.when.slice(1)}` : c.when}</span>
              <span className="text-foreground-subtle" title={c.source.label}>
                · {c.source.short}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
