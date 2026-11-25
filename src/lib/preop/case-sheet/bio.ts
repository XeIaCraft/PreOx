// The biology of a consultation or of a result pasted later, value by value.
// « Hb 13,2 g/dL, Plaq 245, Créat 0,9 mg/dL, CRP < 5, TSH 2,1 »: every test
// the reader knows by name is read, with its unit when there is one, so that
// nothing of what was pasted is left out of the work-up; any other
// « Nom : valeur unité » of a biology line is kept under its own name.

import { fold } from "../catalog";
import type { ExamCode } from "../exams";

export interface BioResult {
  key: string;
  /** As printed: « Hb », « Créat. ». */
  label: string;
  /** As written: « 13,2 », « < 5 ». */
  value: string;
  unit?: string;
  group: BioGroup;
}

export type BioGroup = "fbc" | "renal" | "haemostasis" | "hba1c" | "iron" | "albumin" | "bnp" | "troponin" | "abg" | "hepatic" | "inflammation" | "metabolic" | "other";

/** The test of the work-up a group of results belongs to; none: shown on its own. */
export const GROUP_EXAM: Partial<Record<BioGroup, ExamCode>> = { fbc: "fbc", renal: "renal", haemostasis: "haemostasis", hba1c: "hba1c", iron: "iron", albumin: "albumin", bnp: "bnp", troponin: "troponin", abg: "abg" };
export const GROUP_LABEL: Record<BioGroup, string> = {
  fbc: "Hémogramme",
  renal: "Rein, ionogramme",
  haemostasis: "Hémostase",
  hba1c: "HbA1c",
  iron: "Bilan martial",
  albumin: "Albumine",
  bnp: "NT-proBNP",
  troponin: "Troponine",
  abg: "Gazométrie",
  hepatic: "Bilan hépatique",
  inflammation: "Inflammation",
  metabolic: "Métabolisme, thyroïde",
  other: "Autres résultats",
};
const GROUP_ORDER: BioGroup[] = ["fbc", "renal", "haemostasis", "hepatic", "inflammation", "metabolic", "hba1c", "iron", "albumin", "bnp", "troponin", "abg", "other"];

// name pattern (accents spelled out: it is matched on the text as written), key, label, group
const TESTS: [string, string, string, BioGroup][] = [
  ["h(?:b|gb)|h[ée]moglobine", "hb", "Hb", "fbc"],
  ["ht|h[ée]matocrite", "ht", "Ht", "fbc"],
  ["gb|leucocytes|globules blancs|leuco", "gb", "GB", "fbc"],
  ["plaquettes|plaq|plq|plt", "plt", "Plaq.", "fbc"],
  ["vgm", "vgm", "VGM", "fbc"],
  ["pnn|neutrophiles", "pnn", "PNN", "fbc"],
  ["lymphocytes|lympho", "lym", "Lympho", "fbc"],
  ["cr[ée]atinine|cr[ée]at\\.?|creat", "creat", "Créat.", "renal"],
  ["ur[ée]e", "urea", "Urée", "renal"],
  ["dfg|egfr|clairance(?: de la cr[ée]atinine)?|cockcroft|mdrd|ckd-?epi", "dfg", "DFG", "renal"],
  ["natr[ée]mie|na\\+?", "na", "Na", "renal"],
  ["kali[ée]mie|k\\+?|potassium", "k", "K", "renal"],
  ["chlore|cl-?", "cl", "Cl", "renal"],
  ["calcium|ca(?:\\+\\+)?|calc[ée]mie", "ca", "Ca", "renal"],
  ["magn[ée]sium|mg(?:\\+\\+)?", "mg", "Mg", "renal"],
  ["phosphore|phosphat[ée]mie|phosphates?", "phos", "Phosphate", "renal"],
  ["bicarbonates?|hco3-?|r[ée]serve alcaline", "hco3", "HCO₃", "renal"],
  ["inr", "inr", "INR", "haemostasis"],
  ["tp|taux de prothrombine|quick", "tp", "TP", "haemostasis"],
  ["tca|aptt|ratio tca", "tca", "TCA", "haemostasis"],
  ["fibrinog[èe]ne", "fib", "Fibrinogène", "haemostasis"],
  ["anti-?xa", "antixa", "Anti-Xa", "haemostasis"],
  ["asat|sgot", "asat", "ASAT", "hepatic"],
  ["alat|sgpt", "alat", "ALAT", "hepatic"],
  ["ggt|gamma-?gt", "ggt", "GGT", "hepatic"],
  ["pal|phosphatases? alcalines?", "pal", "PAL", "hepatic"],
  ["bilirubine(?: totale)?|bili", "bili", "Bilirubine", "hepatic"],
  ["crp|prot[ée]ine c r[ée]active", "crp", "CRP", "inflammation"],
  ["pct|procalcitonine", "pct", "PCT", "inflammation"],
  ["vs|vitesse de s[ée]dimentation", "vs", "VS", "inflammation"],
  ["gly[cç][ée]mie|glucose|glyc", "gly", "Glycémie", "metabolic"],
  ["tsh", "tsh", "TSH", "metabolic"],
  ["t4 libre|ft4|t4l", "ft4", "T4 libre", "metabolic"],
  ["lactates?", "lac", "Lactate", "metabolic"],
  ["ldh", "ldh", "LDH", "metabolic"],
  ["ck|cpk", "ck", "CK", "metabolic"],
  ["psa", "psa", "PSA", "metabolic"],
  ["vitamine d|25-?oh(?:-?vitamine d)?", "vitd", "Vit. D", "metabolic"],
  ["vitamine b12|b12", "b12", "B12", "metabolic"],
  ["hba1c|h[ée]moglobine glyqu[ée]e", "hba1c", "HbA1c", "hba1c"],
  ["ferritine", "ferritin", "Ferritine", "iron"],
  ["fer s[ée]rique|fer", "iron", "Fer", "iron"],
  ["cst|coefficient de saturation(?: de la transferrine)?|saturation de la transferrine", "cst", "CST", "iron"],
  ["transferrine", "transf", "Transferrine", "iron"],
  ["albumine|alb", "alb", "Albumine", "albumin"],
  ["nt-?pro-?bnp|bnp", "bnp", "NT-proBNP", "bnp"],
  ["troponine(?: [Iit]s?)?|hs-?tn[it]?|tn[it]", "trop", "Troponine", "troponin"],
  ["ph", "ph", "pH", "abg"],
  ["pco2|paco2", "pco2", "PaCO₂", "abg"],
  ["po2|pao2", "po2", "PaO₂", "abg"],
  ["sao2", "sao2", "SaO₂", "abg"],
];

const UNIT = "(?:g\\/d?l|mg\\/d?l|mg\\/l|g\\/l|[µu]mol\\/l|mmol\\/l|meq\\/l|µg\\/l|ug\\/l|ng\\/m?l|pg\\/m?l|u\\/l|ui\\/l|ui\\/ml|mui\\/l|miu\\/l|g\\/dl|%|ml\\/min(?:\\/1[,.]73\\s?m[²2])?|s|sec|fl|mm\\/h|mmhg|kpa|10\\^?9\\/l|10\\^?12\\/l|\\/mm[³3]|g\\/l|mm)";
const NUMBER = "[<>≤≥]?\\s*\\d+(?:[.,]\\d+)?";
const names = TESTS.map(([re]) => `(?:${re})`).join("|");
// A test name, then ":", "=" or a space, then the value and its unit (when it is there).
const KNOWN = new RegExp(`(?<![\\wÀ-ÿ])(?<!\\d\\s?)(${names})(?![\\wÀ-ÿ])\\s*[:=]?\\s*(${NUMBER})(?:\\s?(${UNIT})(?![\\wÀ-ÿ]))?`, "gi");
// Any other « Nom : valeur unité » of a biology line: the unit is what tells it is a result.
const GENERIC = new RegExp(`(?<![\\wÀ-ÿ])([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 '.\\-/()]{1,28}?)\\s*[:=]\\s*(${NUMBER})\\s?(${UNIT})(?![\\wÀ-ÿ])`, "gi");
/** What is not biology even with a number and a unit. */
const NOT_BIO = /^(poids|taille|tension|ta|fc|fr|temp|temp[ée]rature|age|âge|imc|bmi|sat|spo2|ouverture|dist|distance|dose)\b/i;

const tidy = (v: string) => v.replace(/\s+/g, "").replace(".", ",");
const lookup = (name: string) => {
  const n = fold(name);
  for (const [re, key, label, group] of TESTS) if (new RegExp(`^(?:${fold(re)})$`, "i").test(n)) return { key, label, group };
  return null;
};

/** Every result found in the lines; a test given twice keeps its last value (the latest pasted). */
export function extractBio(lines: string[]): BioResult[] {
  const byKey = new Map<string, BioResult>();
  for (const line of lines) {
    for (const m of line.matchAll(KNOWN)) {
      const t = lookup(m[1]);
      if (!t) continue;
      // « Mg 5 mg » (a dose) or « K 4 » inside a word: a unit that is not the test's is only kept for the known tests.
      byKey.set(t.key, { ...t, value: tidy(m[2]), ...(m[3] ? { unit: m[3] } : {}) });
    }
    for (const m of line.matchAll(GENERIC)) {
      const name = m[1].trim().replace(/^[()\-/. ]+|[()\-/. ]+$/g, "");
      if (name.length < 2 || NOT_BIO.test(name) || lookup(name) || TESTS.some(([re]) => new RegExp(`(?<![\\wÀ-ÿ])(?:${re})(?![\\wÀ-ÿ])`, "i").test(name))) continue;
      const key = `x:${fold(name)}`;
      byKey.set(key, { key, label: name.length > 24 ? `${name.slice(0, 23)}…` : name, value: tidy(m[2]), unit: m[3], group: "other" });
    }
  }
  const rank = (g: BioGroup) => GROUP_ORDER.indexOf(g);
  return [...byKey.values()].sort((a, b) => rank(a.group) - rank(b.group));
}

/** « Hb 13,2 g/dL » */
export const formatResult = (r: BioResult) => `${r.label} ${r.value}${r.unit ? ` ${r.unit}` : ""}`;

/** The results of one group, as one line: « Hb 13,2 g/dL, Plaq. 245 G/L ». */
export const formatGroup = (list: BioResult[]) => list.map(formatResult).join(", ");

/** The results by group (only the groups there). */
export function resultsByGroup(list: BioResult[]): Map<BioGroup, BioResult[]> {
  const out = new Map<BioGroup, BioResult[]>();
  for (const r of list) out.set(r.group, [...(out.get(r.group) ?? []), r]);
  return out;
}
