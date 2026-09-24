// The question to paste into an AI search tool when no rule covers a
// situation. English for the search (most sources are in English), French
// for the answer, and a strict block format that parse-answer.ts reads.
// Tested with Consensus: the format was followed, identifiers were not
// always right — hence the checks on the way back.
import type { Technique } from "./types";

export interface QuestionInput {
  /** The clinical question itself, in plain words (French or English). */
  question: string;
  /** Extra context: patient (never identifying), surgery, gesture. */
  context?: string;
}

export const ANSWER_FORMAT = `RÈGLE: one sentence, actionable
CONDITIONS: when it applies (dose, renal function, indication, type of procedure)
SOURCE: organisation, title, year
PMID: number, or "aucun"
DOI: identifier, or "aucun"
CITATION: exact sentence copied from the source
NIVEAU: grade or level of evidence if stated, otherwise "non précisé"`;

export function buildQuestion({ question, context }: QuestionInput): string {
  return [
    `Question: ${question.trim()}`,
    "",
    `Context: anaesthesiologist practising in Belgium${context?.trim() ? `; ${context.trim()}` : ""}.`,
    "",
    "Source priority: 1) Belgian guidance (KCE, Superior Health Council, BCFI/CBIP, SARB, BARA); 2) European guidelines (ESAIC, ESRA, ESC, EHRA, ERC); 3) other societies (ASRA, SFAR, GIHP). Prefer official guidelines and consensus statements over individual studies. State explicitly when sources disagree.",
    "",
    "Answer in French. For each recommendation, use exactly this format and nothing else between blocks:",
    "",
    ANSWER_FORMAT,
  ].join("\n");
}

const TECHNIQUE_EN: Record<Technique, string> = {
  neuraxial: "a neuraxial procedure (spinal or epidural anaesthesia, catheter)",
  deep_block: "a deep or non-compressible peripheral nerve block",
  superficial_block: "a superficial, compressible peripheral nerve block",
  general: "general anaesthesia",
  sedation: "procedural sedation",
};

/** Pre-filled question for a missing "stop before" rule. */
export function questionForMissingStop(p: { drug: string; dailyDoseMg?: number; technique: Technique | null; crcl?: number; indication?: string }): QuestionInput {
  const dose = p.dailyDoseMg ? ` ${p.dailyDoseMg} mg daily` : "";
  const gesture = p.technique ? TECHNIQUE_EN[p.technique] : "elective surgery";
  const bits = [p.indication ? `indication: ${p.indication}` : "", p.crcl ? `creatinine clearance about ${Math.round(p.crcl)} mL/min` : "", "elective procedure"].filter(Boolean);
  return {
    question: `What is the minimum time interval between the last dose of ${p.drug}${dose} and ${gesture}, and when can it be resumed afterwards?`,
    context: bits.join(", "),
  };
}

export const SEARCH_TOOLS = [
  { name: "Consensus", url: "https://consensus.app/" },
  { name: "OpenEvidence", url: "https://www.openevidence.com/" },
  { name: "Perplexity", url: "https://www.perplexity.ai/" },
];
