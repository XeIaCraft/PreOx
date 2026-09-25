// Free entry: anything typed, dictated or pasted — a dictated sentence
// (« HTA, diabète sous metformine 850 mg 2x/j, allergie pénicilline »), a
// previous consultation, a discharge letter, a referral. The text is read
// section by section when it has headings (« Antécédents : », « Traitement : »,
// « Biologie : »…), negations are honoured (« pas de diabète »), family
// history is set aside, and values are picked up wherever they are (PA, FC,
// SpO₂, poids, taille, Hb, plaquettes, INR, créatinine, HbA1c, ASA,
// Mallampati). Local and deterministic: nothing is sent anywhere, nothing
// is guessed — what isn't recognised is shown as such.

import { fold, type Catalogs } from "./catalog";
import type { Qualifier, Substances, TobaccoStatus, DrugCode } from "./history";
import type { ClinicalExam, ConsultationPatient, ConsultationState } from "./dossier";
import { CREATININE_UMOL_PER_MG_DL } from "./scores";

export interface QuickCondition {
  id: string;
  label: string;
  qualifiers: Qualifier[];
  /** Structured details read in the text (« GOLD 3 », « FA paroxystique », « sévère »). */
  details?: Record<string, string>;
  /** The words it was recognised from. */
  from: string;
}

export interface QuickTreatment {
  /** Catalogue id (CBIP products have no ATC code). */
  id: string;
  atc: string;
  name: string;
  components?: string[];
  dailyDoseMg?: number;
  from: string;
}

export interface QuickAllergy {
  allergenId?: string;
  label: string;
  reaction?: string;
  from: string;
}

/** A value picked from the text: « PA 145/85 » gives two. */
export interface QuickValue {
  key:
    | "age"
    | "weightKg"
    | "heightCm"
    | "sbp"
    | "dbp"
    | "hr"
    | "spo2"
    | "hb"
    | "platelets"
    | "inr"
    | "creatinineMgDl"
    | "hba1c"
    | "potassium"
    | "sodium"
    | "glucose"
    | "albumin"
    | "ntprobnp"
    | "troponin"
    | "ferritin";
  value: number;
  label: string;
}

export interface QuickEntryResult {
  conditions: QuickCondition[];
  /** Antecedents explicitly absent (« pas de diabète »). */
  negated: QuickCondition[];
  treatments: QuickTreatment[];
  /** Lines of a treatment section with no catalogue match — kept as free-text treatments. */
  freeTreatments: string[];
  allergies: QuickAllergy[];
  noKnownAllergy?: boolean;
  substances: Partial<Substances>;
  values: QuickValue[];
  sex?: "M" | "F";
  exam: ClinicalExam;
  asa?: number;
  mallampati?: 1 | 2 | 3 | 4;
  surgery?: { id: string; name: string; side?: string; plannedAt?: string; from: string };
  /** Past operations and anaesthesias (a surgical-history section, or a known procedure with a year). */
  surgicalHistory: string[];
  /** Lines of an antecedents section nothing matched — to « Autres antécédents ». */
  history: string[];
  /** Pieces nothing matched outside any section. */
  unknown: string[];
  /** Family history, set aside. */
  ignored: string[];
  /** Pasted document (sections, long text) rather than a dictated sentence. */
  document: boolean;
}

type Section = "none" | "history" | "surgical" | "family" | "treatment" | "allergy" | "habits" | "exam" | "biology" | "surgery" | "conclusion" | "other";

const SECTION_WORDS: [Section, RegExp][] = [
  ["family", /^(antecedents?|atcd?s?)\s+familiaux|^familia(l|ux)/],
  ["surgical", /^(antecedents?|atcd?s?)\s+(chirurgicaux|chir|operatoires|anesthesiques)|^chirurgi(e|caux)\s+anterieure|^interventions?\s+anterieures?|^anesthesies?\s+anterieures?/],
  ["history", /^(antecedents?|atcd?s?|ant\.?)(\s+medicaux|\s+personnels)?$|^(antecedents?|atcd?s?)\s+medicaux|^comorbidites|^pathologies|^probleme(s)? medica/],
  ["treatment", /^(traitements?|ttt|tt|medications?|medicaments?)(\s+(habituels?|actuels?|a domicile|en cours|chronique))?$/],
  ["allergy", /^allergies?$|^al$|^intolerances?$/],
  ["habits", /^(habitudes|assuetudes|intoxications?|mode de vie|toxiques)$/],
  ["exam", /^(examen(\s+clinique|\s+physique)?|ec|clinique|parametres|constantes|signes vitaux|voies aeriennes)$/],
  ["biology", /^(biologie|bio|labo(ratoire)?|analyses?|bilan(\s+sanguin|\s+biologique)?)$/],
  ["surgery", /^(intervention(\s+prevue|\s+programmee)?|chirurgie(\s+prevue|\s+programmee)?|indication|motif(\s+de\s+(la\s+)?consultation)?|objet|acte(\s+prevu)?|operation(\s+prevue)?)$/],
  ["conclusion", /^(conclusion|synthese|evaluation|avis|proposition|anesthesie(\s+proposee|\s+prevue)?|plan)$/],
];

/** « Antécédents : HTA » → section + rest of the line; a heading alone on its line too. */
function readHeading(line: string): { section: Section; rest: string } | null {
  const m = line.match(/^\s*[-•*#]*\s*([A-Za-zÀ-ÿ .'’/]{2,45}?)\s*[:：]\s*(.*)$/);
  const head = m ? m[1] : /^[A-Za-zÀ-ÿ .'’/]{2,45}$/.test(line.trim()) ? line.trim() : null;
  if (!head) return null;
  const h = fold(head).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  for (const [section, re] of SECTION_WORDS) if (re.test(h)) return { section, rest: m ? m[2] : "" };
  return null;
}

const words = (t: string) => fold(t).split(/[^a-z0-9]+/).filter(Boolean);

/** Does `phrase` (folded words) appear in `text` words, as whole words? Returns the index of the first word, or -1. */
function phraseAt(textWords: string[], phrase: string[]): number {
  if (phrase.length === 0) return -1;
  for (let i = 0; i + phrase.length <= textWords.length; i++) {
    if (phrase.every((w, j) => textWords[i + j] === w || (w.length >= 5 && textWords[i + j].startsWith(w)))) return i;
  }
  return -1;
}
const containsPhrase = (t: string[], p: string[]) => phraseAt(t, p) >= 0;

/** Short keywords (IC, EP, ID…) are too ambiguous in running text unless written in capitals. */
function keywordAt(segment: string, segWords: string[], keyword: string): number {
  const kw = words(keyword);
  if (kw.length === 0) return -1;
  if (kw.join("").length <= 3) {
    if (keyword !== keyword.toUpperCase()) return -1;
    const m = new RegExp(`(^|[^A-Za-z])${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z]|$)`).exec(segment);
    // « PR 210 ms », « QRS 120 » : a measurement, not the abbreviation of a disease.
    if (m && /^\s*[:=]?\s*\d/.test(segment.slice(m.index + m[0].length - m[2].length))) return -1;
    return m ? words(segment.slice(0, m.index + m[1].length)).length : -1;
  }
  return phraseAt(segWords, kw);
}

const QUALIFIER_WORDS: [Qualifier, RegExp][] = [
  ["poorlyControlled", /mal (contr|equilibr)|desequilibr|non contr|instable|non appareill/],
  ["severe", /severe|serre|terminal|decompens|grave/],
  ["recent", /recent|il y a (\d|un|une|deux|trois) (sem|jour|mois)/],
];

/** « pas de », « absence de », « sans », « nie », « ni » just before the keyword, in the same clause. */
const NEGATION = /\b(pas d[e']?|pas de notion d[e']?|absence d[e']?|sans|ni|nie|aucun(e)?|negatif|exclu(e)?|jamais eu d[e']?)\s*$/;
const FAMILY = /\b(mere|pere|frere|soeur|fils|fille|grand[- ]?(pere|mere)|oncle|tante|cousin|familia(l|ux)|dans la famille)\b/;

/** Clauses: split on , ; « et » « + » and sentence ends — but not inside parentheses nor in a decimal (« 7,8 % »). */
function splitSegments(text: string): string[] {
  // Protect parentheses and decimal commas, split, then restore.
  let depth = 0;
  let masked = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    const decimal = ch === "," && /\d/.test(text[i - 1] ?? "") && /\d/.test(text[i + 1] ?? "");
    masked += (depth > 0 && (ch === "," || ch === ";")) || decimal ? "\u0001" : ch;
  }
  return masked
    .split(/[\n;,]+|\s+(?:et|\+)\s+|\.\s+|\s+-\s+/i)
    .map((s) => s.replace(/\u0001/g, ",").replace(/^[\s\-•*]+/, "").trim())
    .filter(Boolean);
}

const num = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));

/** Values anywhere in the text. */
function readValues(text: string): { values: QuickValue[]; asa?: number; mallampati?: 1 | 2 | 3 | 4; sex?: "M" | "F" } {
  const f = fold(text);
  const values: QuickValue[] = [];
  const push = (key: QuickValue["key"], value: number, label: string) => {
    if (Number.isFinite(value) && !values.some((v) => v.key === key)) values.push({ key, value, label });
  };
  const bp = f.match(/\b(?:pa|ta|tension(?: arterielle)?|pression(?: arterielle)?)\s*:?\s*(\d{2,3})\s*[/-]\s*(\d{2,3})/);
  if (bp) {
    push("sbp", Number(bp[1]), `PAS ${bp[1]}`);
    push("dbp", Number(bp[2]), `PAD ${bp[2]}`);
  }
  const hr = f.match(/\b(?:fc|pouls|frequence cardiaque|freq\.? card\.?)\s*:?\s*(\d{2,3})/) ?? f.match(/\b(\d{2,3})\s*(?:bpm|batt)/);
  if (hr) push("hr", Number(hr[1]), `FC ${hr[1]}`);
  const sat = f.match(/\b(?:spo2|sao2|sat(?:uration)?(?: en o2| en oxygene| air ambiant| aa)?)\s*:?\s*(\d{2,3})\s*%?/);
  if (sat) push("spo2", Number(sat[1]), `SpO₂ ${sat[1]} %`);
  const w = f.match(/\b(?:poids|pds)\s*:?\s*(\d{2,3}(?:[.,]\d)?)\s*(?:kg)?/) ?? f.match(/\b(\d{2,3}(?:[.,]\d)?)\s*kg\b/);
  if (w) push("weightKg", num(w[1]), `poids ${w[1]} kg`);
  const h = f.match(/\btaille\s*:?\s*(\d)\s*[.,m]\s*(\d{2})/) ?? f.match(/\b(1)\s*[.,m]\s*(\d{2})\s*m?\b(?=[^%]*$)/m);
  const hcm = f.match(/\b(?:taille\s*:?\s*)?(1\d{2}|2[0-2]\d)\s*cm\b/);
  if (h && /taille/.test(h[0])) push("heightCm", Number(h[1]) * 100 + Number(h[2]), `taille ${h[1]},${h[2]} m`);
  else if (hcm) push("heightCm", Number(hcm[1]), `taille ${hcm[1]} cm`);
  const age = f.match(/\b(\d{1,3})\s*ans\b/);
  if (age && Number(age[1]) <= 110) push("age", Number(age[1]), `${age[1]} ans`);
  const hb = f.match(/\b(?:hb|hgb|hemoglobine)\s*:?\s*(\d{1,3}(?:[.,]\d)?)\s*(g\/dl|g\/l|g%)?/);
  if (hb) {
    const v = num(hb[1]);
    push("hb", hb[2] === "g/l" || v > 25 ? Math.round(v) / 10 : v, `Hb ${hb[1]}${hb[2] ? ` ${hb[2]}` : ""}`);
  }
  const plt = f.match(/\b(?:plaquettes|plq|plt|thrombocytes)\s*:?\s*(\d{1,3}(?:[ .]?\d{3})?)\s*(?:g\/l|\/mm3|\/µl|\/ul|x ?10)?/);
  if (plt) {
    const v = num(plt[1].replace(/[ .]/g, ""));
    push("platelets", v > 2000 ? Math.round(v / 1000) : v, `plaquettes ${plt[1]}`);
  }
  const inr = f.match(/\binr\s*:?\s*(\d(?:[.,]\d{1,2})?)/);
  if (inr) push("inr", num(inr[1]), `INR ${inr[1]}`);
  const cr = f.match(/\b(?:creat(?:inine|inemie)?|cr)\s*:?\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(mg\/dl|mg\/l|µmol\/l|umol\/l|µmol|umol)?/);
  if (cr) {
    const v = num(cr[1]);
    const mgdl = cr[2]?.startsWith("mg/l") ? v / 10 : cr[2]?.includes("mol") || v > 20 ? Math.round((v / CREATININE_UMOL_PER_MG_DL) * 100) / 100 : v;
    push("creatinineMgDl", mgdl, `créatinine ${cr[1]}${cr[2] ? ` ${cr[2]}` : ""}`);
  }
  const a1c = f.match(/\b(?:hba1c|hb a1c|hemoglobine glyquee|glycohemoglobine)\s*:?\s*(\d{1,3}(?:[.,]\d)?)\s*(%|mmol\/mol)?/);
  if (a1c) {
    const v = num(a1c[1]);
    push("hba1c", a1c[2] === "mmol/mol" || v > 20 ? Math.round((v / 10.929 + 2.15) * 10) / 10 : v, `HbA1c ${a1c[1]}${a1c[2] ? ` ${a1c[2]}` : " %"}`);
  }
  const k = f.match(/\b(?:k\+?|kaliemie|potassium)\s*:?\s*(\d(?:[.,]\d{1,2})?)\s*(?:mmol|meq)?/);
  if (k) push("potassium", num(k[1]), `K⁺ ${k[1]}`);
  const na = f.match(/\b(?:na\+?|natremie|sodium)\s*:?\s*(1\d{2})\b/);
  if (na) push("sodium", num(na[1]), `Na⁺ ${na[1]}`);
  const glu = f.match(/\b(?:glycemie|glucose|gly)\s*:?\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(mg\/dl|g\/l|mmol\/l)?/);
  if (glu) {
    const v = num(glu[1]);
    const mgdl = glu[2] === "g/l" || (!glu[2] && v < 5) ? v * 100 : glu[2] === "mmol/l" || (!glu[2] && v < 35) ? Math.round(v * 18) : v;
    push("glucose", mgdl, `glycémie ${glu[1]}${glu[2] ? ` ${glu[2]}` : ""}`);
  }
  const alb = f.match(/\b(?:albumine|albuminemie)\s*:?\s*(\d{1,2}(?:[.,]\d)?)\s*(g\/l|g\/dl)?/);
  if (alb) {
    const v = num(alb[1]);
    push("albumin", alb[2] === "g/dl" || v < 7 ? v * 10 : v, `albumine ${alb[1]}${alb[2] ? ` ${alb[2]}` : ""}`);
  }
  const bnp = f.match(/\bnt-?probnp\s*:?\s*(\d{1,6})/);
  if (bnp) push("ntprobnp", num(bnp[1]), `NT-proBNP ${bnp[1]}`);
  const trop = f.match(/\b(?:troponine|tnt|tni|trop)(?:\s*(?:t|i))?(?:\s*hs)?\s*:?\s*(\d{1,5}(?:[.,]\d{1,3})?)/);
  if (trop) push("troponin", num(trop[1]), `troponine ${trop[1]}`);
  const fer = f.match(/\bferritine\s*:?\s*(\d{1,5})/);
  if (fer) push("ferritin", num(fer[1]), `ferritine ${fer[1]}`);
  const roman = (s: string) => ({ i: 1, ii: 2, iii: 3, iv: 4, v: 5 })[s] ?? Number(s);
  const asa = f.match(/\basa\s*:?\s*(iv|v|i{1,3}|[1-5])\b/);
  const mp = f.match(/\b(?:mallampati|mp)\s*:?\s*(iv|i{1,3}|[1-4])\b/);
  const sex = /\b(madame|mme|patiente|nee le|femme|sexe\s*:?\s*f)\b/.test(f) ? "F" : /\b(monsieur|mr|m\. [a-z]|ne le|homme|sexe\s*:?\s*m)\b/.test(f) ? "M" : undefined;
  return { values, asa: asa ? roman(asa[1]) : undefined, mallampati: mp ? (roman(mp[1]) as 1 | 2 | 3 | 4) : undefined, sex };
}

/** Findings of the examination, with their negations (« pas de souffle »). */
function readExam(text: string): ClinicalExam {
  const f = fold(text);
  const neg = (re: RegExp) => {
    const m = re.exec(f);
    return m ? NEGATION.test(f.slice(Math.max(0, m.index - 30), m.index)) : null;
  };
  const exam: ClinicalExam = {};
  const murmur = neg(/souffle (cardiaque|systolique|diastolique|aortique|mitral)|\bsouffle\b(?! court| d'effort)/);
  if (murmur === false) exam.heart = "murmur";
  else if (/b1 ?b2 (reguliers|bien frappes|normaux)|auscultation cardiaque (normale|sp|rp)|auscultation cardio-?pulmonaire (normale|sp)|cardio-?pulmonaire (normale|sp|rp)/.test(f) || murmur === true) exam.heart = "normal";
  if (/rythme irregulier|arythmie complete|irregulier a l'auscultation/.test(f)) exam.heart = "irregular";
  if (neg(/crepitants|crepitations|rales crepitants/) === false) exam.lungs = "crackles";
  else if (neg(/sibilants|sibilances|wheezing/) === false) exam.lungs = "wheeze";
  else if (/murmure vesiculaire (diminue|abaisse)|mv diminue/.test(f)) exam.lungs = "diminished";
  else if (/murmure vesiculaire (normal|symetrique|bien percu)|auscultation pulmonaire (normale|sp|rp)|cardio-?pulmonaire (normale|sp|rp)|mv (normal|symetrique)/.test(f)) exam.lungs = "normal";
  if (neg(/oedemes? (des membres inferieurs|des mi|periph|malleolaires?)|\bomi\b/) === false) exam.edema = true;
  if (neg(/turgescence jugulaire|\btj\b/) === false) exam.jvd = true;
  if (/capital veineux (pauvre|mediocre|difficile)|abord veineux difficile|veines? difficiles?/.test(f)) exam.veins = "difficult";
  // ECG (manual, chap. 51).
  const ecg: NonNullable<ClinicalExam["ecg"]> = {};
  const ms = (re: RegExp) => {
    const m = re.exec(f);
    if (!m) return undefined;
    const v = Number(m[1].replace(",", "."));
    return v < 1 ? Math.round(v * 1000) : Math.round(v);
  };
  ecg.qtcMs = ms(/\bqtc\s*(?:=|:|de|a)?\s*(\d{3}|0[.,]\d{2,3})\s*(?:ms)?/);
  ecg.prMs = ms(/\bpr\s*(?:=|:|de|a)?\s*(\d{2,3}|0[.,]\d{2,3})\s*ms/);
  ecg.qrsMs = ms(/\bqrs\s*(?:=|:|de|a)?\s*(\d{2,3}|0[.,]\d{2,3})\s*ms/);
  // The rhythm only when the sentence is about the ECG (« FA paroxystique » in the history is not today's rhythm).
  const ecgText = (f.match(/\becg\b[^.\n]*/g) ?? []).join(" ");
  if (/\b(rs|rythme sinusal|sinusal)\b/.test(ecgText)) ecg.rhythm = "sinus";
  if (/fibrillation (auriculaire|atriale)|\bfa\b|\bacfa\b/.test(ecgText)) ecg.rhythm = "af";
  else if (/\bflutter\b/.test(ecgText)) ecg.rhythm = "flutter";
  else if (/electro-?entraine|entraine par (le |un )?pace/.test(ecgText)) ecg.rhythm = "paced";
  const findings: NonNullable<typeof ecg.findings> = [];
  const push = (code: (typeof findings)[number], re: RegExp) => {
    if (neg(re) === false) findings.push(code);
  };
  push("lbbb", /\bbbg\b|bloc de branche gauche/);
  push("rbbb", /\bbbd\b|bloc de branche droit/);
  push("lafb", /\bhbag\b|hemibloc anterieur/);
  push("lpfb", /\bhbpg\b|hemibloc posterieur/);
  push("avb1", /\bbav (1|i|du 1er|de 1er|1er degre)\b|bav du premier degre/);
  push("mobitz2", /mobitz (2|ii)\b/);
  push("mobitz1", /mobitz (1|i)\b|wenckebach/);
  push("avb3", /\bbav (3|iii|complet)\b|bav du 3e degre|bloc (auriculo-ventriculaire|av) complet/);
  push("lvh", /\bhvg\b|hypertrophie ventriculaire gauche/);
  push("q_waves", /ondes? q\b/);
  push("delta", /onde delta|pre-?excitation/);
  push("brugada", /brugada/);
  if (findings.length) ecg.findings = findings;
  for (const k of Object.keys(ecg) as (keyof typeof ecg)[]) if (ecg[k] === undefined) delete ecg[k];
  if (Object.keys(ecg).length) exam.ecg = ecg;
  return exam;
}

/** « 1-0-1 », « 2x/j », « matin et soir » → doses per day. */
function timesPerDay(f: string): number | null {
  const schema = f.match(/\b(\d(?:[.,]5)?)\s*-\s*(\d(?:[.,]5)?)\s*-\s*(\d(?:[.,]5)?)(?:\s*-\s*(\d(?:[.,]5)?))?\b/);
  if (schema) return [schema[1], schema[2], schema[3], schema[4] ?? "0"].reduce((s, x) => s + num(x), 0) || null;
  const times = f.match(/(\d)\s*(?:x|fois)\s*(?:\/|par)?\s*(?:j|jour)\b/);
  if (times) return Number(times[1]);
  if (/matin et soir|2 fois|deux fois/.test(f)) return 2;
  if (/3 fois|trois fois|matin,? midi et soir/.test(f)) return 3;
  if (/\b(le matin|le soir|au coucher|1 ?x ?\/ ?j|une fois par jour|par jour|\/j)\b/.test(f)) return 1;
  return null;
}

type Cats = Pick<Catalogs, "conditions" | "medications" | "allergens"> & Partial<Pick<Catalogs, "surgeries">>;

export function parseQuickEntry(text: string, catalogs: Cats): QuickEntryResult {
  const result: QuickEntryResult = { conditions: [], negated: [], treatments: [], freeTreatments: [], allergies: [], substances: {}, values: [], exam: {}, surgicalHistory: [], history: [], unknown: [], ignored: [], document: false };
  const all = fold(text);

  // --- Sections -------------------------------------------------------------------------
  const lines: { section: Section; text: string }[] = [];
  let section: Section = "none";
  let sectionsSeen = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = readHeading(line);
    if (heading) {
      section = heading.section;
      sectionsSeen++;
      if (heading.rest.trim()) lines.push({ section, text: heading.rest.trim() });
      continue;
    }
    lines.push({ section, text: line });
  }
  result.document = sectionsSeen > 0 || text.length > 300 || lines.length > 4;

  // --- Values, exam, habits (whole text) ------------------------------------------------
  const v = readValues(text);
  result.values = v.values;
  result.asa = v.asa;
  result.mallampati = v.mallampati;
  result.sex = v.sex;
  result.exam = readExam(text);

  let tobacco: TobaccoStatus | undefined;
  if (/(ancien(ne)?|ex)[- ]?fumeu|sevre(e)? du tabac|arret du tabac|a arrete de fumer|tabagisme (sevre|ancien)/.test(all)) tobacco = "former";
  else if (/non[- ]?fumeu|ne fume pas|jamais fume|pas de tabac|tabac\s*:?\s*(0|non|neant)/.test(all)) tobacco = "never";
  else if (/\bfumeu|\btabac\b|\bfume\b|\bcigarette|tabagisme (actif|actuel)/.test(all)) tobacco = "current";
  if (tobacco) result.substances.tobacco = tobacco;
  const pa = all.match(/(\d+(?:[.,]\d+)?)\s*(?:pa\b|paquets?[- ]?ann)/);
  if (pa) result.substances.packYears = num(pa[1]);
  const alcohol = all.match(/(\d+(?:[.,]\d+)?)\s*(?:u\b|unites?|verres?|bieres?|verres? de vin)\s*(?:\/|par\s+)?\s*(j\b|jour|sem|semaine)/);
  if (alcohol) result.substances.alcoholUnitsPerWeek = num(alcohol[1]) * (alcohol[2].startsWith("j") ? 7 : 1);
  if (/ethylisme (chronique|actif)|alcoolisme|dependance (a l')?alcool|sevrage alcool|ethylo-?dependan/.test(all)) result.substances.alcoholDependence = true;
  const drugs: DrugCode[] = [];
  if (/cannabis|joint|marijuana|thc\b/.test(all)) drugs.push("cannabis");
  if (/cocaine|coke\b/.test(all)) drugs.push("cocaine");
  if (/heroine|methadone|subutex|suboxone/.test(all)) drugs.push("opioids");
  if (/amphetamine|mdma|ecstasy|speed\b/.test(all)) drugs.push("amphetamines");
  if (drugs.length) result.substances.drugs = drugs;
  const aboutSubstances = (seg: string) => /fum|tabac|cigarette|paquet|alcool|biere|verre|vin\b|cannabis|joint|cocaine|heroine|drogue|ethyl/.test(fold(seg));
  const aboutValues = (seg: string) =>
    /\b(pa|ta|fc|spo2|sat|poids|taille|hb|inr|creat|plaquettes|hba1c|asa|mallampati|imc|bmi|kg|cm|mmhg|\/min|k\+?|na\+?|kaliemie|natremie|glycemie|albumine|nt-?probnp|troponine|ferritine)\b|\d+\s*ans\b/.test(fold(seg));

  // --- Planned intervention ---------------------------------------------------------------
  const surgeries = catalogs.surgeries ?? [];
  const findSurgery = (seg: string) => {
    const sw = words(seg);
    return surgeries.find((s) => [s.name, ...(s.aka ?? [])].some((k) => fold(k).length >= 3 && containsPhrase(sw, words(k))));
  };
  const planned = lines.find((l) => l.section === "surgery") ?? lines.find((l) => /\b(prevue?|programmee?|en vue d|pour (une|un|la|le)|candidat a)\b/.test(fold(l.text)) && findSurgery(l.text));
  if (planned) {
    const s = findSurgery(planned.text);
    if (s) {
      const f = fold(planned.text);
      const side = /\bdroit(e)?\b|\bd\b/.test(f) ? "droit" : /\bgauche\b|\bg\b/.test(f) ? "gauche" : /bilateral/.test(f) ? "bilatéral" : undefined;
      const d = f.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})(?:\s*(?:a|,)?\s*(\d{1,2})\s*h\s*(\d{2})?)?/);
      let plannedAt: string | undefined;
      if (d) {
        const y = d[3].length === 2 ? `20${d[3]}` : d[3];
        const pad = (x: string | undefined, dflt: string) => (x ?? dflt).padStart(2, "0");
        plannedAt = `${y}-${pad(d[2], "01")}-${pad(d[1], "01")}T${pad(d[4], "08")}:${pad(d[5], "00")}`;
      }
      result.surgery = { id: s.id, name: s.name, side, plannedAt, from: planned.text };
    }
  }

  // --- Line by line, clause by clause ---------------------------------------------------
  let allergyContext = false;
  for (const line of lines) {
    if (line.section === "family") {
      result.ignored.push(line.text);
      continue;
    }
    if (line === planned && line.section === "surgery") continue;
    const inSurgical = line.section === "surgical";
    if (line.section === "allergy" && /\b(aucune|pas d|neant|nka|0)\b|^non\b/.test(fold(line.text))) {
      result.noKnownAllergy = true;
      continue;
    }
    for (const segment of splitSegments(line.text)) {
      const f = fold(segment);
      const segWords = words(segment);
      let matched = false;

      // Allergies: an allergy section, « allergie à … », « AL : … » and the continuation « … et au latex ».
      const continuation: RegExpMatchArray | null = allergyContext ? f.match(/^(?:aux|au|a la|a l'|a)\s+(.*)$/) : null;
      const allergyMatch: RegExpMatchArray | null =
        continuation ??
        (line.section === "allergy" ? f.match(/^(.*)$/) : null) ??
        f.match(/^(?:allergi(?:e|es|que)s?|al\b)\s*(?::|aux\b|au\b|a la\b|a l'|a\b)?\s*(.*)$/) ??
        f.match(/allergi(?:e|es|que)s?\s+(?:aux\b|au\b|a la\b|a l'|a\b)?\s*(.*)$/);
      allergyContext = !!allergyMatch;
      if (allergyMatch) {
        const rest = allergyMatch[1].trim();
        if (/^(aucune|pas d|neant|non|0)\b/.test(rest) || /pas d'allergie|aucune allergie|allergie\s*:\s*(0|non|neant)/.test(f)) {
          result.noKnownAllergy = true;
          continue;
        }
        const reaction = segment.match(/\(([^)]{3,60})\)/)?.[1];
        const restWords = words(rest);
        const found = catalogs.allergens.filter((a) => [a.label, ...a.keywords].some((k) => fold(k).length >= 3 && containsPhrase(restWords, words(k))));
        for (const a of found) if (!result.allergies.some((x) => x.allergenId === a.id)) result.allergies.push({ allergenId: a.id, label: a.label, reaction, from: segment });
        if (!found.length && rest) {
          const label = segment.replace(/\([^)]*\)/g, "").replace(/^.*?allergi\w*\s*(?:aux\s|au\s|à la\s|à l'|à\s)?\s*/i, "").replace(/^(?:aux|au|à la|à l'|à)\s+/i, "").trim() || rest;
          result.allergies.push({ label, reaction, from: segment });
        }
        continue;
      }

      // Treatments: catalogue names and brands (the whole CBIP), with the dose next to them and how often.
      for (const m of catalogs.medications) {
        const names = [m.name, ...(m.brands ?? [])].filter((n) => fold(n).length >= 4);
        const hit = names.find((n) => containsPhrase(segWords, words(n)));
        if (!hit) continue;
        // Negated (« pas d'anticoagulant ») or past (« Xarelto arrêté ») treatments are left out.
        const at = phraseAt(segWords, words(hit));
        if (NEGATION.test(segWords.slice(Math.max(0, at - 4), at).join(" ")) || /\b(arrete|stoppe|interrompu|ancien traitement)\b/.test(f)) continue;
        if (result.treatments.some((t) => t.id === m.id)) {
          matched = true;
          continue;
        }
        const dose = f.match(new RegExp(`${words(hit).slice(-1)[0]}\\w*\\s+(?:[a-z]+\\s+)?(\\d+(?:[.,]\\d+)?)\\s*(mg|g|µg|mcg|ui)\\b`)) ?? f.match(/(\d+(?:[.,]\d+)?)\s*(mg|g)\b/);
        let dailyDoseMg: number | undefined;
        if (dose && (dose[2] === "mg" || dose[2] === "g")) {
          const perTake = num(dose[1]) * (dose[2] === "g" ? 1000 : 1);
          const n = timesPerDay(f);
          dailyDoseMg = n ? Math.round(perTake * n * 100) / 100 : undefined;
          if (!n && line.section !== "treatment") dailyDoseMg = perTake;
        }
        result.treatments.push({ id: m.id, atc: m.atc, name: m.name, components: m.components, dailyDoseMg, from: segment });
        matched = true;
      }
      if (line.section === "treatment") {
        if (!matched && segment.length > 2 && !/^(pas de|aucun|neant|0)\b/.test(f)) result.freeTreatments.push(segment);
        continue;
      }

      // Antecedents: catalogue labels and synonyms, with their qualifiers; negated and family ones apart.
      for (const c of catalogs.conditions) {
        let at = -1;
        const hit = [c.label, ...(c.keywords ?? [])].find((k) => (at = keywordAt(segment, segWords, k)) >= 0);
        if (!hit) continue;
        matched = true;
        const before = segWords.slice(Math.max(0, at - 5), at).join(" ");
        const family = FAMILY.test(f) && c.id !== "malignant_hyperthermia";
        if (family) {
          if (!result.ignored.includes(segment)) result.ignored.push(segment);
          continue;
        }
        const qualifiers = QUALIFIER_WORDS.filter(([q, re]) => c.qualifiers?.[q] !== undefined && re.test(f)).map(([q]) => q);
        // A detail whose answer is named in the text: « GOLD 3 », « FA paroxystique », « SAOS sévère ».
        const details: Record<string, string> = {};
        for (const d of c.details ?? []) {
          if (d.kind !== "choice") continue;
          const opt = (d.options ?? []).find((o) => {
            const key = words(o.label.split(/[:(]/)[0]);
            return key.join("").length >= 4 && containsPhrase(segWords, key);
          });
          if (opt) details[d.id] = opt.code;
        }
        const entry = { id: c.id, label: c.label, qualifiers, from: segment, ...(Object.keys(details).length ? { details } : {}) };
        if (NEGATION.test(before + " ")) {
          if (!result.negated.some((x) => x.id === c.id) && !result.conditions.some((x) => x.id === c.id)) result.negated.push(entry);
        } else if (!result.conditions.some((x) => x.id === c.id)) {
          result.conditions.push(entry);
          result.negated = result.negated.filter((x) => x.id !== c.id);
        }
      }

      // A past operation (a known procedure with a year, or anything in a surgical-history section).
      const pastSurgery = findSurgery(segment);
      if (inSurgical || (pastSurgery && /\b(19|20)\d{2}\b|\benfance\b|\bancien/.test(f))) {
        if (!result.surgicalHistory.includes(segment)) result.surgicalHistory.push(segment);
        continue;
      }
      if (matched || aboutSubstances(segment) || aboutValues(segment) || line.section === "habits" || line.section === "biology" || line.section === "exam" || line.section === "conclusion") continue;
      if (segment.length <= 1) continue;
      if (line.section === "history") result.history.push(segment);
      else result.unknown.push(segment);
    }
  }

  // « Diabète insulinotraité » also reads as « diabète »: keep the more specific one.
  if (result.conditions.some((c) => c.id === "diabetes_insulin")) result.conditions = result.conditions.filter((c) => c.id !== "diabetes_oral");
  // Anaesthetic history said in the surgical history (« NVPO », « intubation difficile ») counts.
  return result;
}

export function isEmptyQuickEntry(r: QuickEntryResult): boolean {
  return (
    !r.conditions.length &&
    !r.negated.length &&
    !r.treatments.length &&
    !r.freeTreatments.length &&
    !r.allergies.length &&
    !r.noKnownAllergy &&
    !Object.keys(r.substances).length &&
    !r.values.length &&
    !Object.keys(r.exam).length &&
    !r.asa &&
    !r.mallampati &&
    !r.surgery &&
    !r.surgicalHistory.length &&
    !r.history.length &&
    !r.unknown.length
  );
}

/** Keys of what is kept: « c:id », « n:id », « t:id », « ft:i », « a:i », « v:key », « s », « x », « asa », « mp », « surg », « sh », « h », « u », « nka », « sex ». */
export type QuickSelection = Set<string>;

/** Everything recognised is kept; leftovers of a pasted document are not (they go to the notes only if asked). */
export function selectAll(r: QuickEntryResult): QuickSelection {
  const keys = new Set<string>([
    ...r.conditions.map((c) => `c:${c.id}`),
    ...r.negated.map((c) => `n:${c.id}`),
    ...r.treatments.map((t) => `t:${t.id}`),
    ...r.freeTreatments.map((_, i) => `ft:${i}`),
    ...r.allergies.map((_, i) => `a:${i}`),
    ...r.values.map((v) => `v:${v.key}`),
    "s",
    "x",
    "asa",
    "mp",
    "surg",
    "sh",
    "h",
    "nka",
    "sex",
  ]);
  if (!r.document) keys.add("u");
  return keys;
}

/** Adds what was recognised (and kept) to the consultation — an answer already given is never overwritten. */
export function applyQuickEntry(c: ConsultationState, r: QuickEntryResult, sel: QuickSelection = selectAll(r)): ConsultationState {
  const conditions = { ...c.conditions };
  for (const q of r.conditions.filter((x) => sel.has(`c:${x.id}`))) {
    conditions[q.id] = { ...conditions[q.id], present: true, ...Object.fromEntries(q.qualifiers.map((k) => [k, true])), ...(q.details ? { details: { ...q.details, ...conditions[q.id]?.details } } : {}) };
  }
  for (const q of r.negated.filter((x) => sel.has(`n:${x.id}`))) if (conditions[q.id] === undefined) conditions[q.id] = { present: false };

  const treatments = [...c.treatments];
  for (const t of r.treatments.filter((x) => sel.has(`t:${x.id}`))) {
    if (!treatments.some((x) => (x.catalogId ?? x.atc) === t.id || (t.atc && x.atc === t.atc))) treatments.push({ id: crypto.randomUUID(), atc: t.atc, name: t.name, catalogId: t.id, dailyDoseMg: t.dailyDoseMg, ...(t.components?.length ? { components: t.components } : {}) });
  }
  r.freeTreatments.forEach((name, i) => {
    if (sel.has(`ft:${i}`) && !treatments.some((x) => fold(x.name) === fold(name))) treatments.push({ id: crypto.randomUUID(), atc: "", name });
  });

  const p: ConsultationPatient = { ...c.patient };
  const allergyList = [...(p.allergyList ?? [])];
  r.allergies.forEach((a, i) => {
    if (!sel.has(`a:${i}`)) return;
    if (!allergyList.some((x) => (a.allergenId && x.allergenId === a.allergenId) || fold(x.label) === fold(a.label))) allergyList.push({ allergenId: a.allergenId, label: a.label, ...(a.reaction ? { reaction: a.reaction } : {}) });
  });
  p.allergyList = allergyList;
  p.noKnownAllergy = allergyList.length ? false : r.noKnownAllergy && sel.has("nka") ? true : p.noKnownAllergy;
  for (const v of r.values) if (sel.has(`v:${v.key}`) && p[v.key] === undefined) (p as Record<string, unknown>)[v.key] = v.value;
  if (r.sex && sel.has("sex") && !p.sex) p.sex = r.sex;
  if (sel.has("x") && Object.keys(r.exam).length) p.exam = { ...r.exam, ...p.exam };
  if (sel.has("h") && r.history.length) p.history = [p.history, ...r.history].filter(Boolean).join(" ; ");
  if (sel.has("u") && r.unknown.length) p.history = [p.history, ...r.unknown].filter(Boolean).join(" ; ");
  if (sel.has("sh") && r.surgicalHistory.length) p.surgicalHistory = [p.surgicalHistory, ...r.surgicalHistory].filter(Boolean).join(" ; ");

  const next: ConsultationState = { ...c, conditions, treatments, patient: p, substances: sel.has("s") ? { ...c.substances, ...r.substances } : c.substances };
  if (r.asa && sel.has("asa") && c.asa === undefined) next.asa = r.asa;
  if (r.mallampati && sel.has("mp") && c.mallampati === undefined) next.mallampati = r.mallampati;
  if (!sel.has("u") && sel.has("notes") && r.unknown.length) next.notes = [c.notes, ...r.unknown].filter(Boolean).join("\n");
  return next;
}
