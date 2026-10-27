// Anaesthesia consultations copied from a hospital's software, one or
// several at once, read into what a case sheet needs. Every hospital lays
// its note out its own way, so nothing here relies on one layout: a
// consultation starts at a birth date (or at a « --- » line typed between
// two), fields are found by their labels wherever they sit (several may
// share a line: « Age 38 ans Poids 100 kg Taille 176 cm »), sections by
// their headings, and what is only print furniture (« Imprimé par… Page 1
// sur 2 », the HEMSTOP questions, the hospital's name) is set aside before
// the antecedents, treatments and allergies are handed to the dictation
// reader (quick-entry.ts). Local and deterministic, like the rest of Préop:
// nothing leaves the device.

export interface PastedConsultation {
  /** The consultation as pasted (for « voir le texte »). */
  raw: string;
  /** Surname then first name initials (« NP »); empty when no name was found. */
  initials: string;
  sex?: "M" | "F";
  /** dd/mm/yyyy, as written. */
  birthDate?: string;
  age?: number;
  weightKg?: number;
  heightCm?: number;
  surgery: string;
  surgeon?: string;
  /** dd/mm/yyyy, as written. */
  plannedDate?: string;
  /** « HDJ », « Hospitalisation », « USI »… */
  admission?: string;
  /** The anaesthesia asked for, as written (« AG », « Rachi », « AG + bloc »). */
  anaesthesia?: string;
  mode?: "general" | "neuraxial" | "regional" | "sedation";
  /** The fasting instructions, one line. */
  fasting?: string;
  /** Number of « oui » (0–6, ≥ 2: bleeding risk). */
  hemstop?: number;
  jehovah?: boolean;
  mallampati?: 1 | 2 | 3 | 4;
  /** Airway findings other than the Mallampati (« Ouverture buccale > 35 mm »). */
  airway: string[];
  history: string[];
  surgical: string[];
  /** Antecedents of anaesthesia, « RAS » left out. */
  anaesthetic: string[];
  allergies: string[];
  noKnownAllergy?: boolean;
  treatments: string[];
  noTreatment?: boolean;
  /** Tobacco, alcohol, drugs, as sentences the dictation reader knows. */
  habits: string[];
  /** Lines under no heading this reader knows (examination, biology, conclusion…). */
  other: string[];
  /** The text for parseQuickEntry: the sections under the headings it knows. */
  normalized: string;
}

/** Accents off, lower case, same length as the input (indexes stay valid). */
const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const BIRTH = /\bn[ée]e?\s+le\s*:?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i;
const SEPARATOR = /^\s*(?:-{3,}|={3,}|_{3,}|\*{3,}|#{3,})\s*$/;
/** « NOM, PRENOM » or « NOM-NOM, Prénom Prénom ». */
const NAME_LINE = /^\s*(?:(?:M\.|Mme|Mlle|Monsieur|Madame)\s+)?([A-ZÀ-Ý][A-ZÀ-Ý'’ -]+?)\s*,\s*([A-Za-zÀ-ÿ'’ -]+?)\s*$/;

/**
 * Several consultations pasted together, one text each. Explicit « --- »
 * lines win; otherwise each birth date starts a consultation (from the name
 * just above it). The print footers repeat the name, never the birth date.
 */
export function splitConsultations(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.some((l) => SEPARATOR.test(l))) {
    const out: string[][] = [[]];
    for (const l of lines) {
      if (SEPARATOR.test(l)) out.push([]);
      else out[out.length - 1].push(l);
    }
    return out.map((c) => c.join("\n").trim()).filter((c) => c.length > 0);
  }
  const starts: number[] = [];
  lines.forEach((l, i) => {
    if (!BIRTH.test(l)) return;
    let start = i;
    // The name, and the hospital's header just above it, belong to this consultation.
    if (i > 0 && NAME_LINE.test(lines[i - 1])) start = i - 1;
    while (start > 0 && start > (starts.at(-1) ?? -1) + 1 && /^\s*(centre hospitalier|chu|ch |clinique|h[oô]pital|universitaire|hospitalier)/i.test(lines[start - 1])) start--;
    starts.push(start);
  });
  if (starts.length <= 1) return text.trim() ? [text.trim()] : [];
  starts[0] = 0;
  return starts.map((s, k) => lines.slice(s, starts[k + 1] ?? lines.length).join("\n").trim()).filter(Boolean);
}

/** Lines that are only the printed page's furniture. */
const FURNITURE = [
  /^\s*imprim[ée] (par|le)\b/i,
  /\bpage \d+ (sur|\/) \d+\b/i,
  /^\s*note r[ée]dig[ée]e par\b/i,
  /^\s*(centre hospitalier|chu\b|clinique\b|h[oô]pital\b|universitaire de\b)/i,
  /\bdossier n[°o]/i,
  /\bpassage n[°o]/i,
  /^\s*note du \d/i,
  /^\s*(anesth[ée]sie\s*-\s*)?avis anesth/i,
  /^\s*consultation d'anesth[ée]sie\s*$/i,
];

type Section = "history" | "surgical" | "anaesthetic" | "allergy" | "treatment" | "habits" | "fasting" | "hemstop" | "airway" | "ignore" | "keep";

const HEADINGS: [Section, RegExp][] = [
  ["surgical", /^(antecedents?|atcd?s?)\s+(chirurgicaux|chir\.?|operatoires)$/],
  ["anaesthetic", /^(antecedents?|atcd?s?)\s+anesthesiques$/],
  ["history", /^(antecedents?|atcd?s?)(\s+(medicaux|personnels|medico-?chirurgicaux))?$|^comorbidites$|^pathologies?(\s+chroniques)?$/],
  ["allergy", /^allergies?(\s*(-|\/|et|,)\s*(hypersensibilites?|intolerances?|reactions?))*$|^allergies? connues?$|^intolerances?$|^hypersensibilites?$/],
  ["treatment", /^(traitements?|ttt|medicaments?)(\s+(habituels?|personnels?|en cours|a domicile|actuels?|chroniques?))?$/],
  ["habits", /^(mode de vie|habitus|habitudes( de vie)?|toxiques|assuetudes|intoxications?)$/],
  ["fasting", /^(consignes\s*(pre-?\s*operatoires)?|jeune(\s+pre-?\s*operatoire)?)$/],
  ["hemstop", /^score hemstop/],
  ["airway", /^(evaluation (pour (l'|l’)?intubation|des voies aeriennes)|voies aeriennes( superieures)?|intubation|criteres d'intubation( difficile)?)$/],
  ["ignore", /^(informations? donnees? au patient|techniques d'anesthesie|information du patient|consentement)$/],
  ["keep", /^(examen( clinique| physique)?|ecg|biologie|bilan( biologique| sanguin)?|examens complementaires|conclusion|synthese|asa)$/],
];

function headingOf(line: string): { section: Section; head: string; rest: string } | null {
  const m = line.match(/^\s*([A-Za-zÀ-ÿ'’ ./-]{2,60}?)\s*[:：]\s*(.*)$/);
  for (const [head, rest] of m ? [[m[1], m[2]] as const, [line, ""] as const] : [[line, ""] as const]) {
    const h = fold(head).replace(/\s*-\s*/g, " - ").replace(/\s+/g, " ").trim();
    for (const [section, re] of HEADINGS) if (re.test(h)) return { section, head: head.trim(), rest: rest.trim() };
  }
  return null;
}

/** The labels of one-line fields; a line may hold several. */
const FIELDS: [key: string, re: RegExp][] = [
  ["surgery", /intitule (de l'|d'|de )?intervention|intervention (prevue|programmee)|acte (prevu|operatoire|chirurgical)|procedure( chirurgicale)?|chirurgie (prevue|programmee)|^intervention\b/g],
  ["surgeon", /(nom du )?chirurgien( referent)?|\boperateur\b/g],
  ["date", /date (operatoire|de l'intervention|d'intervention|prevue|de l'operation|de chirurgie)/g],
  ["admission", /(mode|type) d'(hospitalisation|admission)|\bhospitalisation\b/g],
  ["anaesthesia", /type d'anesthesie( souhaitee| prevue| proposee| envisagee)?|anesthesie (prevue|proposee|envisagee|souhaitee)|technique( anesthesique)? (prevue|proposee)/g],
  ["age", /\bage\b/g],
  ["weight", /\bpoids\b/g],
  ["height", /\btaille\b/g],
  ["bmi", /\b(bmi|imc)\b/g],
  // The quick entry of a patient without a consultation (case-sheet-view.tsx).
  ["initials", /\binitiales\b/g],
  ["sex", /\bsexe\b/g],
];

/** The fields of a line, and where the first label starts. */
function readFields(line: string): { fields: Map<string, string>; first: number } {
  const f = fold(line);
  const found: { key: string; start: number; end: number }[] = [];
  for (const [key, re] of FIELDS) {
    re.lastIndex = 0;
    for (let m = re.exec(f); m; m = re.exec(f)) {
      if (!found.some((x) => m!.index < x.end && m!.index + m![0].length > x.start)) found.push({ key, start: m.index, end: m.index + m[0].length });
    }
  }
  found.sort((a, b) => a.start - b.start);
  const out = new Map<string, string>();
  found.forEach((x, i) => {
    const value = line
      .slice(x.end, found[i + 1]?.start ?? line.length)
      .replace(/^\s*[:：=]?\s*/, "")
      .trim();
    if (value && !out.has(x.key)) out.set(x.key, value);
  });
  return { fields: out, first: found[0]?.start ?? -1 };
}

const num = (s: string) => Number(s.replace(",", "."));
/** « / », « RAS », « Néant », « Non connues », « Aucun »… */
const EMPTY = /^(\/+|-+|\.+|r\.?a\.?s\.?|neant|aucun(e)?s?( connue?s?)?|non( connue?s?)?|nc|0|pas d'?allergies?( connues?)?|pas de traitements?( habituels?)?|sans|ne sait pas|inconnue?s?|n\/a)$/;
const isEmpty = (l: string) => EMPTY.test(fold(l).replace(/\s+/g, " ").trim());

const MODE_WORDS: [NonNullable<PastedConsultation["mode"]>, RegExp][] = [
  ["general", /\bag\b|generale/],
  ["neuraxial", /rachi|spinale|perimedullaire|peridurale|\bapd\b|\brpc\b/],
  ["regional", /\balr\b|\bbloc\b|locoregionale|plexique|tronculaire/],
  ["sedation", /sedation|neuroleptanalgesie|\bal\b|anesthesie locale|\bmac\b/],
];

function modeOf(text: string | undefined): PastedConsultation["mode"] {
  if (!text) return undefined;
  const f = fold(text);
  return MODE_WORDS.find(([, re]) => re.test(f))?.[0];
}

function initialsOf(surname: string, given: string): string {
  const letters = (s: string) =>
    s
      .split(/[\s'’-]+/)
      .filter(Boolean)
      .map((w) => w[0]);
  // « DUPONT DE LA TOUR, Jean-Pierre » → DDLJ: the surname's first three words, then the first name.
  return [...letters(surname).slice(0, 3), ...letters(given).slice(0, 1)].join("").toUpperCase();
}

function ageAt(birth: string, at?: string): number | undefined {
  const d = (s: string) => {
    const m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (!m) return null;
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(y, Number(m[2]) - 1, Number(m[1]));
  };
  const b = d(birth);
  const t = (at && d(at)) || new Date();
  if (!b) return undefined;
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
  return age >= 0 && age < 120 ? age : undefined;
}

/** « Témoin de Jéhovah Non Tabac Oui 10 cig/j Alcool Non Stupéfiants Non ». */
function readHabits(lines: string[]): { habits: string[]; jehovah?: boolean } {
  const text = lines.join(" ");
  const f = fold(text);
  const labels: [string, RegExp][] = [
    ["jehovah", /temoin de jehovah/g],
    ["tobacco", /\btabac\b|\btabagisme\b/g],
    ["alcohol", /\balcool\b|\boh\b/g],
    ["drugs", /\bstupefiants\b|\bdrogues?\b|\btoxicomanie\b/g],
  ];
  const found: { key: string; start: number; end: number }[] = [];
  for (const [key, re] of labels) {
    re.lastIndex = 0;
    const m = re.exec(f);
    if (m) found.push({ key, start: m.index, end: m.index + m[0].length });
  }
  found.sort((a, b) => a.start - b.start);
  if (found.length === 0) return { habits: lines.filter((l) => !isEmpty(l)) };
  const habits: string[] = [];
  let jehovah: boolean | undefined;
  found.forEach((x, i) => {
    const value = text
      .slice(x.end, found[i + 1]?.start ?? text.length)
      .replace(/^\s*[:：]?\s*/, "")
      .trim();
    const v = fold(value);
    const no = /^(non|0|jamais|aucun|neant|\/)\b/.test(v);
    const yes = /^oui\b/.test(v);
    const rest = value.replace(/^(oui|non)\b\s*/i, "").trim();
    if (x.key === "jehovah") jehovah = yes ? true : no ? false : undefined;
    else if (x.key === "tobacco") {
      if (/sevr|ancien|arret/.test(v)) habits.push(`Ex-fumeur ${rest}`.trim());
      else if (yes || (!no && rest)) habits.push(`Fumeur ${rest}`.trim());
    } else if (x.key === "alcohol" && (yes || (!no && rest))) habits.push(`Alcool ${rest || "oui"}`.trim());
    else if (x.key === "drugs" && (yes || (!no && rest))) habits.push(`Stupéfiants ${rest || "oui"}`.trim());
  });
  return { habits, jehovah };
}

function readHemstop(lines: string[]): number | undefined {
  const f = fold(lines.join(" "));
  const score = f.match(/(\d)\s*\/\s*6\b/);
  if (score) return Number(score[1]);
  const answers = lines.filter((l) => /^\s*(oui|non)\s*$/i.test(l) || /\?\s*(oui|non)\s*$/i.test(l));
  return answers.length ? answers.filter((l) => /oui\s*$/i.test(l)).length : undefined;
}

/** One consultation (see splitConsultations). */
export function parseConsultation(text: string): PastedConsultation {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+$/, ""));
  const out: PastedConsultation = { raw: text, initials: "", surgery: "", airway: [], history: [], surgical: [], anaesthetic: [], allergies: [], treatments: [], habits: [], other: [], normalized: "" };
  const bySection: Record<Section, string[]> = { history: [], surgical: [], anaesthetic: [], allergy: [], treatment: [], habits: [], fasting: [], hemstop: [], airway: [], ignore: [], keep: [] };
  const keepBlocks: { head: string; lines: string[] }[] = [];
  let section: Section | null = null;
  let header = true;
  const patientName = new Set<string>();

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // Another consultation added to this patient (« Compléter… »): its lines start under no heading.
    if (SEPARATOR.test(line)) {
      section = null;
      header = false;
      continue;
    }
    // The patient: the name line, the birth date (and the sex it is written with).
    const birth = line.match(BIRTH);
    if (birth) {
      out.birthDate = birth[1];
      out.sex ??= /\bn[ée]e\s+le/i.test(line) ? "F" : "M";
      const before = line.slice(0, birth.index).replace(/[-,\s]+$/, "");
      const name = before.match(NAME_LINE) ?? before.match(/^\s*([A-ZÀ-Ý][A-ZÀ-Ý'’-]+)\s+([A-ZÀ-Ýa-zà-ÿ'’-]+)/);
      if (name && !out.initials) out.initials = initialsOf(name[1], name[2]);
      continue;
    }
    if (header) {
      const name = line.match(NAME_LINE);
      if (name && /^[A-ZÀ-Ý'’ -]+$/.test(name[1].trim()) && !out.initials) {
        out.initials = initialsOf(name[1], name[2]);
        patientName.add(fold(line));
        if (/^\s*(Mme|Madame|Mlle)\b/.test(line)) out.sex = "F";
        if (/^\s*(M\.|Monsieur)\s/.test(line)) out.sex = "M";
        continue;
      }
    }
    if (FURNITURE.some((re) => re.test(line)) || patientName.has(fold(line))) continue;

    const heading = headingOf(line);
    if (heading) {
      header = false;
      section = heading.section;
      if (section === "keep") keepBlocks.push({ head: heading.head, lines: [] });
      if (heading.rest) {
        if (section === "keep") keepBlocks.at(-1)!.lines.push(heading.rest);
        else bySection[section].push(heading.rest);
      }
      continue;
    }

    // Fields: anywhere before the sections; inside one, only a line that is
    // plainly a field (« Poids : 72 kg », several labels) — « perte de poids
    // de 10 kg » is an antecedent.
    const { fields, first } = readFields(line);
    const plainly = fields.size >= 2 || (first === 0 && /^[A-Za-zÀ-ÿ' ]{2,40}\s*[:：]/.test(line));
    if (fields.size > 0 && (section === null || section === "fasting" || plainly)) {
      header = false;
      const v = (k: string) => fields.get(k);
      if (v("surgery")) out.surgery = v("surgery")!;
      if (v("surgeon")) out.surgeon = v("surgeon")!.split(/\s{2,}/)[0];
      if (v("date")) out.plannedDate = v("date")!.match(/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/)?.[0] ?? v("date");
      if (v("admission")) {
        const a = fold(v("admission")!);
        out.admission = /jour|ambulatoire|hdj|\bj0\b/.test(a) ? "HDJ" : /usi|soins intensifs|reanimation|rea\b/.test(a) ? "USI" : /complete|conventionnelle|classique|traditionnelle|\boui\b/.test(a) ? "Hospit." : v("admission");
      }
      if (v("anaesthesia")) out.anaesthesia = v("anaesthesia");
      if (v("initials")) out.initials = v("initials")!.replace(/[^A-Za-zÀ-ÿ]/g, "").toUpperCase().slice(0, 4);
      const sexValue = v("sex") ? fold(v("sex")!) : "";
      if (/^(f|femme|feminin)/.test(sexValue)) out.sex = "F";
      else if (/^(m|h|homme|masculin)/.test(sexValue)) out.sex = "M";
      const age = v("age")?.match(/(\d{1,3})/);
      if (age) out.age = Number(age[1]);
      const w = v("weight")?.match(/(\d{1,3}(?:[.,]\d)?)/);
      if (w) out.weightKg = num(w[1]);
      const h = v("height")?.match(/(\d)[.,m](\d{2})|(\d{2,3})/);
      if (h) out.heightCm = h[3] ? Number(h[3]) : Number(h[1]) * 100 + Number(h[2]);
      continue;
    }

    if (section === null) {
      // Before any heading: the header (the anaesthetist's name, the note's title) — unless it says something.
      if (header) continue;
      out.other.push(line);
    } else if (section === "keep") keepBlocks.at(-1)!.lines.push(line);
    else bySection[section].push(line);
  }

  // Sections.
  const nonEmpty = (l: string[]) => l.filter((x) => !isEmpty(x));
  out.history = nonEmpty(bySection.history);
  out.surgical = nonEmpty(bySection.surgical);
  out.anaesthetic = nonEmpty(bySection.anaesthetic);
  out.allergies = nonEmpty(bySection.allergy);
  if (bySection.allergy.length && out.allergies.length === 0) out.noKnownAllergy = true;
  out.treatments = nonEmpty(bySection.treatment);
  if (bySection.treatment.length && out.treatments.length === 0) out.noTreatment = true;
  const habits = readHabits(bySection.habits);
  out.habits = habits.habits;
  if (habits.jehovah !== undefined) out.jehovah = habits.jehovah;
  out.hemstop = bySection.hemstop.length ? readHemstop(bySection.hemstop) : undefined;
  if (bySection.fasting.length) out.fasting = bySection.fasting.join(" ").replace(/\s+/g, " ");
  for (const l of bySection.airway) {
    const mp = fold(l).match(/mallampati(?:\s*(?:score|classe))?\s*:?\s*(iv|i{1,3}|[1-4])\b/);
    if (mp) out.mallampati = ({ i: 1, ii: 2, iii: 3, iv: 4 } as Record<string, 1 | 2 | 3 | 4>)[mp[1]] ?? (Number(mp[1]) as 1 | 2 | 3 | 4);
    else if (!isEmpty(l)) out.airway.push(l);
  }
  for (const b of keepBlocks) out.other.push(...b.lines.map((l) => `${b.head} : ${l}`));
  if (out.mallampati === undefined) {
    const mp = fold(out.other.join(" ")).match(/mallampati(?:\s*(?:score|classe))?\s*:?\s*(iv|i{1,3}|[1-4])\b/);
    if (mp) out.mallampati = ({ i: 1, ii: 2, iii: 3, iv: 4 } as Record<string, 1 | 2 | 3 | 4>)[mp[1]] ?? (Number(mp[1]) as 1 | 2 | 3 | 4);
  }

  // What the fields left out.
  out.mode = modeOf(out.anaesthesia);
  if (out.age === undefined && out.birthDate) out.age = ageAt(out.birthDate, out.plannedDate);
  if (out.sex === undefined) {
    const f = fold(text);
    if (/\b(madame|mme|patiente)\b/.test(f)) out.sex = "F";
    else if (/\b(monsieur|patient)\b/.test(f)) out.sex = "M";
  }

  // For the dictation reader: only what it should read, under headings it knows.
  const block = (head: string, l: string[]) => (l.length ? [`${head} :`, ...l] : []);
  // The examination, biology and conclusion first, one « Titre : ligne » each
  // (values are read anywhere; a line left under « Allergies » would be one).
  out.normalized = [
    ...out.other,
    ...block("Mode de vie", [...(out.jehovah ? ["Témoin de Jéhovah"] : []), ...out.habits]),
    ...block("Antécédents", out.history),
    ...block("Antécédents chirurgicaux", [...out.surgical, ...out.anaesthetic]),
    ...block("Traitement", out.treatments),
    ...block("Allergies", out.allergies),
  ].join("\n");
  return out;
}

/** Everything pasted: one entry per consultation. */
export function parsePastedConsultations(text: string): PastedConsultation[] {
  return splitConsultations(text).map(parseConsultation);
}
