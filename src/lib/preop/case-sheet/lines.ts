// Every line of a consultation goes somewhere on the sheet, in its own
// words: an antecedent, a treatment, an allergy, a habit (« tabagisme très
// ancien, sevré depuis 20 ans »), a note — or nowhere because it is only an
// examination or a value already read. A line under a heading goes where
// its heading says; a line with none (a dictation, an emergency or surgical
// consultation added to the patient) is sorted by what the dictation reader
// recognises in it, and when it recognises nothing it goes to the notes as
// it is (to be moved from the sheet if need be) rather than dropped.

import type { Catalogs } from "../catalog";
import { parseQuickEntry, type QuickEntryResult } from "../quick-entry";
import type { ItemSection } from "./build";

export type LineKind = "atcd" | "ttt" | "allergy" | "habit" | "note" | "info" | "ignore";

/** What a line can be made. */
export const LINE_KINDS: { code: LineKind; label: string }[] = [
  { code: "atcd", label: "Antécédent" },
  { code: "ttt", label: "Traitement" },
  { code: "allergy", label: "Allergie" },
  { code: "habit", label: "Habitus" },
  { code: "note", label: "Note" },
  { code: "ignore", label: "Ignorer" },
];

/** « - HTA », « • HTA » → « HTA ». */
export const cleanLine = (t: string) =>
  t
    .replace(/^[\s\-–—•·*▪◦>]+/, "")
    .replace(/\s+/g, " ")
    .trim();

const HEADING: Partial<Record<LineKind, string>> = { atcd: "Antécédents", ttt: "Traitement", allergy: "Allergies", habit: "Mode de vie" };

// One reading per line and catalogue: the sheet is rebuilt at every change (and plan B again).
const cache = new WeakMap<object, Map<string, QuickEntryResult>>();

/** The dictation reader on one line, under the heading of the section it was in (if any). */
export function readLine(line: string, catalogs: Pick<Catalogs, "conditions" | "medications" | "allergens"> & Partial<Pick<Catalogs, "surgeries">>, section?: LineKind): QuickEntryResult {
  let byText = cache.get(catalogs);
  if (!byText) cache.set(catalogs, (byText = new Map()));
  const key = `${section ?? ""}\u0001${line}`;
  let r = byText.get(key);
  if (!r) {
    const head = section && HEADING[section];
    r = parseQuickEntry(head ? `${head} :\n${line}` : line, catalogs);
    byText.set(key, r);
  }
  return r;
}

/** Tobacco, alcohol, drugs — also without an amount (« tabagisme très ancien »). */
const HABIT = /\b(tabac|tabagi\w*|fum(eur|euse|e|ait)|cigarettes?|cig\/j|paquets?[- ]ann[ée]es?|\d+\s*pa\b|sevr[ée]e?|alcool\w*|[ée]thylisme|oh\b|bi[eè]res?|vin\b|cannabis|joints?|coca[iï]ne|drogues?|toxicomanie|stup[ée]fiants?|vapot\w*|cigarette [ée]lectronique)/i;

const EMPTY = /^(\/+|-+|r\.?a\.?s\.?|neant|aucun(e)?s?|non|nc|0|sans particularit[ée]s?)$/i;

/** Where a line under a heading goes: its heading's place — but tobacco or alcohol listed with the antecedents are habits. */
export function sectionKind(section: LineKind, text: string, q: QuickEntryResult): LineKind {
  if (section === "atcd" && !q.conditions.length && HABIT.test(text)) return "habit";
  return section;
}

/**
 * Where a line with no heading goes, from what is recognised in it; null:
 * nothing recognised — a note.
 */
export function autoKind(text: string, q: QuickEntryResult): LineKind | null {
  if (EMPTY.test(text)) return "ignore";
  if (q.allergies.length || /\ballergi/i.test(text)) return "allergy";
  if (q.conditions.length || q.surgicalHistory.length) return "atcd";
  if (q.treatments.length || q.freeTreatments.length) return "ttt";
  if (Object.keys(q.substances).length || HABIT.test(text)) return "habit";
  // Measured values, an examination finding, a score: already read, nothing to print.
  if (q.values.length || Object.keys(q.exam).length || q.asa || q.mallampati || q.negated.length) return "info";
  return null;
}

/** A dictation cut into its sentences: « HTA. Sous metformine ; allergie latex » → three lines. */
export const splitDictation = (text: string): string[] =>
  text
    .split(/\n+|(?<=[a-zà-ÿA-ZÀ-Ý)%])\.\s+|\s*;\s*/)
    .map((s) => cleanLine(s.replace(/\.$/, "")))
    .filter(Boolean);

/** « alerte : … », « ! … », « ttt : … »: the section said first, before the line. */
const PREFIX: [RegExp, ItemSection][] = [
  [/^(?:(?:alerte|attention)\b|!+)\s*[:\-–]?\s*/i, "alert"],
  [/^notes?\s*[:\-–]\s*/i, "note"],
  [/^(?:atcd|ant[ée]c[ée]dents?)\s*[:\-–]\s*/i, "atcd"],
  [/^(?:ttt|traitements?)\s*[:\-–]\s*/i, "ttt"],
  [/^allergies?\s*[:\-–]\s*/i, "allergy"],
  [/^habitus\s*[:\-–]\s*/i, "habit"],
  [/^chir(?:urgie|\.)?\s*[:\-–]\s*/i, "chir"],
];

/**
 * Where a line typed on the sheet goes: the section said before it, else
 * what is recognised in it (an operation alone: the surgical history), else
 * a note — typed on purpose, it is never left out.
 */
export function addedSection(line: string, catalogs: Parameters<typeof readLine>[1]): { section: ItemSection; text: string } {
  const text = cleanLine(line);
  for (const [re, section] of PREFIX) if (re.test(text)) return { section, text: cleanLine(text.replace(re, "")) };
  const q = readLine(text, catalogs);
  if (q.surgicalHistory.length && !q.conditions.length && !q.treatments.length && !q.allergies.length) return { section: "chir", text };
  const kind = autoKind(text, q);
  return { section: kind && kind !== "info" && kind !== "ignore" ? kind : "note", text };
}
