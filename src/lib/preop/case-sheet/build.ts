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
  technique: string;
  rows: SheetRow[];
}

export interface CaseSheet {
  initials: string;
  surgery: string;
  /** « HDJ », date… */
  tags: string[];
  /** « 38 ans, F, 100 kg, 176 cm, IMC 32 → PI 67 kg (PA 80 kg) ». */
  body: string;
  /** Technique, airway, ventilation. */
  technique: string;
  rows: SheetRow[];
  /** Antecedents: the ones that matter in bold, then « → » what they imply. */
  antecedents: SheetText[];
  implications: string[];
  surgical: string;
  treatments: SheetText[];
  allergies: SheetText[];
  /** « ! » lines: what must not be missed. */
  alerts: string[];
  notes: string[];
  fallback?: SheetFallback;
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

  const { candidates, item, sure } = chosenSurgery(p, catalogs, choices, { age, sex });
  c.surgery = item ? { ...surgeryFromItem(c.surgery, item), name: item.name } : { ...c.surgery, name: p.surgery };
  if (p.surgeon) c.surgery.surgeon = p.surgeon;

  const protocol = item ? matchProtocol(ctx.protocols, { name: item.name, category: item.category, catalogId: item.id }, "", catalogs.surgeries) : null;
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
    .concat(ibw ? ` → PI ${Math.round(ibw)} kg${abw ? ` (PA ${Math.round(abw)} kg)` : ""}` : "");

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

  // --- Antecedents: the pasted lines, in bold the ones that change the anaesthesia ---------
  const pointOf = new Map<string, AttentionPoint>(points.filter((x) => x.id.startsWith("cond-")).map((x) => [x.id.slice(5), x]));
  const implications: string[] = [];
  // Antecedents found outside a « Antécédents » section — a dictation, an emergency or surgical
  // consultation added to the patient — are listed by the words they were found in.
  const inLines = (from: string, lines: string[]) => lines.some((l) => fold(l).includes(fold(from)) || fold(from).includes(fold(l)));
  const historyLines = [
    ...p.history,
    ...[...new Set(quick.conditions.filter((q) => !inLines(q.from, p.history)).map((q) => q.from.replace(/\s*[?.;:]$/, "").trim()))],
    ...(p.history.length ? [] : quick.history),
  ];
  const antecedents: SheetText[] = historyLines.map((line) => {
    const matched = quick.conditions.filter((q) => fold(line).includes(fold(q.from)) || fold(q.from).includes(fold(line)));
    const notable = matched.map((q) => pointOf.get(q.id)).filter((x): x is AttentionPoint => !!x);
    for (const pt of notable) {
      const text = `${line.replace(/\s*[.;]$/, "")} → ${firstSentence(pt.detail)}`;
      if (!implications.some((i) => i.endsWith(firstSentence(pt.detail)))) implications.push(text);
    }
    return { text: line, strong: notable.length > 0 };
  });

  // --- Treatments and what to do with each -----------------------------------------------
  const treatmentLines = [...p.treatments, ...[...new Set(quick.treatments.filter((q) => !inLines(q.from, p.treatments)).map((q) => q.from.trim()))], ...(p.treatments.length ? [] : quick.freeTreatments)];
  const treatments: SheetText[] = treatmentLines.map((line) => {
    const t = c.treatments.find((x) => quick.treatments.some((q) => q.name === x.name && (fold(line).includes(fold(q.from)) || fold(q.from).includes(fold(line)))));
    if (!t) return { text: `${line} (non reconnu : conduite à vérifier)` };
    const g = treatmentGuide(t, ctx.rules, catalogs, { techniques: plan.techniques, bleedingRisk: c.surgery.bleedingRisk, crcl: scores.derived.crcl });
    const v = g.verdict;
    const action = v.kind === "stop" ? `STOP ${v.text.replace(/^Arrêt /, "").replace(/ avant le geste$/, " avant")}` : v.kind === "continue" ? "poursuivre" : v.kind === "depends" ? v.text.replace(/^Arrêt /, "arrêt ") : "à vérifier";
    return { text: `${line} → ${action}`, strong: v.kind === "stop" || v.kind === "depends" };
  });

  // --- Allergies ---------------------------------------------------------------------------
  const allergyLines = [...p.allergies, ...quick.allergies.filter((a) => !inLines(a.from, p.allergies)).map((a) => a.from)];
  const noKnownAllergy = p.noKnownAllergy || (!allergyLines.length && !!quick.noKnownAllergy);
  const allergies: SheetText[] = allergyLines.length ? allergyLines.map((a) => ({ text: a, strong: true })) : [{ text: noKnownAllergy ? "Pas d'allergie connue" : "Allergies non renseignées" }];

  // --- What must not be missed ------------------------------------------------------------
  const alerts: string[] = [];
  if (p.hemstop !== undefined && p.hemstop >= 2) alerts.push(`HEMSTOP ${p.hemstop}/6 : risque hémorragique, bilan d'hémostase`);
  if (p.jehovah) alerts.push("Témoin de Jéhovah : refus de transfusion (consentement, épargne sanguine)");
  // The other points of attention (airway, age, values, a drug of the plan the patient is allergic to…):
  // the antecedents' own are with the antecedents, the allergies with the allergies.
  const own = (pt: AttentionPoint) => pt.id.startsWith("cond-") || (pt.id.startsWith("allergy-") && !pt.id.startsWith("allergy-plan-")) || pt.id.startsWith("penfast-");
  const others = points.filter((pt) => !own(pt) && pt.level !== "info");
  // A5: the title, and the start of what to do when it fits on the line.
  for (const pt of [...others.filter((x) => x.level === "high"), ...others.filter((x) => x.level === "medium").slice(0, 3)]) alerts.push(alertText(pt));
  if (!allergyLines.length && !noKnownAllergy) alerts.push("Allergies non renseignées dans la consultation");

  // --- Questions -------------------------------------------------------------------------
  const questions: CaseQuestion[] = [];
  if (choices.surgeryId === undefined && (!item || !sure))
    questions.push({
      id: "surgery",
      text: item ? `« ${p.surgery} » : quelle intervention ?` : p.surgery ? `« ${p.surgery} » n'est pas dans le catalogue : laquelle s'en approche ?` : "Quelle intervention ?",
      options: [...candidates.map((x) => ({ value: x.id, label: x.name })), { value: "", label: "Aucune : garder le texte" }],
    });
  if (!choices.mode && !p.mode && modes.length > 1) questions.push({ id: "mode", text: "Quelle anesthésie ?", options: modes.map((m) => ({ value: m, label: MODE_LABEL[m] })) });
  if (!sex) questions.push({ id: "sex", text: "Sexe ?", options: [{ value: "F", label: "Femme" }, { value: "M", label: "Homme" }] });
  if (age === undefined) questions.push({ id: "age", text: "Âge ?" });
  if (!weightKg) questions.push({ id: "weightKg", text: "Poids (kg) ?" });
  if (!heightCm) questions.push({ id: "heightCm", text: "Taille (cm) ?" });

  const tags = [p.admission, p.plannedDate].filter((x): x is string => !!x);
  const notes = (choices.notes ?? "")
    .split(/\n{2,}|\n(?=\S)/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!protocol && item && !choices.plan)
    notes.unshift(mode === "general" ? "Pas de protocole pour cette intervention dans la bibliothèque : AG de base, à adapter (ATB, analgésie, NVPO à compléter)." : "Pas de protocole pour cette intervention dans la bibliothèque : doses à compléter.");

  // --- Plan B: the other technique, computed the same way, only what differs ----------------
  const fallbackModes = (["general", "neuraxial", "regional", "sedation"] as SheetMode[]).filter((m) => m !== mode && (m === "general" || modes.includes(m)));
  const fallbackMode = choices.fallback === null ? undefined : (choices.fallback ?? (mode !== "general" ? "general" : undefined));
  let fallback: SheetFallback | undefined;
  if (fallbackMode && fallbackModes.includes(fallbackMode)) {
    const b = buildCaseSheet(p, ctx, { ...choices, mode: fallbackMode, plan: undefined, fallback: null, tiva: fallbackMode === "general" ? choices.tiva : undefined });
    const OWN = new Set(["Induction", "Entretien", "Entretien (TIVA)", "Rachi", "ALR", "Sédation / entretien", "Analgésie", "NVPO"]);
    const textOf = (r: SheetRow) => r.parts.map((x) => x.text).join(" · ");
    const mine = new Map(rows.map((r) => [r.label, textOf(r)]));
    fallback = { mode: fallbackMode, technique: b.sheet.technique, rows: b.sheet.rows.filter((r) => OWN.has(r.label) && mine.get(r.label) !== textOf(r)) };
  }

  return {
    sheet: {
      initials: p.initials || "?",
      surgery: item && choices.surgeryId !== null ? item.name : p.surgery || "Intervention ?",
      tags,
      body: bodyText,
      technique: technique.join(", "),
      rows,
      antecedents,
      implications,
      surgical: [...p.surgical, ...p.anaesthetic.map((a) => `anesth. : ${a}`)].join(", "),
      treatments,
      allergies,
      alerts,
      notes,
      fallback,
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
