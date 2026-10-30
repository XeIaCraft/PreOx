// One patient's case-preparation sheet, from a pasted consultation: who
// (initials, age, weight, ideal weight), what and how (intervention,
// technique, airway, ventilation), the drugs with their doses computed for
// this patient (antibiotic, induction, maintenance — TCI rates for a TIVA —,
// analgesia, PONV), the antecedents with the ones that change the
// anaesthesia in bold and what they imply, each treatment's conduct, and
// what still has to be asked. Everything comes from what Préop already
// knows — the common library's protocols and rules, the catalogues, the
// service's habits — on the device: no patient data leaves it.

import { fold, type Catalogs, type SurgeryItem } from "../catalog";
import { emptyConsultation, type ConsultationState } from "../dossier";
import { parseQuickEntry, applyQuickEntry, type QuickEntryResult } from "../quick-entry";
import { consultationScores } from "../consultation-scores";
import { attentionPoints, type AttentionPoint } from "../attention";
import { searchSurgeries, surgeryFromItem } from "../surgery-search";
import { matchProtocol, withAdditions, computeDose, formatDose, type Protocol, type ProtocolContent, type ProtocolDrug, type BodyData } from "../protocols";
import { applyServicePrefs, type ServicePrefs } from "../service-prefs";
import { airwayChoice, defaultSheetMode, forMode, sheetModes, type SheetMode } from "../anaesthesia-sheet";
import { ventilationSettings } from "../ventilation";
import { tciSummary, tciDrugOf } from "../tci";
import { treatmentGuide } from "../treatment-guide";
import { kineticsFor, type Kinetics } from "../kinetics";
import { caseWorkup, type SheetWorkup } from "./workup";
import { autoKind, cleanLine, isWorkupLine, readLine, sectionKind, splitDictation, type LineKind } from "./lines";
import { propofolInduction, rocuronium, sufentanil } from "../reference-protocol-kit";
import { DEFAULT_GASES } from "../gases";
import { postopLines } from "../postop";
import { adjustedBodyWeight, bmi as bmiOf, idealBodyWeight } from "../scores";
import type { Rule, Technique } from "../rules/types";
import type { PastedConsultation } from "./parse";

/** What was answered or changed on the sheet (kept with the patient, on the device). */
export interface CaseChoices {
  /** Catalogue intervention chosen; null: none fits, keep the pasted wording. */
  surgeryId?: string | null;
  mode?: SheetMode;
  /** Maintenance by TCI (propofol, remifentanil) instead of a volatile agent. */
  tiva?: boolean;
  sex?: "M" | "F";
  age?: number;
  weightKg?: number;
  heightCm?: number;
  /** Other consultations (cardiology, intensive care transfer…), as pasted. */
  notes?: string;
  /** The plan adapted for this patient (« Adapter le protocole »): used as it is, instead of the protocol's. */
  plan?: ProtocolContent;
  /**
   * Plan B if the patient refuses or the technique fails: a technique, or
   * null for none. Unset: a general anaesthesia behind any other technique,
   * none behind a general anaesthesia.
   */
  fallback?: SheetMode | null;
  /** Another protocol of the library than the intervention's; null: back to the intervention's. */
  protocolId?: string | null;
  /** Where a line goes, moved on the sheet, by the line as found. */
  lines?: Record<string, LineKind>;
  /** A line's text corrected on the sheet, by the line as found (read again: implications, conduct). */
  edits?: Record<string, string>;
  /** Bold forced on (true) or off (false), by item key. */
  strong?: Record<string, boolean>;
  /** Lines added on the sheet. */
  added?: { id: string; section: ItemSection; text: string }[];
  /** Work-up ticked on the sheet: done, or not needed (« fbc », « group »…). */
  workup?: Record<string, "done" | "skip">;
  /** Where the patient goes: day hospital, ward, intensive care (unset: as the consultation says). */
  admission?: Admission;
  /** Why the patient is operated, as written for the handover (unset: as found in the consultation). */
  indication?: string;
  /** The handover sheet for the intensive care (unset: printed when the patient goes to the ICU). */
  transmission?: boolean;
}

export type Admission = "HDJ" | "Hospit." | "USI";
export const ADMISSIONS: Admission[] = ["HDJ", "Hospit.", "USI"];

/** Where a patient's line is printed. */
export type ItemSection = "atcd" | "habit" | "chir" | "ttt" | "allergy" | "alert" | "note";

/** One line of the patient's part of the sheet — it can be edited, moved, put in bold or taken off. */
export interface SheetItem {
  /** Stable while the line reads the same: hidden lines, bold, edits refer to it. */
  key: string;
  section: ItemSection;
  text: string;
  strong?: boolean;
  /** Antecedent: what it implies, in short; treatment: what to do with it. */
  detail?: string;
  /** Antecedent: what it implies, in full. */
  detailFull?: string;
  /** Treatment: stop, continue, or to be checked. */
  conduct?: "stop" | "continue" | "check";
  /** The line as found (edits and moves refer to it); absent for what the sheet writes itself. */
  source?: string;
  /** Added on the sheet: its id in `CaseChoices.added`. */
  addedId?: string;
  /** An alert of the second rank (shown when the settings ask for every alert). */
  minor?: boolean;
}

/** A drug's onset and half-times, for the « Pharmaco » list at the end of the sheet. */
export interface SheetKinetics {
  name: string;
  onset: string;
  csht?: string;
  duration: string;
  wake: string;
}

export interface CaseQuestion {
  id: "surgery" | "mode" | "sex" | "age" | "weightKg" | "heightCm";
  text: string;
  options?: { value: string; label: string }[];
}

export interface SheetText {
  text: string;
  strong?: boolean;
}

export interface SheetRow {
  label: string;
  parts: SheetText[];
}

/** Plan B: the other technique, ready (« Si refus / échec → AG… »). */
export interface SheetFallback {
  mode: SheetMode;
  /** Part of the plan, not a fallback: the protocol's steps include it (DBS: sedation, then an AG for the generator). */
  planned?: boolean;
  technique: string;
  rows: SheetRow[];
}

export interface CaseSheet {
  initials: string;
  /** Surname and first name, and the birth date (« 12/03/1958 »): this device's sheet only. */
  name?: string;
  birthDate?: string;
  surgery: string;
  /** « HDJ », date… */
  tags: string[];
  /** « 38 ans, F, 100 kg, 176 cm, IMC 32 → PI 67 kg (PA 80 kg) ». */
  body: string;
  /** Technique, airway, ventilation. */
  technique: string;
  rows: SheetRow[];
  /** The patient: antecedents (in bold the ones that change the anaesthesia), habits, operations, treatments, allergies, alerts, notes. */
  items: SheetItem[];
  fallback?: SheetFallback;
  /** Onset and half-times of the anaesthesia drugs (plan and plan B) — the « Pharmaco » list. */
  kinetics: SheetKinetics[];
  /** The tests the patient needs (procedure, technique, patient), there or to plan. */
  workup: SheetWorkup[];
  /** How the case goes, step by step (the protocol's « Déroulé », adapted for the patient). */
  steps: string[];
  /** The plan's targets (« PAM ≥ 65 mmHg »…). */
  targets: string[];
  /** Why the patient is operated, when the consultation says it. */
  indication?: string;
  /** Airway: Mallampati and what the consultation says. */
  airway?: string;
  admission?: Admission;
  /** Print the intensive care handover sheet after the case. */
  transmission: boolean;
}

export interface CaseResult {
  sheet: CaseSheet;
  questions: CaseQuestion[];
  /** The intervention candidates (for « changer d'intervention »). */
  candidates: SurgeryItem[];
  item?: SurgeryItem;
  protocol: Protocol | null;
  modes: SheetMode[];
  mode: SheetMode;
  tiva: boolean;
  /** Plan B chosen (or the default one), and the techniques it can be. */
  fallback?: SheetMode;
  fallbackModes: SheetMode[];
  /** For keeping the patient as a Préop dossier. */
  consultation: ConsultationState;
  plan: ProtocolContent;
  quick: QuickEntryResult;
}

export interface CaseContext {
  catalogs: Catalogs;
  rules: Rule[];
  protocols: Protocol[];
  service: ServicePrefs;
}

const n1 = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");
/** The text, cut at a sentence end within `max` characters when it is longer. */
const firstSentence = (t: string, max = 160) => {
  const clean = t.trim().replace(/[.\s]+$/, "");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" ; "));
  return end > 40 ? cut.slice(0, end).trim() : `${cut.trimEnd()}…`;
};

/** A line with a biology value: « Hb 13,2 », « plaquettes 245 », « créat. 0,9 ». */
const BIO_VALUE = /\b(hb|hgb|h[ée]moglobine|plaquettes|plaq|plq|plt|inr|cr[ée]at\w*|k\+?|na\+?|kali[ée]mie|natr[ée]mie|hba1c|ferritine|albumine|nt-?probnp|troponine|glyc[ée]mie)\b\.?\s*:?\s*\d/i;

/** « PROTHESE TOTALE (AU ROBOT) », « [hb < 13 g/dl …] »: a form's title or bracketed criteria, not about the patient. */
const isTitle = (t: string) => /^\[.*\]$/.test(t) || (t.length <= 60 && /[A-ZÀ-Ý]{3}/.test(t) && t === t.toUpperCase());

/** Alerts printed by default (the others: « Réglages › Alertes : toutes »). */
const MAX_ALERTS = 4;

const MODE_TECHNIQUES: Record<SheetMode, Technique[]> = { general: ["general"], neuraxial: ["neuraxial"], regional: ["deep_block"], sedation: ["sedation"] };
const MODE_LABEL: Record<SheetMode, string> = { general: "AG", neuraxial: "Rachianesthésie", regional: "ALR", sedation: "Sédation" };
const AGENT_LABEL = { sevoflurane: "Sévoflurane", desflurane: "Desflurane", isoflurane: "Isoflurane", tiva: "AIVOC" } as const;

/** Tube or supraglottic device for an adult or a child of this size. */
function airwayDevice(device: ReturnType<typeof airwayChoice>, body: BodyData & { age?: number }): string {
  const child = body.age !== undefined && body.age < 14;
  const tube = child ? `sonde ${n1(Math.round((body.age! / 4 + 3.5) * 2) / 2)} à ballonnet` : `sonde ${body.sex === "F" ? "7" : body.sex === "M" ? "7,5–8" : "7–8"}`;
  const w = body.weightKg;
  const lma = w === undefined ? "ML" : child ? "ML (taille selon le poids)" : `ML i-gel ${w < 50 ? 3 : w <= 90 ? 4 : 5}`;
  const parts: string[] = [];
  if (device.device === "ett") parts.push(`${device.rsi ? "ISR, " : ""}IOT ${device.nasal ? "nasale " : ""}${tube}`);
  else if (device.device === "lma") parts.push(lma);
  else if (device.device === "lma_or_ett") parts.push(`${lma} ou IOT ${tube}`);
  else if (device.device === "spontaneous") parts.push("ventilation spontanée");
  if (device.oneLung) parts.push("sonde double lumière");
  return parts.join(", ");
}

/** « AIVOC Schnider Ce 2,5–4 µg/mL (≈ 70 mL/h à 1 h) » — the syringe left out. */
const shortTci = (line: string) => line.replace(/ ≈ (.*? à 1 h).*$/, " (≈ $1)");

/** « Propofol 200 mg » (or the per-kg dose when the weight isn't known); alternatives « ou ». */
function drugTexts(drugs: ProtocolDrug[], body: BodyData & { age?: number }, opts: { tci?: boolean } = {}): string[] {
  const one = (d: ProtocolDrug) => {
    const tci = opts.tci || d.route === "aivoc" ? tciDrugOf(d.name) : null;
    if (tci) {
      const line = tciSummary(tci, body);
      if (line) return `${d.name} ${shortTci(line)}`;
    }
    const dose = computeDose(d, body);
    const amount = dose ? formatDose(dose) : d.amount ? `${n1(d.amount)} ${d.unit}${d.doseMode === "per_kg" ? "/kg" : ""}` : "";
    const redose = d.redoseEveryMin ? ` (réinj. /${d.redoseEveryMin >= 60 ? `${n1(d.redoseEveryMin / 60)} h` : `${d.redoseEveryMin} min`})` : "";
    return `${d.name}${amount ? ` ${amount}` : ""}${redose}`;
  };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const d of drugs) {
    if (d.choice) {
      if (seen.has(d.choice)) continue;
      seen.add(d.choice);
      out.push(
        drugs
          .filter((x) => x.choice === d.choice)
          .map(one)
          .join(" ou ")
      );
    } else out.push(one(d));
  }
  return out;
}

const STOP_WORDS = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "par", "avec", "sous", "pour", "sur", "en", "a", "au", "aux", "et", "droite", "droit", "gauche", "bilaterale", "bilateral", "programme", "programmee"]);

/**
 * The catalogue entries a pasted wording may mean — what the surgeon wrote
 * is rarely the catalogue's name: « Salpingectomie coelio + retrait DIU »,
 * « Résection endoscopique de prostate (RTUP) ». Each part (« + », « / »,
 * an abbreviation in brackets) is searched alone; a part nothing matches
 * drops one word at a time.
 */
export function surgeryCandidates(items: SurgeryItem[], text: string, patient: { age?: number; sex?: "M" | "F" }, limit = 4): SurgeryItem[] {
  const brackets = [...text.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
  const pieces = [text.replace(/\([^)]*\)/g, " "), ...brackets]
    .flatMap((t) => t.split(/\s\+\s|\s+et\s+|;|\s\/\s/))
    .map((t) =>
      fold(t)
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    )
    .filter(Boolean);
  const out: SurgeryItem[] = [];
  const add = (list: SurgeryItem[]) => {
    for (const x of list) if (!out.some((o) => o.id === x.id)) out.push(x);
  };
  for (const [k, piece] of pieces.entries()) {
    const all = piece.split(" ");
    const words = all.filter((w) => !STOP_WORDS.has(w));
    let found = searchSurgeries(items, all.join(" "), patient, limit);
    if (!found.length) found = searchSurgeries(items, words.join(" "), patient, limit);
    // Loosened for the operation itself only: an added gesture (« + retrait DIU ») must match as written.
    for (let drop = 1; k === 0 && !found.length && drop < words.length && words.length - drop >= 1; drop++) {
      // Every way of leaving `drop` words out, the first words (the operation itself) kept longest.
      const subsets: string[][] = [];
      const pick = (start: number, left: number, acc: string[]) => {
        if (left === 0) return void subsets.push(acc);
        for (let i = start; i < words.length; i++) pick(i + 1, left - 1, [...acc, words[i]]);
      };
      pick(0, words.length - drop, []);
      for (const sub of subsets) add(searchSurgeries(items, sub.join(" "), patient, 2));
      if (out.length) break;
    }
    add(found);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

function chosenSurgery(p: PastedConsultation, catalogs: Catalogs, choices: CaseChoices, patient: { age?: number; sex?: "M" | "F" }) {
  const candidates = p.surgery ? surgeryCandidates(catalogs.surgeries, p.surgery, patient) : [];
  if (choices.surgeryId === null) return { candidates, item: undefined, sure: true };
  const picked = choices.surgeryId ? catalogs.surgeries.find((s) => s.id === choices.surgeryId) : undefined;
  if (picked) return { candidates, item: picked, sure: true };
  const item = candidates[0];
  // Sure when the pasted wording is the catalogue's own, or a single candidate came out.
  const sure = !!item && (fold(item.name) === fold(p.surgery) || candidates.length === 1);
  return { candidates, item, sure };
}

const kineticsOf = (k: Kinetics): SheetKinetics => ({ name: k.name.replace(/\s*\(.*\)$/, ""), onset: k.onset, csht: k.csht, duration: k.duration, wake: k.wake });

/** « Ventilation au masque difficile prévisible : préoxygénation optimisée » — one printed line. */
function alertText(pt: AttentionPoint): string {
  const room = 95 - pt.title.length;
  if (!pt.detail || room < 25) return pt.title;
  const clause = pt.detail.split(/\s*[;.]\s+|,\s+/)[0].replace(/[.;]$/, "");
  const head = clause.length <= room ? clause : `${clause.slice(0, room - 1).replace(/\s+\S*$/, "")}…`;
  return `${pt.title} : ${head.charAt(0).toLowerCase()}${head.slice(1)}`;
}

export function buildCaseSheet(p: PastedConsultation, ctx: CaseContext, choices: CaseChoices = {}): CaseResult {
  const { catalogs } = ctx;
  const quick = parseQuickEntry(p.normalized, catalogs);
  const sex = choices.sex ?? p.sex ?? quick.sex;
  const age = choices.age ?? p.age ?? quick.values.find((v) => v.key === "age")?.value;
  const weightKg = choices.weightKg ?? p.weightKg ?? quick.values.find((v) => v.key === "weightKg")?.value;
  const heightCm = choices.heightCm ?? p.heightCm ?? quick.values.find((v) => v.key === "heightCm")?.value;
  const body = { sex, age, weightKg, heightCm };

  // The consultation, as a Préop dossier would hold it.
  let c = emptyConsultation();
  c.patient = { age, sex, weightKg, heightCm, ...(p.noKnownAllergy ? { noKnownAllergy: true } : {}) };
  c = applyQuickEntry(c, quick);
  if (p.noTreatment && c.treatments.length === 0) c.noTreatment = true;
  if (p.mallampati) c.mallampati = p.mallampati;

  // --- The patient: every line, in its own words ---------------------------------------
  // Where its heading says — or, without one, where what it says belongs (lines.ts). A line
  // nothing is recognised in goes to the notes as it is: never dropped, never a question;
  // it can be moved from the sheet. Lines added, corrected or moved on the sheet are read
  // again, so an antecedent typed in gets its implications, a treatment its conduct.
  type Line = { source: string; text: string; kind: LineKind; q: QuickEntryResult; addedId?: string; from?: LineKind };
  const lines: Line[] = [];
  const seen = new Set<string>();
  const addLine = (raw: string, section?: LineKind, addedId?: string) => {
    const source = cleanLine(raw);
    if (!source || seen.has(source)) return;
    seen.add(source);
    // « Conclusion : tabagisme très ancien » (a line that came under a heading this reader keeps): read without the heading's name.
    const bare = section ? source : source.replace(/^(examen( clinique| physique)?|ecg|biologie|bilan( biologique| sanguin)?|examens complémentaires|conclusion|synthèse|asa|commentaires?|remarques?) : /i, "");
    const text = cleanLine(choices.edits?.[source] ?? bare);
    const moved = choices.lines?.[source];
    const q = readLine(text, catalogs, moved ?? section);
    // « ECG : rythme sinusal »: the heading says it is a result (the work-up), whatever follows.
    const kind = moved ?? (section ? sectionKind(section, text, q) : isWorkupLine(source) ? "info" : (autoKind(text, q) ?? (isTitle(text) ? "ignore" : "note")));
    lines.push({ source, text: kind === "note" && !choices.edits?.[source] ? source : text, kind, q, addedId, from: section });
  };
  for (const [list, kind] of [
    [p.history, "atcd"],
    [p.treatments, "ttt"],
    [p.allergies, "allergy"],
    [p.habits, "habit"],
  ] as [string[], LineKind][])
    for (const l of list) addLine(l, kind);
  // A dictation is often one long line: each sentence is sorted on its own (« …, sous metformine. Allergie au latex. »).
  for (const l of p.other) for (const sentence of splitDictation(l)) addLine(sentence);
  for (const a of choices.added ?? []) if (a.section !== "alert" && a.section !== "chir") addLine(a.text, a.section === "note" ? "note" : a.section, a.id);
  const of = (k: LineKind) => lines.filter((l) => l.kind === k);
  // What was added, corrected or moved on the sheet counts for the plan and the points of attention too.
  for (const l of lines) if (l.addedId || choices.edits?.[l.source] || choices.lines?.[l.source]) c = applyQuickEntry(c, l.q);

  const { candidates, item, sure } = chosenSurgery(p, catalogs, choices, { age, sex });
  c.surgery = item ? { ...surgeryFromItem(c.surgery, item), name: item.name } : { ...c.surgery, name: p.surgery };
  if (p.surgeon) c.surgery.surgeon = p.surgeon;

  const chosenProtocol = choices.protocolId ? ctx.protocols.find((x) => x.id === choices.protocolId) : undefined;
  const protocol = chosenProtocol ?? (item ? matchProtocol(ctx.protocols, { name: item.name, category: item.category, catalogId: item.id }, "", catalogs.surgeries) : null);
  const modes = item ? sheetModes(item, protocol) : (["general", "neuraxial", "regional", "sedation"] as SheetMode[]);
  const mode: SheetMode = choices.mode ?? (p.mode && modes.includes(p.mode) ? p.mode : p.mode ?? (item ? defaultSheetMode(item, protocol) : "general"));

  // The plan: the protocol for that technique, the service's habits, the patient's own precautions.
  let plan: ProtocolContent;
  if (choices.plan) {
    plan = choices.plan;
    c.techniques = plan.techniques;
  } else {
    const reduced = item && protocol ? forMode(item, protocol, mode).protocol : protocol;
    plan = reduced ? structuredClone(reduced.content) : { techniques: [], drugs: [], targets: [], material: [], risks: [], postop: [], tourniquetAlertMin: null, notes: "" };
    if (plan.techniques.length === 0) plan.techniques = MODE_TECHNIQUES[mode];
    // A general anaesthesia the protocol doesn't give (a procedure usually done under a spinal):
    // the usual adult induction and a volatile maintenance, to start from.
    if (mode === "general" && !plan.drugs.some((d) => d.phase === "induction")) {
      const tube = item ? airwayChoice({ ...item, techniques: plan.techniques }, plan, true).device === "ett" : false;
      plan.drugs = [propofolInduction((age ?? 40) >= 65 ? 1.5 : 2, "lean"), sufentanil(0.2), ...(tube ? [rocuronium(0.6)] : []), ...plan.drugs];
      plan.gases ??= { ...DEFAULT_GASES };
    }
    plan = applyServicePrefs(plan, ctx.service, age).plan;
    c.techniques = plan.techniques;
    const scores0 = consultationScores(c, { plan, catalogs });
    const points0 = attentionPoints(c, scores0, plan);
    plan = withAdditions(plan, points0.filter((x) => x.material?.length || x.risk));
  }
  const scores = consultationScores(c, { plan, catalogs });
  const points = attentionPoints(c, scores, plan);
  const tiva = choices.tiva ?? plan.gases?.agent === "tiva";

  // --- Who --------------------------------------------------------------------------
  const ibw = sex && heightCm ? idealBodyWeight(sex, heightCm) : undefined;
  const bmi = weightKg && heightCm ? bmiOf(weightKg, heightCm) : undefined;
  const abw = sex && weightKg && heightCm && bmi && bmi >= 30 ? adjustedBodyWeight(sex, weightKg, heightCm) : undefined;
  const bodyText = [
    age !== undefined ? `${age} ans` : "âge ?",
    sex ?? "sexe ?",
    weightKg ? `${n1(weightKg)} kg` : "poids ?",
    heightCm ? `${heightCm} cm` : "taille ?",
    bmi ? `IMC ${Math.round(bmi)}` : "",
  ]
    .filter(Boolean)
    .join(", ")
    .concat(ibw ? ` → PI ${Math.round(ibw)} kg${abw ? ` (PA ${Math.round(abw)} kg)` : ""}` : "")
    .concat(c.asa ? ` · ASA ${c.asa}` : "");

  // --- How ----------------------------------------------------------------------------
  const drugs = plan.drugs;
  const phase = (...ph: ProtocolDrug["phase"][]) => drugs.filter((d) => ph.includes(d.phase));
  const technique: string[] = [MODE_LABEL[mode]];
  if (mode === "general" && item) {
    const choice = airwayChoice({ ...item, techniques: plan.techniques }, plan, true);
    const device = airwayDevice(choice, body);
    if (device) technique.push(device);
    const laparoscopy = choice.why.includes("pneumopéritoine") || /coelio|laparo|robot/.test(fold(item.name));
    const vent = ventilationSettings({ ...body, copd: !!scores.conditions.copd?.present, asthma: !!scores.conditions.asthma?.present }, { laparoscopy, oneLung: choice.oneLung, fio2: plan.gases?.fio2 });
    const v = (label: string) => vent.find((x) => x.label.startsWith(label))?.value;
    const vt = v("Volume courant");
    if (vt) technique.push(`Vt ${vt.replace(/ mL$/, "")} mL × ${(v("Fréquence") ?? "").replace("/min", "")}`);
    const peep = v("PEP");
    if (peep) technique.push(`PEP ${peep.replace(" cmH₂O", "")}`);
  } else if (mode === "general") technique.push(airwayDevice({ device: "lma_or_ett", rsi: false, nasal: false, oneLung: false, why: [] }, body));

  const rows: SheetRow[] = [];
  const row = (label: string, texts: string[]) => {
    // One part per product: each can be taken off the sheet on its own.
    if (texts.length) rows.push({ label, parts: texts.map((text) => ({ text })) });
  };
  row("ATB", drugTexts(phase("antibio"), body));
  row("Prémédication", drugTexts(phase("premed"), body));
  if (mode === "neuraxial" || mode === "regional") row(mode === "neuraxial" ? "Rachi" : "ALR", drugTexts(phase("alr"), body));
  row("Induction", drugTexts(phase("induction"), body));
  // Maintenance: the TCI rates of a TIVA, or the volatile agent.
  const maintenance = phase("maintenance");
  if (mode === "general") {
    if (tiva) {
      const tciDrugs = maintenance.filter((d) => tciDrugOf(d.name));
      const lines = tciDrugs.length ? drugTexts(tciDrugs, body, { tci: true }) : [];
      for (const drug of ["propofol", "remifentanil"] as const)
        if (!tciDrugs.some((d) => tciDrugOf(d.name) === drug)) {
          const line = tciSummary(drug, body);
          if (line) lines.push(`${drug === "propofol" ? "Propofol" : "Rémifentanil"} ${shortTci(line)}`);
        }
      row("Entretien (TIVA)", [...lines, ...drugTexts(maintenance.filter((d) => !tciDrugOf(d.name)), body)]);
    } else {
      const g = plan.gases;
      const gas = g && g.agent !== "tiva" ? `${AGENT_LABEL[g.agent]}${g.mac ? ` ${n1(g.mac[0])}–${n1(g.mac[1])} MAC` : ""}${g.freshGasLMin ? `, DGF ${n1(g.freshGasLMin)} L/min` : ""}${g.carrier === "n2o" ? ", N₂O" : ""}` : "";
      row("Entretien", [...(gas ? [gas] : []), ...drugTexts(maintenance, body)]);
    }
  } else row("Sédation / entretien", drugTexts(maintenance, body));
  row("Analgésie", drugTexts(phase("analgesia"), body));
  if (mode !== "neuraxial" && mode !== "regional") row("ALR", drugTexts(phase("alr"), body));
  row("NVPO", drugTexts(phase("ponv"), body));
  row("Hémodynamique", drugTexts(phase("haemodynamic"), body));
  row("Autres", drugTexts(phase("other"), body));
  // Post-op: the orders ticked (computed for the patient), the protocol's own lines, its post-op drugs.
  // A5: the destination in a word, no monitoring lines (the recovery room's).
  const orders = postopLines(plan.postopPlan, { age, weightKg, crcl: scores.derived.crcl })
    .map((l) => l.text.replace(/^Destination : (.)/, (_, x: string) => x.toUpperCase()))
    .filter((t) => !/^Surveillance\b/.test(t));
  const postop = [...orders, ...plan.postop, ...drugTexts(phase("postop"), body)];
  if (postop.length) rows.push({ label: "Post-op", parts: postop.slice(0, 8).map((text) => ({ text })) });

  const pointOf = new Map<string, AttentionPoint>(points.filter((x) => x.id.startsWith("cond-")).map((x) => [x.id.slice(5), x]));
  const items: SheetItem[] = [];
  const push = (item: SheetItem) => {
    const forced = choices.strong?.[item.key];
    items.push(forced === undefined ? item : { ...item, strong: forced });
  };
  const keyOf = (section: ItemSection, l: { source: string; addedId?: string }) => (l.addedId ? `add:${l.addedId}` : `${section}:${l.source}`);

  // The same antecedent in two consultations (« HTA », « HTA traitée depuis 2015 »): both lines kept, what it implies said once.
  const explained = new Set<string>();
  for (const l of of("atcd")) {
    const notable = l.q.conditions.map((q) => pointOf.get(q.id)).filter((x): x is AttentionPoint => !!x);
    const pt = notable.some((x) => !explained.has(x.id)) ? notable[0] : undefined;
    notable.forEach((x) => explained.add(x.id));
    push({ key: keyOf("atcd", l), section: "atcd", text: l.text, source: l.source, addedId: l.addedId, strong: notable.length > 0, detail: pt ? firstSentence(pt.detail, 110) : undefined, detailFull: pt ? notable.map((x) => x.detail.trim().replace(/\.$/, "")).join(" ; ") : undefined });
  }
  for (const l of of("habit")) push({ key: keyOf("habit", l), section: "habit", text: l.text, source: l.source, addedId: l.addedId });
  for (const x of [...p.surgical, ...p.anaesthetic.map((a) => `anesth. : ${a}`)]) push({ key: `chir:${x}`, section: "chir", text: choices.edits?.[x] ?? x, source: x });
  for (const a of choices.added ?? []) if (a.section === "chir") push({ key: `add:${a.id}`, section: "chir", text: a.text, addedId: a.id });

  // Treatments and what to do with each.
  const conduct = (name: string) => {
    const t = c.treatments.find((x) => x.name === name) ?? (() => {
      const q = quick.treatments.find((x) => x.name === name) ?? lines.flatMap((l) => l.q.treatments).find((x) => x.name === name);
      return q ? { id: q.id, atc: q.atc, name: q.name, catalogId: q.id, dailyDoseMg: q.dailyDoseMg, components: q.components } : undefined;
    })();
    if (!t) return null;
    const v = treatmentGuide(t, ctx.rules, catalogs, { techniques: plan.techniques, bleedingRisk: c.surgery.bleedingRisk, crcl: scores.derived.crcl }).verdict;
    const action = v.kind === "stop" ? `STOP ${v.text.replace(/^Arrêt /, "").replace(/ avant le geste$/, " avant")}` : v.kind === "continue" ? "poursuivre" : v.kind === "depends" ? v.text.replace(/^Arrêt /, "arrêt ") : "à vérifier";
    return { action, conduct: (v.kind === "stop" || v.kind === "depends" ? "stop" : v.kind === "continue" ? "continue" : "check") as SheetItem["conduct"] };
  };
  const listed = new Set<string>();
  const conductOf = new Map<string, SheetItem["conduct"]>();
  for (const l of of("ttt")) {
    const names = [...new Set(l.q.treatments.map((t) => t.name))];
    // Listed twice (the anaesthesia consultation and the emergencies'): the line kept — the dose may differ —, its conduct said once.
    if (names.length && names.every((n) => listed.has(n))) {
      push({ key: keyOf("ttt", l), section: "ttt", text: l.text, source: l.source, addedId: l.addedId, detail: "idem", conduct: conductOf.get(names[0]) ?? "check" });
      continue;
    }
    names.forEach((n) => listed.add(n));
    const verdicts = names.map((n) => ({ n, v: conduct(n) })).filter((x) => x.v);
    // The same conduct for each substance (a combination): said once.
    const same = verdicts.length > 1 && verdicts.every((x) => x.v!.action === verdicts[0].v!.action);
    const action = !verdicts.length ? "non reconnu : conduite à vérifier" : verdicts.length === 1 || same ? verdicts[0].v!.action : verdicts.map((x) => `${x.n} : ${x.v!.action}`).join(", ");
    const kind = !verdicts.length ? "check" : verdicts.some((x) => x.v!.conduct === "stop") ? "stop" : verdicts.some((x) => x.v!.conduct === "check") ? "check" : "continue";
    names.forEach((n) => conductOf.set(n, kind));
    push({ key: keyOf("ttt", l), section: "ttt", text: l.text, source: l.source, addedId: l.addedId, detail: action, conduct: kind, strong: kind === "stop" });
  }
  // A treatment only mentioned elsewhere (« FA sous Eliquis »), not in the list.
  // (Not a result or a test that was under « Traitement »: « Potassium (sérum) : 4,9 mmol/l », « écho de stress à la dobutamine ».)
  for (const l of lines.filter((x) => x.kind !== "ttt" && x.kind !== "ignore" && x.kind !== "info" && x.from !== "ttt"))
    for (const t of l.q.treatments) {
      if (listed.has(t.name)) continue;
      listed.add(t.name);
      const v = conduct(t.name);
      push({ key: `ttt:cité:${t.name}`, section: "ttt", text: `${t.name} (cité : « ${l.text} »)`, detail: v?.action, conduct: v?.conduct ?? "check", strong: v?.conduct === "stop" });
    }

  // Allergies.
  const allergyLines = of("allergy");
  const noKnownAllergy = p.noKnownAllergy || (!allergyLines.length && !!quick.noKnownAllergy);
  for (const l of allergyLines) push({ key: keyOf("allergy", l), section: "allergy", text: l.text, source: l.source, addedId: l.addedId, strong: !/^(pas d|aucune|non connue)/i.test(l.text) });
  if (!allergyLines.length) push({ key: "allergy:none", section: "allergy", text: noKnownAllergy ? "Pas d'allergie connue" : "Allergies non renseignées" });

  // What must not be missed.
  const alert = (text: string, minor = false) => push({ key: `alert:${text}`, section: "alert", text: choices.edits?.[`alert:${text}`] ?? text, strong: true, minor });
  if (p.hemstop !== undefined && p.hemstop >= 2) alert(`HEMSTOP ${p.hemstop}/6 : risque hémorragique, bilan d'hémostase`);
  if (p.jehovah) alert("Témoin de Jéhovah : refus de transfusion (consentement, épargne sanguine)");
  // The other points of attention (airway, age, values, a drug of the plan the patient is allergic to…):
  // the antecedents' own are with the antecedents, the allergies with the allergies.
  const own = (pt: AttentionPoint) => pt.id.startsWith("cond-") || (pt.id.startsWith("allergy-") && !pt.id.startsWith("allergy-plan-")) || pt.id.startsWith("penfast-");
  const others = points.filter((pt) => !own(pt) && pt.level !== "info");
  // A short list: the first high-level ones; what the work-up line already says (group, ECG) and the rest
  // are of the second rank (shown when the settings ask for every alert).
  let main = 0;
  for (const pt of others.filter((x) => x.level === "high")) {
    const text = alertText(pt);
    const said = /groupe sanguin|agglutinines|\bRAI\b|: ECG$/i.test(text);
    alert(text, said || main >= MAX_ALERTS);
    if (!said) main++;
  }
  for (const pt of others.filter((x) => x.level === "medium")) alert(alertText(pt), true);
  if (!allergyLines.length && !noKnownAllergy) alert("Allergies non renseignées dans la consultation");
  for (const a of choices.added ?? []) if (a.section === "alert") push({ key: `add:${a.id}`, section: "alert", text: a.text, addedId: a.id, strong: true });

  // Notes: lines nothing was recognised in, the other consultations pasted, the sheet's own remarks.
  for (const l of of("note")) push({ key: keyOf("note", l), section: "note", text: l.text, source: l.source, addedId: l.addedId });
  const pasted = (choices.notes ?? "")
    .split(/\n{2,}|\n(?=\S)/)
    .map((x) => x.trim())
    .filter(Boolean);
  for (const n of pasted) push({ key: `note:${n}`, section: "note", text: n });
  if (!protocol && item && !choices.plan)
    push({ key: "note:no-protocol", section: "note", text: mode === "general" ? "Pas de protocole pour cette intervention dans la bibliothèque : AG de base, à adapter (ATB, analgésie, NVPO à compléter)." : "Pas de protocole pour cette intervention dans la bibliothèque : doses à compléter." });

  // --- Work-up: what the procedure, the technique and the patient need, and what is there -----
  const allLines = [...p.raw.split("\n"), ...(choices.notes ?? "").split("\n"), ...(choices.added ?? []).map((a) => a.text)];
  // Values wherever they are in what was pasted (a biology under a heading the reader skips, one pasted later).
  const bio = parseQuickEntry(allLines.filter((l) => isWorkupLine(l) || BIO_VALUE.test(l)).join("\n"), catalogs).values;
  const measured = { ...c.patient };
  for (const v of bio) if (measured[v.key] === undefined) (measured as Record<string, unknown>)[v.key] = v.value;
  const workup = caseWorkup({
    recommendations: scores.exams.recommendations,
    consultation: { ...c, patient: measured },
    techniques: plan.techniques,
    drugs: plan.drugs.map((d) => d.name),
    lines: allLines,
    bleedingHistory: (p.hemstop ?? 0) >= 2 || Object.values(c.hemstop).some((v) => v === true),
    marks: choices.workup,
  });

  // --- Questions: only what the plan can't do without --------------------------------------
  const questions: CaseQuestion[] = [];
  if (choices.surgeryId === undefined && (!item || !sure))
    questions.push({
      id: "surgery",
      text: item ? `« ${p.surgery} » : quelle intervention ?` : p.surgery ? `« ${p.surgery} » n'est pas dans le catalogue : laquelle s'en approche ?` : "Quelle intervention ?",
      options: [...candidates.map((x) => ({ value: x.id, label: x.name })), { value: "", label: "Aucune : garder le texte" }],
    });
  // The technique isn't asked: the procedure's usual one is taken, a chip away from the others.
  if (!sex) questions.push({ id: "sex", text: "Sexe ?", options: [{ value: "F", label: "Femme" }, { value: "M", label: "Homme" }] });
  if (age === undefined) questions.push({ id: "age", text: "Âge ?" });
  if (!weightKg) questions.push({ id: "weightKg", text: "Poids (kg) ?" });
  if (!heightCm) questions.push({ id: "heightCm", text: "Taille (cm) ?" });

  // Where the patient goes: chosen on the sheet, else as the consultation says.
  const parsedAdmission = ADMISSIONS.find((a) => a === p.admission);
  const admission: Admission | undefined = choices.admission ?? parsedAdmission;
  const tags = [admission ?? p.admission, p.plannedDate].filter((x): x is string => !!x);
  const airway = [p.mallampati ? `Mallampati ${p.mallampati}` : "", ...p.airway].filter(Boolean).join(" ; ") || undefined;

  // --- How fast, how long: the anaesthesia drugs of the plan (and the volatile or TCI agents) ----
  const PK_GROUPS = new Set<Kinetics["group"]>(["hypnotic", "opioid", "nmb", "inhaled", "local", "reversal"]);
  const pkNames = [
    ...drugs.map((d) => d.name),
    ...(mode === "general" && tiva ? ["Propofol", "Rémifentanil"] : []),
    ...(mode === "general" && !tiva && plan.gases && plan.gases.agent !== "tiva" ? [plan.gases.agent] : []),
  ];
  const pkCards: Kinetics[] = [];
  for (const name of pkNames) {
    const k = kineticsFor(name);
    if (k && PK_GROUPS.has(k.group) && !pkCards.includes(k)) pkCards.push(k);
  }
  const kinetics: SheetKinetics[] = pkCards.map(kineticsOf);

  // --- Plan B: the other technique, computed the same way, only what differs ----------------
  const fallbackModes = (["general", "neuraxial", "regional", "sedation"] as SheetMode[]).filter((m) => m !== mode && (m === "general" || modes.includes(m)));
  const fallbackMode = choices.fallback === null ? undefined : (choices.fallback ?? (mode !== "general" ? "general" : undefined));
  let fallback: SheetFallback | undefined;
  if (fallbackMode && fallbackModes.includes(fallbackMode)) {
    const b = buildCaseSheet(p, ctx, { ...choices, mode: fallbackMode, plan: undefined, fallback: null, tiva: fallbackMode === "general" ? choices.tiva : undefined });
    const OWN = new Set(["Induction", "Entretien", "Entretien (TIVA)", "Rachi", "ALR", "Sédation / entretien", "Analgésie", "NVPO"]);
    const textOf = (r: SheetRow) => r.parts.map((x) => x.text).join(" · ");
    const mine = new Map(rows.map((r) => [r.label, textOf(r)]));
    const planned = fallbackMode === "general" && (plan.steps ?? []).some((x) => /\bAG\b|anesthésie générale/i.test(x));
    fallback = { mode: fallbackMode, ...(planned ? { planned } : {}), technique: b.sheet.technique, rows: b.sheet.rows.filter((r) => OWN.has(r.label) && mine.get(r.label) !== textOf(r)) };
    for (const k of b.sheet.kinetics) if (!kinetics.some((x) => x.name === k.name)) kinetics.push(k);
  }

  return {
    sheet: {
      initials: p.initials || "?",
      name: p.name,
      birthDate: p.birthDate,
      surgery: item && choices.surgeryId !== null ? item.name : p.surgery || "Intervention ?",
      tags,
      body: bodyText,
      technique: technique.join(", "),
      rows,
      items,
      fallback,
      kinetics,
      workup,
      steps: plan.steps ?? [],
      targets: plan.targets,
      airway,
      indication: (choices.indication ?? p.indication ?? c.surgery.indication)?.trim() || undefined,
      admission,
      // Handed over to the ICU: the patient is admitted there, or the protocol sends the patient there after the operation.
      transmission: choices.transmission ?? (admission === "USI" || plan.postopPlan?.destination === "icu"),
    },
    questions,
    candidates,
    item,
    protocol,
    modes,
    mode,
    tiva,
    fallback: fallback?.mode,
    fallbackModes,
    consultation: c,
    plan,
    quick,
  };
}
