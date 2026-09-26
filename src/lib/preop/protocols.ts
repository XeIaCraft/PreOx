// Anaesthesia protocols: reusable plans for an intervention (no patient
// data), stored on the server; copied into a patient dossier as its plan
// and adjusted there. Doses are written per kilo or fixed, with the weight
// they apply to — PreOx computes the dose for the patient and shows the
// basis next to it. Doses and targets come from the protocol's own sources
// (its "source" field): the user's, or those of the reference protocols
// (reference-protocols.ts), imported only on request.

import { protocolCovers } from "./protocol-coverage";
import { adjustedBodyWeight, idealBodyWeight, leanBodyWeight, type Sex } from "./scores";
import type { Technique } from "./rules/types";
import type { PostopPlan } from "./postop";

export type WeightBasis = "total" | "ideal" | "lean" | "adjusted";
export type DoseUnit = "mg" | "µg" | "g" | "mL" | "UI";
export type DrugPhase = "premed" | "induction" | "maintenance" | "alr" | "antibio" | "analgesia" | "ponv" | "haemodynamic" | "postop" | "other";

export const WEIGHT_BASES: { code: WeightBasis; label: string; short: string }[] = [
  { code: "total", label: "Poids réel", short: "réel" },
  { code: "ideal", label: "Poids idéal", short: "idéal" },
  { code: "lean", label: "Poids maigre", short: "maigre" },
  { code: "adjusted", label: "Poids ajusté", short: "ajusté" },
];

export const DRUG_PHASES: { code: DrugPhase; label: string }[] = [
  { code: "premed", label: "Prémédication" },
  { code: "induction", label: "Induction" },
  { code: "maintenance", label: "Entretien" },
  { code: "alr", label: "ALR" },
  { code: "antibio", label: "Antibioprophylaxie" },
  { code: "analgesia", label: "Analgésie" },
  { code: "ponv", label: "Prévention des NVPO" },
  { code: "haemodynamic", label: "Hémodynamique" },
  { code: "postop", label: "Post-opératoire" },
  { code: "other", label: "Autre" },
];

export interface ProtocolDrug {
  id: string;
  name: string;
  /** Code of DRUG_ROUTES (pharmaco.ts): bolus_iv, pse, aivoc, perinerveux… */
  route: string;
  phase: DrugPhase;
  doseMode: "fixed" | "per_kg";
  amount: number | null;
  unit: DoseUnit;
  weightBasis: WeightBasis;
  /** Upper limit of the computed dose, same unit. */
  maxAmount: number | null;
  /** Re-dosing interval (antibiotic, relaxant…) — drives a timer in theatre. */
  redoseEveryMin: number | null;
  note: string;
}

export interface ProtocolRisk {
  title: string;
  conduct: string;
  /** Why it happens (mechanism, who is at risk). */
  why?: string;
  /** How to prevent it. */
  prevention?: string;
  source?: string;
  /** Crisis procedure of the theatre screen (crises.ts). */
  crisis?: string;
}

export interface ProtocolContent {
  techniques: Technique[];
  drugs: ProtocolDrug[];
  /** Vital-sign and ventilation targets, one per line ("PAM ≥ 65 mmHg"). */
  targets: string[];
  /** Monitoring and equipment (procedure codes of pharmaco.ts or free text). */
  material: string[];
  risks: ProtocolRisk[];
  postop: string[];
  /** Post-operative orders to tick (analgesia, PCA/PCEA, thromboprophylaxis…), computed for the patient. */
  postopPlan?: PostopPlan;
  /** Tourniquet alert threshold, minutes (0 = no tourniquet). */
  tourniquetAlertMin: number | null;
  notes: string;
}

export interface Protocol {
  id: string;
  name: string;
  surgery: string;
  operation_category: string;
  hospital: string;
  content: ProtocolContent;
  source: string;
  created_at: string;
  updated_at: string;
}

export function emptyProtocolContent(): ProtocolContent {
  return { techniques: [], drugs: [], targets: [], material: [], risks: [], postop: [], tourniquetAlertMin: null, notes: "" };
}

export interface BodyData {
  sex?: Sex;
  weightKg?: number;
  heightCm?: number;
}

export function weightFor(basis: WeightBasis, body: BodyData): number | null {
  const { sex, weightKg, heightCm } = body;
  if (!weightKg) return null;
  if (basis === "total") return weightKg;
  if (!sex || !heightCm) return null;
  if (basis === "ideal") return idealBodyWeight(sex, heightCm);
  if (basis === "lean") return leanBodyWeight(sex, weightKg, heightCm);
  return adjustedBodyWeight(sex, weightKg, heightCm);
}

export interface ComputedDose {
  value: number;
  unit: DoseUnit;
  /** Weight used, kg — null for a fixed dose. */
  basisKg: number | null;
  capped: boolean;
}

function roundDose(v: number): number {
  if (v >= 100) return Math.round(v);
  if (v >= 10) return Math.round(v * 2) / 2;
  if (v >= 1) return Math.round(v * 10) / 10;
  return Math.round(v * 100) / 100;
}

/** The dose for this patient, or null when the weight it depends on isn't known yet. */
export function computeDose(drug: Pick<ProtocolDrug, "doseMode" | "amount" | "unit" | "weightBasis" | "maxAmount">, body: BodyData): ComputedDose | null {
  if (drug.amount === null || drug.amount <= 0) return null;
  if (drug.doseMode === "fixed") return { value: drug.amount, unit: drug.unit, basisKg: null, capped: false };
  const kg = weightFor(drug.weightBasis, body);
  if (kg === null) return null;
  let value = drug.amount * kg;
  let capped = false;
  if (drug.maxAmount !== null && drug.maxAmount > 0 && value > drug.maxAmount) {
    value = drug.maxAmount;
    capped = true;
  }
  return { value: roundDose(value), unit: drug.unit, basisKg: Math.round(kg * 10) / 10, capped };
}

export function formatDose(d: ComputedDose): string {
  return `${String(d.value).replace(".", ",")} ${d.unit}`;
}

/** "2 mg/kg × 71 kg (idéal)" — how the dose was obtained. */
export function doseBasis(drug: Pick<ProtocolDrug, "doseMode" | "amount" | "unit" | "weightBasis" | "maxAmount">, d: ComputedDose | null): string {
  if (drug.doseMode === "fixed") return "dose fixe";
  const basis = WEIGHT_BASES.find((b) => b.code === drug.weightBasis)?.short ?? drug.weightBasis;
  const per = `${String(drug.amount ?? "?").replace(".", ",")} ${drug.unit}/kg`;
  if (!d) return `${per} · poids ${basis} inconnu`;
  return `${per} × ${String(d.basisKg).replace(".", ",")} kg (${basis})${d.capped ? ` · plafonné à ${drug.maxAmount} ${drug.unit}` : ""}`;
}

const foldText = (t: string) =>
  t
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const words = (t: string) => new Set(foldText(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 3));

/** What the catalogue knows of an intervention, to rank the protocols. */
export interface ProtocolMatchItem {
  id: string;
  protocolId?: string;
  name?: string;
  category?: string;
  family?: string;
  approach?: string;
  population?: string;
}

// Words that name an approach or a population in a protocol's name.
const APPROACH_TERMS: Record<string, RegExp> = {
  open: /laparotomie|thoracotomie|lombotomie|sternotomie|voie ouverte/,
  laparoscopic: /coelioscop|laparoscop/,
  robotic: /robot/,
  thoracoscopic: /thoracoscop|vats/,
  endoscopic: /endoscop|hysteroscop|transuretral/,
  arthroscopic: /arthroscop/,
  vaginal: /vaginale/,
};
const CHILD_TERMS = /enfant|nourrisson|nouveau-ne|pediatri|premature/;
// Words that say how or where, not what: they don't make two interventions the same.
const GENERIC = new Set("par pour avec sous sans dans chirurgie chirurgical chirurgicale totale total partielle robot assistee robotique coelioscopie coelioscopique laparoscopie laparotomie thoracoscopie thoracotomie voie ouverte endoscopique percutanee cure pose reprise programmee urgence ambulatoire enfant nourrisson adulte premature nouveau les des une anesthesie generale rachianesthesie sedation ras rac resection exerese ablation fracture prothese arthroscopie osteosynthese".split(" "));
const content = (t: string) => new Set([...words(t)].filter((w) => !GENERIC.has(w)));

/**
 * The protocol that fits the intervention best:
 * - the protocol linked to the intervention in Paramètres, first;
 * - then the protocol written for this very intervention, then the reference
 *   protocol that covers it (protocol-coverage.ts), or one written for another
 *   variant of the same operation (same family), the same approach first;
 * - then words shared between the intervention and the protocol's name or
 *   intervention field;
 * - a protocol for children before the others for a child, after them for an adult;
 * - a protocol of the patient's hospital before a general one, same carnet
 *   category as a tie-breaker. null when nothing fits at all.
 */
export function matchProtocol(protocols: Protocol[], surgery: { name: string; category: string; catalogId?: string }, hospital: string, catalogue?: ProtocolMatchItem[]): Protocol | null {
  const item = surgery.catalogId ? catalogue?.find((x) => x.id === surgery.catalogId) : undefined;
  // The protocol linked to the intervention in Paramètres wins over everything.
  const explicit = item?.protocolId ? protocols.find((p) => p.id === item.protocolId) : undefined;
  if (explicit) return explicit;
  const target = content(surgery.name);
  if (target.size === 0) return null;
  const h = foldText(hospital.trim());
  const child = item?.population === "child" || item?.population === "neonate";
  const byName = new Map((catalogue ?? []).filter((x) => x.name).map((x) => [foldText(x.name!), x]));
  let best: { p: Protocol; score: number } | null = null;
  for (const p of protocols) {
    if (p.hospital && h && foldText(p.hospital) !== h) continue;
    const text = foldText(`${p.name} ${p.surgery}`);
    const own = new Set([...content(p.name), ...content(p.surgery)]);
    const shared = [...target].filter((w) => own.has(w)).length;
    const written = byName.get(foldText(p.surgery));
    const sameItem = !!item && written?.id === item.id;
    const sameFamily = !!item?.family && written?.family === item.family;
    const covered = protocolCovers(p.id, item);
    // Most of what the intervention is must be in the protocol, unless it is written for a variant of it.
    if (!sameItem && !sameFamily && !covered && shared / target.size <= 0.5) continue;
    const forChild = CHILD_TERMS.test(text) || written?.population === "child" || written?.population === "neonate";
    let score = shared / target.size;
    if (sameItem) score += 2;
    else if (covered) score += 1.5;
    else if (sameFamily) score += 1;
    if (item?.approach) {
      const approach = written?.approach;
      const named = Object.entries(APPROACH_TERMS).filter(([, re]) => re.test(text)).map(([a]) => a);
      if (approach === item.approach || named.includes(item.approach)) score += 0.3;
      else if (named.length > 0 || (approach && sameFamily)) score -= 0.3;
    }
    if (item && forChild) score += child ? 0.5 : -1;
    else if (child && !forChild) score -= 0.6;
    score += (p.hospital && h ? 0.5 : 0) + (p.operation_category && p.operation_category === surgery.category ? 0.1 : 0);
    if (!best || score > best.score) best = { p, score };
  }
  return best?.p ?? null;
}

/** Adds equipment and risk/conduct pairs to a plan, without duplicates. */
export function withAdditions(plan: ProtocolContent, add: { material?: string[]; risk?: ProtocolRisk }[]): ProtocolContent {
  const material = [...plan.material];
  const risks = [...plan.risks];
  for (const a of add) {
    for (const m of a.material ?? []) if (!material.some((x) => foldText(x) === foldText(m))) material.push(m);
    if (a.risk && !risks.some((x) => foldText(x.title) === foldText(a.risk!.title))) risks.push(a.risk);
  }
  return { ...plan, material, risks };
}

export function planHasAdditions(plan: ProtocolContent, a: { material?: string[]; risk?: ProtocolRisk }): boolean {
  const hasMaterial = (a.material ?? []).every((m) => plan.material.some((x) => foldText(x) === foldText(m)));
  const hasRisk = !a.risk || plan.risks.some((x) => foldText(x.title) === foldText(a.risk!.title));
  return hasMaterial && hasRisk;
}
