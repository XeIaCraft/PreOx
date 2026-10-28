// The work-up each patient of the sheet needs, and whether it is there.
// What is needed: the suggested preoperative tests (exams.ts: KCE 2016,
// NICE, ESC 2022, the procedure's profile, its bleeding risk) and what the
// technique adds (a spinal: platelets; under an anticoagulant or with a
// bleeding history: haemostasis; a direct oral anticoagulant: the
// creatinine). Whether it is there: the values read in the consultation, a
// biology or an ECG pasted with it (« Hb 13,2 Plaq 245 », « ECG : RS »,
// « Groupe A+, RAI nég. »), or ticked as done on the sheet. Anything can be
// taken off.

import { autoExamState, EXAM_LABELS, type ExamCode, type ExamRecommendation, type ExamStrength } from "../exams";
import type { ConsultationState } from "../dossier";
import type { Technique } from "../rules/types";
import { treatmentMatches } from "../medications";
import { fold } from "../catalog";
import { anyOf, has } from "../history";

export interface SheetWorkup {
  code: ExamCode;
  /** Short, as printed: « Groupe + RAI ». */
  label: string;
  /** There (a value, a line of the consultation, ticked), asked for but not back, or to plan. */
  status: "ok" | "asked" | "todo";
  /** What was found: « Hb 13,2 g/dL, plaquettes 245 G/L », « ECG : RS 72/min ». */
  value?: string;
  /** Why it is needed, in short. */
  reason: string;
  strength: ExamStrength;
}

const SHORT: Partial<Record<ExamCode, string>> = {
  fbc: "Hb, plaquettes",
  renal: "Créat., iono",
  haemostasis: "TP/INR, TCA",
  ecg: "ECG",
  hba1c: "HbA1c",
  pregnancy: "β-hCG",
  troponin: "Troponine",
  bnp: "NT-proBNP",
  echo: "ETT",
  group: "Groupe + RAI",
  iron: "Bilan martial",
  device: "Contrôle PM/DAI",
  albumin: "Albumine",
  abg: "Gazo",
  pft: "EFR",
  urine: "ECBU",
};
export const workupLabel = (code: ExamCode) => SHORT[code] ?? EXAM_LABELS[code];

/** Found in the text: the line that says it. */
const FOUND: Partial<Record<ExamCode, RegExp>> = {
  ecg: /\b(ecg|electrocardiogramme)\b/,
  group: /\b(groupe\s*(sanguin)?\s*[:=]?\s*(a|b|ab|o)\s*(\+|-|pos|neg|rh)|groupage|carte de groupe|\brai\b|agglutinines irregulieres)/,
  pregnancy: /\b(b-?hcg|β-?hcg|hcg|test de grossesse)\b/,
  echo: /\b(ett|echocardiographie|echo(graphie)? cardiaque|fevg|fe ?vg)\b/,
  haemostasis: /\b(tca|aptt|ratio|tp|fibrinogene|quick)\s*[:=]?\s*\d/,
  hba1c: /\bhba1c\b/,
  device: /\b(controle|interrogation)\b.*\b(pacemaker|stimulateur|dai|pm)\b/,
};
/** Said but not back: « groupe à faire », « ECG demandé ». */
const ASKED = /\b(a faire|a prevoir|a demander|a realiser|demande|prevu|en attente|en cours|manquant|non fait|pas fait|a refaire)\b/;

const n1 = (v: number) => String(v).replace(".", ",");

/** NSAIDs (kétorolac, ibuprofène, diclofénac, kétoprofène, parécoxib, coxibs…). */
const NSAID = /ketorolac|ibuprofen|diclofenac|ketoprofen|parecoxib|celecoxib|etoricoxib|naproxen|ains\b/;
/** Nephrotoxic or renally dosed antibiotics. */
const NEPHROTOXIC = /gentamicine|amikacine|tobramycine|vancomycine|colistine/;
/** « Kétorolac 30 mg IV » → « Kétorolac ». */
const short = (name: string) => name.split(/\s+\d|\s*\(/)[0];

export interface WorkupInput {
  recommendations: ExamRecommendation[];
  consultation: ConsultationState;
  techniques: Technique[];
  /** The plan's drugs (plan B's too): an NSAID, an aminoglycoside… ask for their own tests. */
  drugs?: string[];
  /** Every line of the patient: consultation(s), biology pasted, notes, lines added. */
  lines: string[];
  bleedingHistory?: boolean;
  /** Ticked on the sheet: done, or not needed. */
  marks?: Record<string, "done" | "skip">;
}

export function caseWorkup({ recommendations, consultation: c, techniques, drugs = [], lines, bleedingHistory, marks = {} }: WorkupInput): SheetWorkup[] {
  const needs = new Map<ExamCode, { strength: ExamStrength; reasons: string[] }>();
  const need = (code: ExamCode, strength: ExamStrength, reason: string) => {
    const x = needs.get(code);
    if (!x) needs.set(code, { strength, reasons: [reason] });
    else {
      if (!x.reasons.includes(reason)) x.reasons.unshift(reason);
      if (strength === "recommended") x.strength = "recommended";
    }
  };
  for (const r of recommendations) need(r.code, r.strength, shortReason(r.reasons[0]?.text ?? ""));

  // What the technique and the treatments add.
  const t = c.treatments;
  const vka = t.some((x) => treatmentMatches(x, "B01AA"));
  const doac = t.some((x) => treatmentMatches(x, "B01AF") || treatmentMatches(x, "B01AE"));
  const antiplatelet = t.some((x) => treatmentMatches(x, "B01AC"));
  const cirrhosis = has(c.conditions, "cirrhosis") === true;
  if (techniques.includes("neuraxial")) {
    need("fbc", "recommended", "rachi / péridurale : plaquettes");
    if (vka || doac || antiplatelet || bleedingHistory || cirrhosis)
      need("haemostasis", "recommended", `ponction neuraxiale ${vka || doac ? "sous anticoagulant" : antiplatelet ? "sous antiagrégant" : cirrhosis ? "et cirrhose" : "et anamnèse hémorragique"}`);
  }
  if (techniques.includes("deep_block") && (vka || doac)) need("haemostasis", "recommended", "bloc profond sous anticoagulant");
  if (vka) need("haemostasis", "recommended", "AVK : INR la veille");
  if (doac) need("renal", "recommended", "AOD : clairance (délai d'arrêt)");

  // What the plan's drugs need.
  const age = c.patient.age;
  const on = (atc: string) => t.some((x) => treatmentMatches(x, atc));
  const renalRisk = [
    age !== undefined && age >= 65 && "≥ 65 ans",
    (on("C09") || on("C03")) && "IEC/sartan/diurétique",
    anyOf(c.conditions, ["ckd", "dialysis"]) && "IRC",
    anyOf(c.conditions, ["diabetes_oral", "diabetes_insulin"]) && "diabète",
    has(c.conditions, "heart_failure") && "insuffisance cardiaque",
  ].filter((x): x is string => !!x);
  const nsaid = drugs.find((d) => NSAID.test(fold(d)));
  if (nsaid) need("renal", renalRisk.length ? "recommended" : "consider", `${short(nsaid)} au plan${renalRisk.length ? ` (${renalRisk.join(", ")})` : ""} : créatinine`);
  const nephrotoxic = drugs.find((d) => NEPHROTOXIC.test(fold(d)));
  if (nephrotoxic) need("renal", "recommended", `${short(nephrotoxic)} : créatinine (dose, néphrotoxicité)`);
  const sux = drugs.find((d) => /succinylcholine|suxamethonium|celocurine/.test(fold(d)));
  if (sux && (anyOf(c.conditions, ["ckd", "dialysis", "burns"]) || on("C03DA"))) need("renal", "recommended", "succinylcholine et risque d'hyperkaliémie : K⁺");

  // What the patient's treatments need.
  if (on("C03DA") || on("C09") || on("C01AA")) need("renal", "recommended", `${on("C01AA") ? "digoxine" : on("C03DA") ? "antialdostérone" : "IEC/sartan"} : K⁺, créatinine`);
  if (on("A10BA")) need("renal", "recommended", "metformine : créatinine (reprise, acidose lactique)");
  if (on("N05AN")) need("renal", "recommended", "lithium : Na⁺, créatinine (± lithémie)");
  if (on("B01AB")) need("fbc", "recommended", "héparine : plaquettes (TIH)");
  if (bleedingHistory) need("haemostasis", "recommended", "anamnèse hémorragique positive");

  // What the text says.
  const folded = lines.map((l) => ({ l: l.trim(), f: fold(l) })).filter((x) => x.l);
  const p = c.patient;
  const found = (code: ExamCode): { status: "ok" | "asked"; value: string } | null => {
    if (code === "fbc" && (p.hb !== undefined || p.platelets !== undefined))
      return { status: "ok", value: [p.hb !== undefined ? `Hb ${n1(p.hb)}` : "", p.platelets !== undefined ? `plaq. ${n1(p.platelets)}` : ""].filter(Boolean).join(", ") };
    const auto = autoExamState(code, p);
    if (auto) return { status: "ok", value: auto.note };
    const re = FOUND[code];
    const hit = re && folded.find((x) => re.test(x.f));
    if (!hit) return null;
    // « Examens complémentaires : ETT : FEVG préservée. Cinétique… » → « ETT : FEVG préservée ».
    const said = hit.l.replace(/^(examens?( clinique| complémentaires| paracliniques)?|biologie|bilan[^:]*|imagerie)\s*:\s*/i, "").split(/(?<=[a-zà-ÿ)%])\.\s/)[0].replace(/\s*:\s*(\S[^:]*)\s*:\s*\1/i, " : $1");
    // « Groupe sanguin : Groupe sanguin A + » → « Groupe sanguin A + ».
    const once = said.replace(/^([^:]{3,30}?)\s*:\s*(?=\1)/i, "");
    const value = once.length > 42 ? `${once.slice(0, 41).replace(/\s+\S*$/, "")}…` : once;
    return { status: ASKED.test(hit.f) ? "asked" : "ok", value };
  };

  const out: SheetWorkup[] = [];
  for (const [code, x] of needs) {
    if (marks[code] === "skip") continue;
    const f = marks[code] === "done" ? { status: "ok" as const, value: `${workupLabel(code)} fait` } : found(code);
    out.push({ code, label: workupLabel(code), status: f?.status ?? "todo", value: f?.value, reason: x.reasons[0], strength: x.strength });
  }
  // What must be planned first, then what is asked for, then what is there.
  const rank = { todo: 0, asked: 1, ok: 2 };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || (a.strength === b.strength ? 0 : a.strength === "recommended" ? -1 : 1));
}

/** « Chirurgie intermédiaire, ASA 3, facteur(s) de risque : … » → its first clause. */
function shortReason(text: string): string {
  const s = text.replace(/\s*\(.*?\)\s*/g, " ").split(/\s*[;:]\s*|,\s+(?=si |sans )/)[0].trim();
  return s.length > 70 ? `${s.slice(0, 69).replace(/\s+\S*$/, "")}…` : s;
}
