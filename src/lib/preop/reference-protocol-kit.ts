// Building blocks of the reference protocols (reference-protocols.ts and
// reference-protocols-more.ts): sources, drug and content constructors, and
// the pieces most protocols share. Every dose names its source.

import type { DoseUnit, DrugPhase, Protocol, ProtocolContent, ProtocolDrug, ProtocolRisk, WeightBasis } from "./protocols";
import { RISK_LIBRARY } from "./plan-catalog";
import type { PostopPlan } from "./postop";

export type ReferenceProtocol = Omit<Protocol, "created_at" | "updated_at">;

export const pid = (n: number) => `5f1c0a10-0004-4000-8000-${String(n).padStart(12, "0")}`;

export const MANUAL = "Manuel pratique d'anesthésie, 4e éd. 2020";
export const DUBOIS = "Ph. Dubois, « Anesthésie en orthopédie », CHU UCL Namur (cours EIUA)";
export const ROELANTS = "F. Roelants, « L'anesthésie de la femme enceinte », Cliniques universitaires Saint-Luc (EIUA 2022)";
export const HARDY = "P.-Y. Hardy, « Réhabilitation améliorée après chirurgie abdominale », CHU Liège (cours EIUA)";
export const ESAIC_FASTING = "ESAIC : jeûne de l'enfant 2022 (PMID 34857683)";

let seq = 0;
export function drug(
  name: string,
  phase: DrugPhase,
  route: string,
  dose: { fixed: number } | { perKg: number; basis?: WeightBasis; max?: number },
  unit: DoseUnit,
  note = "",
  redoseEveryMin: number | null = null
): ProtocolDrug {
  seq++;
  const perKg = "perKg" in dose;
  return {
    id: `d${seq}`,
    name,
    route,
    phase,
    doseMode: perKg ? "per_kg" : "fixed",
    amount: perKg ? dose.perKg : dose.fixed,
    unit,
    weightBasis: perKg ? (dose.basis ?? "total") : "total",
    maxAmount: perKg ? (dose.max ?? null) : null,
    redoseEveryMin,
    note,
  };
}

export const content = (c: Partial<ProtocolContent>): ProtocolContent => ({
  techniques: [],
  drugs: [],
  targets: [],
  material: [],
  risks: [],
  postop: [],
  tourniquetAlertMin: null,
  notes: "",
  ...c,
});

// Shared pieces --------------------------------------------------------------

export const cefazolin = (note = "Dans l'heure avant l'incision ; > 120 kg : 3 g. Durée > 4 h : réinjection de 1 g.") =>
  drug("Céfazoline", "antibio", "bolus_iv", { fixed: 2 }, "g", note, 240);
export const clindamycinAlt = () => drug("Clindamycine (si allergie immédiate aux bêtalactamines)", "antibio", "perfusion", { fixed: 600 }, "mg", "En 30 min, à la place de la céfazoline ; réinjection à 6 h.");
export const propofolInduction = (perKg = 2, basis: WeightBasis = "total") => drug("Propofol", "induction", "bolus_iv", { perKg, basis }, "mg", "2–3 mg/kg chez l'adulte, 1–2 mg/kg chez la personne âgée (manuel, chap. 6).");
export const sufentanil = (perKg = 0.2) => drug("Sufentanil", "induction", "bolus_iv", { perKg, basis: "lean" }, "µg", "0,2–0,6 µg/kg à l'induction (manuel, chap. 7).");
export const rocuronium = (perKg = 0.6) => drug("Rocuronium", "induction", "bolus_iv", { perKg, basis: "ideal" }, "mg", "Au poids idéal ; 0,9–1,2 mg/kg en séquence rapide.");
export const dexamethasone = (mg = 8) => drug("Dexaméthasone", "ponv", "bolus_iv", { fixed: mg }, "mg", "À l'induction : NVPO, analgésie (manuel, chap. 23 ; ERAS).");
export const ondansetron = () => drug("Ondansétron", "ponv", "bolus_iv", { fixed: 4 }, "mg", "30 min avant la fin.");
export const droperidol = () => drug("Dropéridol", "ponv", "bolus_iv", { fixed: 0.625 }, "mg", "0,5–1,25 mg, 30 min avant la fin, si PAS > 100 mmHg (manuel, chap. 23).");
export const paracetamol = () => drug("Paracétamol", "analgesia", "perfusion", { fixed: 1 }, "g", "Sur 15 min ; 4 × / jour ensuite.");
export const ketorolac = () => drug("Kétorolac", "analgesia", "bolus_iv", { fixed: 30 }, "mg", "Si pas de contre-indication aux AINS (rein, volémie, saignement).");
export const tranexamic = () => drug("Acide tranexamique", "haemodynamic", "perfusion", { perKg: 15 }, "mg", "10–15 mg/kg en début d'intervention (manuel, chap. 40).");
export const ketamineSparing = () => drug("Kétamine", "analgesia", "bolus_iv", { perKg: 0.15 }, "mg", "Épargne morphinique 0,15–0,5 mg/kg (cours Dubois ; manuel, chap. 6).");
export const MONITORING = ["ECG", "PNI", "SpO₂", "EtCO₂", "Température"];
export const metronidazole = () => drug("Métronidazole", "antibio", "perfusion", { fixed: 500 }, "mg", "En 20 min, avec la céfazoline (côlon, rectum, appendice) ; réinjection à 8 h (manuel, chap. 20).");
export const ropivacaineBlock = (mg: number, what: string) => drug(`Ropivacaïne (${what})`, "alr", "perinerveux", { fixed: mg }, "mg", "Échoguidé ; dose totale d'anesthésiques locaux ≤ 3 mg/kg, toutes voies cumulées (manuel, chap. 12).");
export const lidocaineIv = () => drug("Lidocaïne IV", "analgesia", "pse", { perKg: 1.5 }, "mg", "Bolus 1,5 mg/kg puis 2 mg/kg/h (manuel, tableau 7.5) : moins d'iléus et séjour plus court (RAC). PROSPECT 2024 ne la retient que si l'analgésie de base est impossible ; jamais avec une péridurale ou un bloc en cours.");
/** A risk of the library (plan-catalog.ts): why, prevention, conduct, crisis card. */
export const risk = (id: string): ProtocolRisk => {
  const r = RISK_LIBRARY.find((x) => x.id === id)!;
  return { title: r.title, why: r.why, prevention: r.prevention, conduct: r.conduct, source: r.source, crisis: r.crisis };
};
export const postop = (p: Partial<PostopPlan>): PostopPlan => ({ analgesia: [], watch: ["pain"], ...p });
export const PROSPECT_REF = (what: string, year: number, pmid: string) => `PROSPECT ${what} ${year} (PMID ${pmid})`;

