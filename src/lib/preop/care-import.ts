// A consultation read in CARE (the hospital record) by the EasyPM browser
// extension, brought into a dossier. The extension reads the « Avis Anesth
// Pré-opératoire » form while it is open in edit mode and hands it over with
// window.postMessage — from the extension's own side panel, never through a
// server. Only initials and the age travel (never the name, the birth date or
// the record number), and the dossier is kept encrypted on the device like any
// other (secure-store.ts).
//
// The free texts go through the same reading as a pasted letter
// (quick-entry.ts): headings, negations, values. Nothing already answered in
// the dossier is overwritten (applyQuickEntry), so reading CARE again after a
// change only adds what is new.

import { fold, type Catalogs } from "./catalog";
import { emptyConsultation, emptyDossier, type ConsultationState, type Dossier } from "./dossier";
import { applyQuickEntry, parseQuickEntry } from "./quick-entry";
import type { Technique } from "./rules/types";
import type { HEMSTOP_ITEMS, STOP_BANG_ITEMS } from "./scores";

export const CARE_MESSAGE = "easypm:care-consultation";
export const CARE_READY = "preop:care-ready";
export const CARE_DONE = "preop:care-imported";

export interface CareAnswer {
  /** Block of the form (« Score HEMSTOP adulte », « Stop-Bang »…). */
  group: string;
  question: string;
  answer: string;
}

export interface CarePayload {
  type: typeof CARE_MESSAGE;
  version: 1;
  /** Identifies the CARE consultation (a hash made by the extension, no identity in it). */
  key: string;
  initials: string;
  age?: number;
  sex?: "M" | "F";
  /** Intervention day, yyyy-mm-dd. */
  date?: string;
  surgery?: { name?: string; side?: string };
  setting?: "ambulatory" | "inpatient" | "icu";
  techniques?: Technique[];
  values?: Partial<Record<"weightKg" | "heightCm" | "hr" | "spo2" | "sbp" | "dbp" | "asa" | "mallampati" | "creatinineMgDl", number>>;
  /** Free texts of the form, by heading. */
  sections?: Partial<Record<"history" | "surgical" | "family" | "anaesthetic" | "allergy" | "treatment" | "habits" | "exam" | "biology" | "comments" | "information", string>>;
  answers?: CareAnswer[];
  /** Senior of the room that day (EasyPM planning): the carnet's supervisor. */
  supervisor?: string;
  room?: string;
}

/** Messages from anything other than a well-formed payload are ignored. */
export function isCarePayload(x: unknown): x is CarePayload {
  if (!x || typeof x !== "object") return false;
  const p = x as Partial<CarePayload>;
  return p.type === CARE_MESSAGE && p.version === 1 && typeof p.key === "string" && typeof p.initials === "string" && /^[A-Za-z]{1,4}$/.test(p.initials.trim());
}

const HEADINGS: [keyof NonNullable<CarePayload["sections"]>, string][] = [
  ["history", "Antécédents"],
  ["surgical", "Antécédents chirurgicaux"],
  ["anaesthetic", "Antécédents anesthésiques"],
  ["family", "Antécédents familiaux"],
  ["allergy", "Allergies"],
  ["treatment", "Traitement"],
  ["habits", "Mode de vie"],
  ["exam", "Examen clinique"],
  ["biology", "Biologie"],
];

/** The form as a letter with headings, for quick-entry. */
export function careText(p: CarePayload): string {
  const lines: string[] = [];
  for (const [key, heading] of HEADINGS) {
    const t = p.sections?.[key]?.trim();
    if (!t) continue;
    // A heading on its own line, then the text: quick-entry reads it line by line within the section.
    lines.push(`${heading} :`, ...t.split(/\n+/).map((l) => l.trim()).filter(Boolean));
  }
  return lines.join("\n");
}

const yes = (a: string) => /^oui\b/.test(fold(a));
const no = (a: string) => /^non\b|jamais/.test(fold(a));

const HEMSTOP_WORDS: [keyof typeof HEMSTOP_ITEMS, RegExp][] = [
  ["hemorrhage", /saignement prolonge|coupure/],
  ["hematoma", /bleus|hematome/],
  ["tooth", /dentiste|extraction dentaire/],
  ["surgery", /intervention chirurgicale|apres une intervention|operation/],
  ["parents", /famille|willebrand|hemophilie/],
  ["menorrhagia", /regles|exacyl/],
  ["obstetrics", /accouchement/],
];
const STOP_BANG_WORDS: [keyof typeof STOP_BANG_ITEMS, RegExp][] = [
  ["snoring", /ronfl/],
  ["tired", /fatigue|somnol/],
  ["observed", /observ|apnee/],
  ["pressure", /hypertension/],
  ["bmiOver35", /l ?m ?c|imc|bmi|35 ?kg/],
  ["ageOver50", /age/],
  ["neckOver40", /cou/],
  ["male", /sexe masculin|masculin/],
];

function scoreAnswers<K extends string>(answers: CareAnswer[], group: RegExp, words: [K, RegExp][]): Partial<Record<K, boolean>> {
  const out: Partial<Record<K, boolean>> = {};
  for (const a of answers) {
    if (!group.test(fold(a.group))) continue;
    const q = fold(a.question);
    const hit = words.find(([, re]) => re.test(q));
    if (!hit || (!yes(a.answer) && !no(a.answer))) continue;
    out[hit[0]] = yes(a.answer);
  }
  return out;
}

/** The consultation filled from CARE; what the dossier already says stays as it is. */
export function consultationFromCare(p: CarePayload, catalogs: Pick<Catalogs, "conditions" | "medications" | "allergens"> & Partial<Pick<Catalogs, "surgeries">>, base: ConsultationState = emptyConsultation()): ConsultationState {
  let c = applyQuickEntry(base, parseQuickEntry(careText(p), catalogs));
  const patient = { ...c.patient };
  if (p.age !== undefined && patient.age === undefined) patient.age = p.age;
  if (p.sex && !patient.sex) patient.sex = p.sex;
  const v = p.values ?? {};
  for (const k of ["weightKg", "heightCm", "hr", "spo2", "sbp", "dbp", "creatinineMgDl"] as const) {
    if (v[k] !== undefined && patient[k] === undefined) patient[k] = v[k];
  }
  const anaesthetic = p.sections?.anaesthetic?.trim();
  if (anaesthetic && !(patient.surgicalHistory ?? "").includes(anaesthetic)) patient.surgicalHistory = [patient.surgicalHistory, `Anesthésies : ${anaesthetic}`].filter(Boolean).join(" ; ");
  c = { ...c, patient };
  if (v.asa && c.asa === undefined && v.asa >= 1 && v.asa <= 6) c.asa = v.asa;
  if (v.mallampati && c.mallampati === undefined && v.mallampati >= 1 && v.mallampati <= 4) c.mallampati = v.mallampati as 1 | 2 | 3 | 4;
  const surgery = { ...c.surgery };
  if (p.surgery?.name && !surgery.name.trim()) surgery.name = p.surgery.name.trim();
  if (p.surgery?.side && !surgery.side.trim()) surgery.side = p.surgery.side.trim();
  if (p.setting && !surgery.setting) surgery.setting = p.setting;
  c = { ...c, surgery };
  if (p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && !c.plannedAt) c.plannedAt = `${p.date}T08:00`;
  if (p.techniques?.length) c.techniques = [...new Set([...c.techniques, ...p.techniques])];
  const answers = p.answers ?? [];
  c.hemstop = { ...scoreAnswers(answers, /hemstop/, HEMSTOP_WORDS), ...c.hemstop };
  c.stopBang = { ...scoreAnswers(answers, /stop.?bang/, STOP_BANG_WORDS), ...c.stopBang };
  const comments = [p.sections?.comments, p.sections?.information].map((x) => x?.trim()).filter(Boolean) as string[];
  const fresh = comments.filter((x) => !c.notes.includes(x));
  if (fresh.length) c.notes = [c.notes, ...fresh].filter(Boolean).join("\n");
  return c;
}

/** The dossier this CARE consultation goes to: the one already made from it, else the same initials on the same day. */
export function findCareDossier(dossiers: Dossier[], p: CarePayload): Dossier | undefined {
  const byKey = dossiers.find((d) => d.careKey === p.key && d.status !== "cancelled");
  if (byKey) return byKey;
  const initials = p.initials.trim().toUpperCase();
  return dossiers.find((d) => d.status !== "cancelled" && !d.careKey && d.initials === initials && !!p.date && d.consultation.plannedAt.startsWith(p.date));
}

/** New or updated dossier; `existing` keeps everything already entered. */
export function dossierFromCare(p: CarePayload, catalogs: Parameters<typeof consultationFromCare>[1], existing?: Dossier): Dossier {
  const base = existing ?? emptyDossier(p.initials);
  const now = new Date().toISOString();
  return {
    ...base,
    careKey: p.key,
    supervisorHint: p.supervisor?.trim() || base.supervisorHint,
    consultation: consultationFromCare(p, catalogs, base.consultation),
    updatedAt: now,
  };
}
