// Turns an answer pasted from an AI search tool (Consensus, OpenEvidence…)
// into candidate rules — no AI on PreOx's side: the question imposes a
// block format (RÈGLE / CONDITIONS / SOURCE / PMID / DOI / CITATION /
// NIVEAU), parsed here. Lessons from the first real test with Consensus:
//
// - text around the blocks (summary, tables, key points) is ignored;
// - the bibliography under the answer comes from the tool's database and
//   is more reliable than the identifiers the model re-typed inside the
//   blocks: each block's DOI is checked against it, and disagreements are
//   flagged (3 references out of 5 disagreed in that test);
// - the source level is decided by PreOx from the organisation's name,
//   never taken from the answer.

import type { SourceLevel } from "./types";

export interface ParsedReference {
  raw: string;
  firstAuthor: string;
  year: number | null;
  doi: string;
  title: string;
}

export type BlockCheck =
  | { kind: "doi_matches_reference" }
  | { kind: "doi_mismatch"; blockDoi: string; referenceDoi: string }
  | { kind: "not_in_references" }
  | { kind: "no_identifier" }
  | { kind: "quote_missing" };

export interface ParsedBlock {
  statement: string;
  conditions: string;
  source: string;
  pmid: string;
  doi: string;
  quote: string;
  grade: string;
  /** Source level decided from the organisation named in SOURCE. */
  level: SourceLevel;
  organisation: string;
  year: number | null;
  /** The bibliography entry this block refers to, if found. */
  reference: ParsedReference | null;
  checks: BlockCheck[];
  /** Suggested use: a rule (actionable) or an explanation attached to one. */
  suggestedUse: "rule" | "explanation";
}

export interface ParsedAnswer {
  blocks: ParsedBlock[];
  references: ParsedReference[];
}

const FIELDS: Record<string, keyof Pick<ParsedBlock, "statement" | "conditions" | "source" | "pmid" | "doi" | "quote" | "grade">> = {
  REGLE: "statement",
  RULE: "statement",
  CONDITIONS: "conditions",
  CONDITION: "conditions",
  SOURCE: "source",
  PMID: "pmid",
  DOI: "doi",
  ID: "doi",
  CITATION: "quote",
  QUOTE: "quote",
  NIVEAU: "grade",
  LEVEL: "grade",
  GRADE: "grade",
};

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

const DOI_RE = /10\.\d{4,9}\/[^\s"<>)\]]+/i;

export function normalizeDoi(raw: string): string {
  const m = raw.match(DOI_RE);
  return m ? m[0].replace(/[.,;]+$/, "").toLowerCase() : "";
}

function cleanValue(v: string): string {
  const s = v.replace(/\*\*/g, "").trim();
  return /^(aucun|aucune|none|n\/a|-|non précisé|non precise|not stated)$/i.test(s) ? "" : s;
}

/** Organisation → level. Belgian institutions first; anything unrecognised is treated as an article. */
const LEVEL_PATTERNS: { level: SourceLevel; pattern: RegExp }[] = [
  { level: "be_inst", pattern: /\bKCE\b|Centre f[ée]d[ée]ral d'expertise|Conseil Sup[ée]rieur de la Sant[ée]|\bCSS\b|\bHGR\b|\bCBIP\b|\bBCFI\b|\bAFMPS\b|\bFAMHP\b|\bINAMI\b|\bRIZIV\b/i },
  { level: "be_soc", pattern: /\bSARB\b|\bBARA\b|Belgian (Society|Association)|Soci[ée]t[ée] belge/i },
  { level: "eu", pattern: /\bESAIC\b|\bESA\b|\bESRA\b|\bESC\b|\bEHRA\b|\bERC\b|\bESPEN\b|\bESICM\b|\bPROSPECT\b|\bESH\b|European Society/i },
  { level: "int", pattern: /\bSFAR\b|\bGIHP\b|\bASRA\b|\bASA\b|\bDAS\b|\bAAGBI\b|Association of Anaesthetists|\bNICE\b|\bACC\b|\bAHA\b|\bCHEST\b|\bACCP\b|\bSIAARTI\b|\bDGAI\b|Society|Soci[ée]t[ée]|Guidelines?|Recommandations?/i },
];

export function detectLevel(source: string): SourceLevel {
  for (const { level, pattern } of LEVEL_PATTERNS) if (pattern.test(source)) return level;
  return "article";
}

function firstYear(s: string): number | null {
  const m = s.match(/\b(19[5-9]\d|20[0-4]\d)\b/g);
  return m ? Number(m[m.length - 1]) : null;
}

/** Bibliography entries: lines (or paragraphs) with a DOI after a "References"/"Références" heading, or anywhere once the blocks end. */
export function parseReferences(text: string): ParsedReference[] {
  const heading = text.search(/^#*\s*(r[ée]f[ée]rences|bibliograph)/im);
  const part = heading >= 0 ? text.slice(heading) : "";
  const entries = part
    .split(/\n\s*\n|\n(?=\S)/)
    .map((e) => e.trim())
    .filter((e) => DOI_RE.test(e));
  return entries.map((raw) => {
    const firstAuthor = raw.match(/^[\s*-]*([A-ZÀ-Ý][\p{L}'’ -]+?),/u)?.[1]?.trim() ?? "";
    const year = raw.match(/\((\d{4})\)/)?.[1];
    const title = raw.match(/\(\d{4}\)\.\s*([^.]+(?:\.[^.*]+)?)/)?.[1]?.trim() ?? "";
    return { raw, firstAuthor, year: year ? Number(year) : null, doi: normalizeDoi(raw), title };
  });
}

function findReference(block: Pick<ParsedBlock, "doi" | "source" | "year">, references: ParsedReference[]): ParsedReference | null {
  if (block.doi) {
    const exact = references.find((r) => r.doi === block.doi);
    if (exact) return exact;
  }
  // By first author named in the SOURCE line, or by year + a word of the title.
  const src = fold(block.source);
  const byAuthor = references.filter((r) => r.firstAuthor && src.includes(fold(r.firstAuthor)));
  if (byAuthor.length === 1) return byAuthor[0];
  if (block.year) {
    const byYear = references.filter((r) => r.year === block.year || r.year === block.year! + 1 || r.year === block.year! + 2);
    const byTitle = byYear.filter((r) => {
      const words = fold(r.title)
        .split(/[^A-Z0-9]+/)
        .filter((w) => w.length > 5);
      return words.filter((w) => src.includes(w)).length >= 2;
    });
    if (byTitle.length === 1) return byTitle[0];
  }
  return null;
}

export function parseAnswer(text: string): ParsedAnswer {
  const references = parseReferences(text);
  const body = (() => {
    const heading = text.search(/^#*\s*(r[ée]f[ée]rences|bibliograph)/im);
    return heading >= 0 ? text.slice(0, heading) : text;
  })();

  const blocks: ParsedBlock[] = [];
  let current: Record<string, string> | null = null;
  // After a blank line, a plain paragraph is prose around the blocks, not the continuation of a value.
  let afterBlank = false;
  const flush = () => {
    if (current && (current.statement ?? "").trim()) {
      const source = cleanValue(current.source ?? "");
      const doi = normalizeDoi(current.doi ?? "");
      const year = firstYear(source);
      const partial = { doi, source, year };
      const reference = findReference(partial, references);
      const checks: BlockCheck[] = [];
      if (reference && doi && reference.doi && reference.doi !== doi) checks.push({ kind: "doi_mismatch", blockDoi: doi, referenceDoi: reference.doi });
      else if (reference) checks.push({ kind: "doi_matches_reference" });
      else if (references.length > 0) checks.push({ kind: "not_in_references" });
      if (!doi && !cleanValue(current.pmid ?? "")) checks.push({ kind: "no_identifier" });
      const quote = cleanValue(current.quote ?? "");
      if (!quote) checks.push({ kind: "quote_missing" });
      const level = detectLevel(source);
      const statement = cleanValue(current.statement ?? "");
      blocks.push({
        statement,
        conditions: cleanValue(current.conditions ?? ""),
        source,
        pmid: (cleanValue(current.pmid ?? "").match(/\d{5,9}/) ?? [""])[0],
        doi,
        quote,
        grade: cleanValue(current.grade ?? ""),
        level,
        organisation: source.split(/[,;]/)[0]?.trim() ?? "",
        year,
        reference,
        checks,
        // An article, or a sentence without anything to do (no delay, no dose, no "must"), explains rather than prescribes.
        suggestedUse: level === "article" || !/\d+\s*(h\b|heures?|jours?|mg|ml|%)|\b(doit|doivent|ne pas|contre-indiqu|arr[êe]t|reprendre|observer|requis|recommand)/i.test(statement) ? "explanation" : "rule",
      });
    }
    current = null;
  };

  for (const rawLine of body.split("\n")) {
    const line = rawLine.replace(/^\s*[-*•>]+\s*/, "").replace(/\*\*/g, "");
    if (!line.trim()) {
      afterBlank = true;
      continue;
    }
    const m = line.match(/^\s*([A-Za-zÀ-ÿ]+)\s*:\s*(.*)$/);
    const field = m ? FIELDS[fold(m[1])] : undefined;
    if (m && field) {
      if (field === "statement") {
        flush();
        current = {};
      }
      if (current) current[field] = m[2];
    } else if (current && !afterBlank && !/^#/.test(line) && !line.includes("|")) {
      // A value continued on the next line (long quote, wrapped condition).
      const keys = Object.keys(current);
      const last = keys[keys.length - 1];
      if (last) current[last] = `${current[last]} ${line.trim()}`;
    } else if (current) {
      flush();
    }
    afterBlank = false;
  }
  flush();
  return { blocks, references };
}
