// The question to paste into an AI search tool when no rule covers a
// situation. English for the search (most sources are in English), French
// for the answer, and a strict block format that parse-answer.ts reads.
// Tested with Consensus: the format was followed, identifiers were not
// always right — hence the checks on the way back.
import type { Condition, Technique } from "./types";

export interface QuestionInput {
  /** The clinical question itself, in plain words (French or English). */
  question: string;
  /** Extra context: patient (never identifying), surgery, gesture. */
  context?: string;
  /** Conditions the rule built from the answer must carry (the treatment or antecedent asked about). */
  preset?: Condition[];
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

export interface CaseContext {
  surgery?: string;
  grade?: string;
  bleedingRisk?: string;
  techniques?: Technique[];
  crcl?: number;
}

function gestures(techniques: Technique[] | undefined): string {
  return techniques?.length ? techniques.map((t) => TECHNIQUE_EN[t]).join(" and ") : "anaesthesia";
}

function caseBits(c: CaseContext): string {
  return [
    c.surgery ? `surgery: ${c.surgery}` : "",
    c.grade ? `surgical grade: ${c.grade}` : "",
    c.bleedingRisk ? `bleeding risk of the procedure: ${c.bleedingRisk}` : "",
    c.crcl ? `creatinine clearance about ${Math.round(c.crcl)} mL/min` : "",
    "elective procedure",
  ]
    .filter(Boolean)
    .join(", ");
}

/** A treatment no rule speaks about: continue, stop (when), bridge, resume. */
export function questionForTreatment(p: { drug: string; atc?: string; dailyDoseMg?: number; indication?: string } & CaseContext): QuestionInput {
  const dose = p.dailyDoseMg ? ` ${p.dailyDoseMg} mg daily` : "";
  return {
    question: `How should ${p.drug}${dose}${p.indication ? ` (taken for ${p.indication})` : ""} be managed around surgery under ${gestures(p.techniques)}: continue or stop, and if stopped, how long before (last dose)? Is bridging needed? When can it be resumed?`,
    context: caseBits(p),
    preset: p.atc ? [{ kind: "drug", atc: p.atc }] : undefined,
  };
}

/** An antecedent whose perioperative management should come from a rule. */
export function questionForCondition(p: { condition: string; id?: string; label?: string } & CaseContext): QuestionInput {
  return {
    question: `What is the recommended perioperative management of a patient with ${p.condition} undergoing surgery under ${gestures(p.techniques)}: preoperative assessment and optimisation, specific precautions, monitoring, and postoperative care?`,
    context: caseBits(p),
    preset: p.id ? [{ kind: "history", condition: p.id, present: true, label: p.label }] : undefined,
  };
}

/** A reported allergy whose consequences (alternative product, testing, delabelling) should come from a rule. */
export function questionForAllergy(p: { allergen: string; id?: string; label?: string; reaction?: string; penFast?: { value: number; low: boolean } } & CaseContext): QuestionInput {
  const pf = p.penFast ? `; PEN-FAST score ${p.penFast.value}/5 (${p.penFast.low ? "low risk of true allergy" : "true allergy possible"})` : "";
  return {
    question: `In a patient reporting an allergy to ${p.allergen}${p.reaction ? ` (reported reaction: ${p.reaction})` : ""}${pf}, how should it be managed around surgery under ${gestures(p.techniques)}: which agents to avoid, which alternatives (including antibiotic prophylaxis and antisepsis when relevant), whether cross-reactivity matters, and whether allergy testing, direct challenge or referral is recommended before elective surgery?`,
    context: caseBits(p),
    preset: p.id ? [{ kind: "allergy", allergen: p.id, present: true, label: p.label }] : undefined,
  };
}

/** Several questions in one prompt: the answer format allows several blocks, read in one go. */
export function combineQuestions(questions: QuestionInput[]): QuestionInput {
  if (questions.length === 1) return questions[0];
  const contexts = [...new Set(questions.map((q) => q.context).filter(Boolean))];
  return {
    question: questions.map((q, i) => `${i + 1}) ${q.question}`).join("\n"),
    context: contexts.join("; "),
  };
}
