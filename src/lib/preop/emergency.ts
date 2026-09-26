// The emergency sheet: for each crisis, the drugs and their doses already
// computed for this patient, so nothing is calculated under stress. Every
// dose comes from the reference (drug-reference.ts, Manuel pratique
// d'anesthésie 2020) — nothing is added here that the reference does not
// give. A dose that needs a weight shows "poids requis" until it is known.

import { DRUG_REFERENCES, DRUG_REFERENCE_SOURCE, type ReferenceDose } from "./drug-reference";
import { weightFor, type BodyData } from "./protocols";

export interface EmergencyDose {
  drug: string;
  /** The reference line it comes from (« Arrêt cardiaque de l'enfant (IV ou IO) »). */
  label: string;
  /** Computed for the patient: « 70 mg », « 5–35 mg », « 3,5–70 µg/min ». */
  dose: string | null;
  /** How: « 1 mg/kg × 70 kg (réel) », « dose fixe ». */
  how: string;
  note?: string;
  chapter: string;
}

export interface EmergencySection {
  id: string;
  title: string;
  doses: EmergencyDose[];
}

const n = (v: number) => {
  const r = v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 2) / 2 : v >= 1 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
  return String(r).replace(".", ",");
};
const range = (a: number, b: number) => (a === b ? n(a) : `${n(a)}–${n(b)}`);

function compute(d: ReferenceDose, body: BodyData): { dose: string | null; how: string } {
  const basis = d.basis ?? "total";
  const basisLabel = basis === "total" ? "réel" : basis === "ideal" ? "idéal" : basis === "lean" ? "maigre" : "ajusté";
  if (d.mode === "fixed") return { dose: `${range(d.min, d.max)} ${d.unit}`, how: "dose fixe" };
  const kg = weightFor(basis, body);
  if (d.mode === "per_kg") {
    if (kg === null) return { dose: null, how: `${range(d.min, d.max)} ${d.unit}/kg · poids ${basisLabel} requis` };
    return { dose: `${range(d.min * kg, d.max * kg)} ${d.unit}`, how: `${range(d.min, d.max)} ${d.unit}/kg × ${n(kg)} kg (${basisLabel})` };
  }
  // A rate: per kilo when « /kg/… », shown both ways.
  const per = d.per ?? "";
  if (per.startsWith("/kg")) {
    const unitTime = per.replace("/kg", "");
    if (kg === null) return { dose: null, how: `${range(d.min, d.max)} ${d.unit}${per} · poids requis` };
    return { dose: `${range(d.min * kg, d.max * kg)} ${d.unit}${unitTime}`, how: `${range(d.min, d.max)} ${d.unit}${per} × ${n(kg)} kg (${basisLabel})` };
  }
  return { dose: `${range(d.min, d.max)} ${d.unit}${per}`, how: "débit fixe" };
}

/** A reference dose by drug name and label pattern — undefined if the reference does not have it. */
function pick(drug: string, label: RegExp, body: BodyData, note?: string): EmergencyDose | undefined {
  const ref = DRUG_REFERENCES.find((r) => r.name.toLowerCase().startsWith(drug.toLowerCase()));
  const d = ref?.doses.find((x) => label.test(x.label));
  if (!ref || !d) return undefined;
  const c = compute(d, body);
  return { drug: ref.name, label: d.label, dose: c.dose, how: c.how, note: note ?? d.note, chapter: ref.chapter };
}

/** Intralipide 20 % (toxicité des anesthésiques locaux) — manual, chap. 12, not a drug-reference entry. */
function intralipid(body: BodyData): EmergencyDose {
  const kg = body.weightKg;
  return {
    drug: "Intralipide 20 %",
    label: "Toxicité des anesthésiques locaux : bolus en 1 min, à répéter 3 × toutes les 5 min",
    dose: kg ? `${range(kg * 1, kg * 1.5)} mL` : null,
    how: kg ? `1–1,5 mL/kg × ${n(kg)} kg (réel)` : "1–1,5 mL/kg · poids requis",
    note: "Perfusion : 500 ml suffisent généralement pour 80 kg ; convulsions : clonazépam 1 mg, oxygène.",
    chapter: "chap. 12",
  };
}

export function emergencySheet(p: BodyData & { age?: number }): EmergencySection[] {
  const body: BodyData = { sex: p.sex, weightKg: p.weightKg, heightCm: p.heightCm };
  const child = p.age !== undefined && p.age < 16;
  const sections: { id: string; title: string; doses: (EmergencyDose | undefined)[] }[] = [
    {
      id: "arrest",
      title: "Arrêt cardiaque",
      doses: child
        ? [pick("Adrénaline", /enfant/, body), pick("Amiodarone", /Enfant/, body)]
        : [pick("Adrénaline", /Réanimation cardiopulmonaire/, body), pick("Amiodarone", /FV ou TV/, body)],
    },
    {
      id: "haemodynamic",
      title: "Hypotension, bradycardie, choc",
      doses: [
        pick("Éphédrine", /Hypotension/, body),
        pick("Phényléphrine", /bolus/, body),
        pick("Noradrénaline", /choc/, body),
        pick("Adrénaline", /État de choc/, body, "Anaphylaxie : bolus titrés selon la gravité — à fixer dans vos règles ou votre protocole."),
        child ? pick("Atropine", /Sécrétions/, body) : pick("Atropine", /Bradycardie/, body),
      ],
    },
    {
      id: "airway",
      title: "Voies aériennes et curarisation",
      doses: [
        pick("Suxaméthonium", child ? /enfant \(chap/ : /^Intubation$/, body),
        child ? pick("Suxaméthonium", /Laryngospasme/, body) : undefined,
        pick("Rocuronium", /Séquence rapide/, body),
        pick("Sugammadex", /Urgence/, body),
      ],
    },
    {
      id: "rhythm",
      title: "Troubles du rythme",
      doses: [pick("Adénosine", /Tachycardie/, body), pick("Amiodarone", /Tachycardie stable/, body), pick("Esmolol", /Bolus/, body), pick("Isoprénaline", /Bradycardie/, body)],
    },
    {
      id: "hypertension",
      title: "Poussée hypertensive",
      doses: [pick("Urapidil", /Bolus/, body), pick("Nicardipine", /Bolus/, body)],
    },
    {
      id: "toxic",
      title: "Toxicité, surdosage, hyperthermie maligne",
      doses: [intralipid(body), pick("Dantrolène", /Crise/, body), pick("Naloxone", /Toutes/, body), pick("Flumazénil", /Surdosage/, body), pick("Bleu de méthylène", /Méthémoglobinémie/, body)],
    },
    {
      id: "metabolic",
      title: "Métabolique, bronchospasme, surrénale",
      doses: [pick("Calcium", /Hyperkaliémie/, body), pick("Magnésium", /asthme/, body), pick("Hydrocortisone", /Couverture/, body), pick("Glucagon", /Intoxication/, body)],
    },
    {
      id: "bleeding",
      title: "Hémorragie",
      doses: [pick("Acide tranexamique", /Prothèse de hanche/, body), pick("Fibrinogène", /Saignement/, body), pick("Protamine", /Neutralisation/, body)],
    },
  ];
  return sections.map((s) => ({ id: s.id, title: s.title, doses: s.doses.filter((d): d is EmergencyDose => !!d) })).filter((s) => s.doses.length > 0);
}

export const EMERGENCY_SOURCE = `${DRUG_REFERENCE_SOURCE} (doses de la référence du module ; intralipide : chap. 12)`;
