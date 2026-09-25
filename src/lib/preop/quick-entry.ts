// Quick entry: one sentence typed or dictated during the consultation
// ("HTA, diabète sous metformine 1 g 2×/j, stent 2021 sous Asaflow,
// allergie pénicilline, fumeur 20 PA") split into antecedents, treatments,
// allergies and substance use, matched against the catalogues. Local and
// deterministic: nothing is sent anywhere; what isn't recognised is shown
// as such, never guessed.

import { fold, type Catalogs } from "./catalog";
import type { Qualifier, Substances, TobaccoStatus, DrugCode } from "./history";

export interface QuickCondition {
  id: string;
  label: string;
  qualifiers: Qualifier[];
  /** The words it was recognised from. */
  from: string;
}

export interface QuickTreatment {
  atc: string;
  name: string;
  dailyDoseMg?: number;
  from: string;
}

export interface QuickAllergy {
  allergenId?: string;
  label: string;
  from: string;
}

export interface QuickEntryResult {
  conditions: QuickCondition[];
  treatments: QuickTreatment[];
  allergies: QuickAllergy[];
  substances: Partial<Substances>;
  /** Pieces nothing matched — offered as free-text antecedents. */
  unknown: string[];
}

const words = (t: string) => fold(t).split(/[^a-z0-9]+/).filter(Boolean);

/** Does `phrase` (folded words) appear in `text` words, as whole words? */
function containsPhrase(textWords: string[], phrase: string[]): boolean {
  if (phrase.length === 0) return false;
  for (let i = 0; i + phrase.length <= textWords.length; i++) {
    if (phrase.every((w, j) => textWords[i + j] === w || (w.length >= 5 && textWords[i + j].startsWith(w)))) return true;
  }
  return false;
}

/** Short keywords (IC, EP, ID…) are too ambiguous in running text unless written in capitals. */
function keywordMatches(segment: string, segWords: string[], keyword: string): boolean {
  const kw = words(keyword);
  if (kw.length === 0) return false;
  if (kw.join("").length <= 3) return new RegExp(`(^|[^A-Za-z])${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z]|$)`).test(segment) && keyword === keyword.toUpperCase();
  return containsPhrase(segWords, kw);
}

const QUALIFIER_WORDS: [Qualifier, RegExp][] = [
  ["poorlyControlled", /mal (contr|equilibr)|desequilibr|non contr|instable|non appareill/],
  ["severe", /severe|serre|terminal|decompens|grave/],
  ["recent", /recent|il y a (\d|un|une|deux|trois) (sem|jour|mois)/],
];

function splitSegments(text: string): string[] {
  return text
    .split(/[\n;,]+|\s+(?:et|\+)\s+|\.\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseQuickEntry(text: string, catalogs: Pick<Catalogs, "conditions" | "medications" | "allergens">): QuickEntryResult {
  const result: QuickEntryResult = { conditions: [], treatments: [], allergies: [], substances: {}, unknown: [] };
  const all = fold(text);

  // --- Substance use (whole text) ---------------------------------------------------
  let tobacco: TobaccoStatus | undefined;
  if (/(ancien|ex)[- ]?fumeu|sevre du tabac|arret du tabac|a arrete de fumer/.test(all)) tobacco = "former";
  else if (/non[- ]?fumeu|ne fume pas|jamais fume/.test(all)) tobacco = "never";
  else if (/\bfumeu|\btabac\b|\bfume\b|\bcigarette/.test(all)) tobacco = "current";
  if (tobacco) result.substances.tobacco = tobacco;
  const pa = all.match(/(\d+(?:[.,]\d+)?)\s*(?:pa\b|paquets?[- ]?ann)/);
  if (pa) result.substances.packYears = Number(pa[1].replace(",", "."));
  const alcohol = all.match(/(\d+(?:[.,]\d+)?)\s*(?:u\b|unites?|verres?|bieres?|verres? de vin)\s*(?:\/|par\s+)?\s*(j\b|jour|sem|semaine)/);
  if (alcohol) result.substances.alcoholUnitsPerWeek = Number(alcohol[1].replace(",", ".")) * (alcohol[2].startsWith("j") ? 7 : 1);
  if (/ethylisme|alcoolisme|dependance (a l')?alcool|sevrage alcool/.test(all)) result.substances.alcoholDependence = true;
  const drugs: DrugCode[] = [];
  if (/cannabis|joint|marijuana|thc\b/.test(all)) drugs.push("cannabis");
  if (/cocaine|coke\b/.test(all)) drugs.push("cocaine");
  if (/heroine|methadone|subutex|suboxone/.test(all)) drugs.push("opioids");
  if (/amphetamine|mdma|ecstasy|speed\b/.test(all)) drugs.push("amphetamines");
  if (drugs.length) result.substances.drugs = drugs;
  const aboutSubstances = (seg: string) => /fum|tabac|cigarette|paquet|alcool|biere|verre|vin\b|cannabis|joint|cocaine|heroine|drogue|ethyl/.test(fold(seg));

  // --- Segment by segment -------------------------------------------------------------
  let allergyContext = false;
  for (const segment of splitSegments(text)) {
    const f = fold(segment);
    const segWords = words(segment);
    let matched = false;

    // Allergies: "allergie à la pénicilline", "allergique au latex", "AL : …",
    // and the continuation "… et au latex" split off by the "et".
    const continuation: RegExpMatchArray | null = allergyContext ? f.match(/^(?:a|au|aux|a la|a l')\s+(.*)$/) : null;
    const allergyMatch: RegExpMatchArray | null = continuation ?? f.match(/^(?:allergi(?:e|es|que)s?|al)\s*(?::|a|au|aux|a la|a l')?\s*(.*)$/) ?? f.match(/allergi(?:e|es|que)s?\s+(?:a|au|aux|a la|a l')?\s*(.*)$/);
    allergyContext = !!allergyMatch;
    if (allergyMatch) {
      const rest = allergyMatch[1].trim();
      const restWords = words(rest);
      const found = catalogs.allergens.filter((a) => [a.label, ...a.keywords].some((k) => fold(k).length >= 3 && containsPhrase(restWords, words(k))));
      for (const a of found) if (!result.allergies.some((x) => x.allergenId === a.id)) result.allergies.push({ allergenId: a.id, label: a.label, from: segment });
      if (!found.length && rest) result.allergies.push({ label: segment.replace(/^.*?allergi\w*\s*(?:à|au|aux|à la|à l')?\s*/i, "").replace(/^(?:à|au|aux|à la|à l')\s+/i, "").trim() || rest, from: segment });
      if (/aucune|pas d/.test(rest)) result.allergies = [];
      continue;
    }

    // Treatments: catalogue names and brands, with a dose if written next to them ("metformine 850 mg").
    for (const m of catalogs.medications) {
      const names = [m.name, ...(m.brands ?? [])].filter((n) => fold(n).length >= 4);
      const hit = names.find((n) => containsPhrase(segWords, words(n)));
      if (!hit || result.treatments.some((t) => t.atc === m.atc)) continue;
      const dose = f.match(new RegExp(`${words(hit)[0]}\\w*\\s+(\\d+(?:[.,]\\d+)?)\\s*(mg|g)\\b`));
      let dailyDoseMg: number | undefined;
      if (dose) {
        dailyDoseMg = Number(dose[1].replace(",", ".")) * (dose[2] === "g" ? 1000 : 1);
        const times = f.match(/(\d)\s*(?:x|fois)\s*(?:\/|par)?\s*(?:j|jour)/);
        if (times) dailyDoseMg *= Number(times[1]);
      }
      result.treatments.push({ atc: m.atc, name: m.name, dailyDoseMg, from: segment });
      matched = true;
    }

    // Antecedents: catalogue labels and synonyms, with their qualifiers.
    for (const c of catalogs.conditions) {
      const hit = [c.label, ...(c.keywords ?? [])].find((k) => keywordMatches(segment, segWords, k));
      if (!hit || result.conditions.some((x) => x.id === c.id)) continue;
      const qualifiers = QUALIFIER_WORDS.filter(([q, re]) => c.qualifiers?.[q] !== undefined && re.test(f)).map(([q]) => q);
      result.conditions.push({ id: c.id, label: c.label, qualifiers, from: segment });
      matched = true;
    }

    if (!matched && !aboutSubstances(segment) && segment.length > 1) result.unknown.push(segment);
  }

  // "Diabète insulinotraité" also reads as "diabète": keep the more specific one.
  if (result.conditions.some((c) => c.id === "diabetes_insulin")) result.conditions = result.conditions.filter((c) => c.id !== "diabetes_oral");

  // A treatment recognised as a brand also named as an antecedent keyword (e.g. "insuline") keeps both: that's intended.
  return result;
}

export function isEmptyQuickEntry(r: QuickEntryResult): boolean {
  return !r.conditions.length && !r.treatments.length && !r.allergies.length && !Object.keys(r.substances).length && !r.unknown.length;
}

export interface QuickSelection {
  conditions: string[];
  treatments: string[];
  allergies: number[];
  substances: boolean;
  unknownToHistory: boolean;
}

export function selectAll(r: QuickEntryResult): QuickSelection {
  return { conditions: r.conditions.map((c) => c.id), treatments: r.treatments.map((t) => t.atc), allergies: r.allergies.map((_, i) => i), substances: true, unknownToHistory: true };
}

/** Adds what was recognised (and kept) to the consultation — never removes anything. */
export function applyQuickEntry<C extends {
  conditions: Record<string, { present: boolean } & Partial<Record<Qualifier, boolean>> | undefined>;
  treatments: { id: string; atc: string; name: string; dailyDoseMg?: number }[];
  substances: Substances;
  patient: { allergyList?: { allergenId?: string; label: string }[]; noKnownAllergy?: boolean; history?: string };
}>(c: C, r: QuickEntryResult, sel: QuickSelection = selectAll(r)): C {
  const conditions = { ...c.conditions };
  for (const q of r.conditions.filter((x) => sel.conditions.includes(x.id))) {
    conditions[q.id] = { ...conditions[q.id], present: true, ...Object.fromEntries(q.qualifiers.map((k) => [k, true])) };
  }
  const treatments = [...c.treatments];
  for (const t of r.treatments.filter((x) => sel.treatments.includes(x.atc))) {
    if (!treatments.some((x) => x.atc === t.atc)) treatments.push({ id: crypto.randomUUID(), atc: t.atc, name: t.name, dailyDoseMg: t.dailyDoseMg });
  }
  const allergyList = [...(c.patient.allergyList ?? [])];
  r.allergies.forEach((a, i) => {
    if (!sel.allergies.includes(i)) return;
    if (!allergyList.some((x) => (a.allergenId && x.allergenId === a.allergenId) || fold(x.label) === fold(a.label))) allergyList.push({ allergenId: a.allergenId, label: a.label });
  });
  const unknown = sel.unknownToHistory ? r.unknown : [];
  return {
    ...c,
    conditions,
    treatments,
    substances: sel.substances ? { ...c.substances, ...r.substances } : c.substances,
    patient: {
      ...c.patient,
      allergyList,
      noKnownAllergy: allergyList.length ? false : c.patient.noKnownAllergy,
      history: unknown.length ? [c.patient.history, ...unknown].filter(Boolean).join(" ; ") : c.patient.history,
    },
  };
}
