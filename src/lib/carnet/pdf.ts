"use client";

// PDF export of the carnet, generated on the device with pdf-lib (loaded
// on demand) — works offline, nothing to wait for on the server. Mirrors
// the official carnet's sections and order: cover + declaration, contents,
// identification, stage evaluation grids (header pre-filled, body left
// blank for the maître de stage), related activities, courses, seminars,
// publications, record of cases (with each supervisor's signature image),
// days of duty, activity report, personal evaluation, absences.
import type { PDFDocument, PDFFont, PDFImage, PDFPage } from "pdf-lib";
import {
  ABSENCE_CATEGORIES,
  COMPETENCE_LEVELS,
  EVALUATION_GRID,
  OPERATION_CATEGORIES,
  PARTICIPATION_DEGREES,
  caseCode,
  supervisorName,
} from "./referentiel";
import { activityReport, caseNumbers, formatDateFr, localDateIso, REPORT_YEARS, sortStages } from "./logic";
import type { CarnetData, CarnetStage } from "./types";

const A4: [number, number] = [595.28, 841.89];
const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const MARGIN = 40;
const INK = { r: 0.08, g: 0.12, b: 0.2 };
const MUTED = { r: 0.4, g: 0.43, b: 0.48 };
const RULE = { r: 0.72, g: 0.74, b: 0.78 };
const SHADE = { r: 0.93, g: 0.94, b: 0.96 };

// Characters the standard PDF fonts (WinAnsi) can draw beyond Latin-1.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const REPLACEMENTS: Record<string, string> = { "≤": "<=", "≥": ">=", "−": "-", "→": "->", "✓": "v", " ": " ", " ": " " };

/** Standard fonts only encode WinAnsi — anything else would make pdf-lib throw, so it's mapped to the closest drawable text. */
export function toWinAnsi(input: string): string {
  let out = "";
  for (const ch of input.replace(/\r/g, "")) {
    if (REPLACEMENTS[ch] !== undefined) out += REPLACEMENTS[ch];
    else if (ch === "\n" || ch === "\t") out += ch === "\t" ? " " : ch;
    else if ((ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126) || (ch.charCodeAt(0) >= 160 && ch.charCodeAt(0) <= 255) || WIN_ANSI_EXTRA.has(ch)) out += ch;
    else {
      const stripped = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out += /^[\x20-\x7e]+$/.test(stripped) ? stripped : "?";
    }
  }
  return out;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of toWinAnsi(text).split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (let word of words) {
      // Hard-break a single word longer than the column.
      while (font.widthOfTextAtSize(word, size) > maxWidth && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > maxWidth) cut--;
        if (line) {
          lines.push(line);
          line = "";
        }
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

interface Column {
  header: string;
  /** Fraction of the available width. */
  width: number;
  align?: "left" | "center" | "right";
}

interface Cell {
  text?: string;
  image?: PDFImage;
  bold?: boolean;
}

/** Page cursor with automatic page breaks. */
class Writer {
  page!: PDFPage;
  y = 0;
  private landscape = false;

  constructor(
    private doc: PDFDocument,
    readonly fonts: Fonts,
    private rgb: (r: number, g: number, b: number) => ReturnType<typeof import("pdf-lib").rgb>
  ) {}

  get width() {
    return this.page.getWidth() - 2 * MARGIN;
  }

  newPage(landscape = false) {
    this.landscape = landscape;
    this.page = this.doc.addPage(landscape ? A4_LANDSCAPE : A4);
    this.y = this.page.getHeight() - MARGIN;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN + 14) this.newPage(this.landscape);
  }

  color(c: { r: number; g: number; b: number }) {
    return this.rgb(c.r, c.g, c.b);
  }

  text(content: string, opts: { size?: number; font?: PDFFont; color?: typeof INK; x?: number; maxWidth?: number; gapAfter?: number; align?: "left" | "center" } = {}) {
    const size = opts.size ?? 10;
    const font = opts.font ?? this.fonts.regular;
    const x = opts.x ?? MARGIN;
    const maxWidth = opts.maxWidth ?? this.width - (x - MARGIN);
    const lineHeight = size * 1.3;
    for (const line of wrap(content, font, size, maxWidth)) {
      this.ensure(lineHeight);
      const lineX = opts.align === "center" ? MARGIN + (this.width - font.widthOfTextAtSize(line, size)) / 2 : x;
      this.page.drawText(line, { x: lineX, y: this.y - size, size, font, color: this.color(opts.color ?? INK) });
      this.y -= lineHeight;
    }
    this.y -= opts.gapAfter ?? 0;
  }

  /** "Libellé : valeur" pair, label in muted small caps style. */
  field(label: string, value: string) {
    this.text(label, { size: 8, color: MUTED });
    this.text(value || "—", { size: 10.5, gapAfter: 6 });
  }

  heading(title: string, subtitle?: string) {
    this.ensure(50);
    this.text(title, { size: 15, font: this.fonts.bold });
    if (subtitle) this.text(subtitle, { size: 9, font: this.fonts.italic, color: MUTED });
    this.y -= 4;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + this.width, y: this.y }, thickness: 0.8, color: this.color(RULE) });
    this.y -= 12;
  }

  gap(h: number) {
    this.y -= h;
  }

  box(x: number, y: number, w: number, h: number, fill?: typeof SHADE) {
    this.page.drawRectangle({ x, y, width: w, height: h, borderWidth: 0.6, borderColor: this.color(RULE), color: fill ? this.color(fill) : undefined });
  }

  table(columns: Column[], rows: Cell[][], opts: { size?: number; minRowHeight?: number } = {}) {
    const size = opts.size ?? 8;
    const pad = 3;
    const lineHeight = size * 1.25;
    const minRow = opts.minRowHeight ?? 16;
    const widths = columns.map((c) => c.width * this.width);

    const drawHeader = () => {
      const headerLines = columns.map((c, i) => wrap(c.header, this.fonts.bold, size, widths[i] - 2 * pad));
      const h = Math.max(...headerLines.map((l) => l.length)) * lineHeight + 2 * pad;
      this.ensure(h + minRow);
      let x = MARGIN;
      columns.forEach((c, i) => {
        this.box(x, this.y - h, widths[i], h, SHADE);
        headerLines[i].forEach((line, j) => {
          const lw = this.fonts.bold.widthOfTextAtSize(line, size);
          const hx = c.align === "right" ? x + widths[i] - pad - lw : c.align === "center" ? x + (widths[i] - lw) / 2 : x + pad;
          this.page.drawText(line, { x: hx, y: this.y - pad - (j + 1) * lineHeight + 2, size, font: this.fonts.bold, color: this.color(INK) });
        });
        x += widths[i];
      });
      this.y -= h;
    };

    drawHeader();
    for (const row of rows) {
      const cellLines = row.map((cell, i) => (cell.text ? wrap(cell.text, cell.bold ? this.fonts.bold : this.fonts.regular, size, widths[i] - 2 * pad) : []));
      const h = Math.max(minRow, ...cellLines.map((l) => l.length * lineHeight + 2 * pad));
      if (this.y - h < MARGIN + 14) {
        this.newPage(this.landscape);
        drawHeader();
      }
      let x = MARGIN;
      row.forEach((cell, i) => {
        this.box(x, this.y - h, widths[i], h);
        const align = columns[i].align ?? "left";
        cellLines[i].forEach((line, j) => {
          const font = cell.bold ? this.fonts.bold : this.fonts.regular;
          const w = font.widthOfTextAtSize(line, size);
          const tx = align === "right" ? x + widths[i] - pad - w : align === "center" ? x + (widths[i] - w) / 2 : x + pad;
          this.page.drawText(line, { x: tx, y: this.y - pad - (j + 1) * lineHeight + 2, size, font, color: this.color(INK) });
        });
        if (cell.image) {
          const maxW = widths[i] - 2 * pad;
          const maxH = h - 2 * pad;
          const scale = Math.min(maxW / cell.image.width, maxH / cell.image.height);
          const iw = cell.image.width * scale;
          const ih = cell.image.height * scale;
          this.page.drawImage(cell.image, { x: x + (widths[i] - iw) / 2, y: this.y - h + (h - ih) / 2, width: iw, height: ih });
        }
        x += widths[i];
      });
      this.y -= h;
    }
    this.y -= 10;
  }
}

async function createDoc(title: string) {
  const lib = await import("pdf-lib");
  const doc = await lib.PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator("PreOx — Carnet de stage");
  const fonts: Fonts = {
    regular: await doc.embedFont(lib.StandardFonts.Helvetica),
    bold: await doc.embedFont(lib.StandardFonts.HelveticaBold),
    italic: await doc.embedFont(lib.StandardFonts.HelveticaOblique),
  };
  return { doc, writer: new Writer(doc, fonts, lib.rgb), lib };
}

function numberPages(doc: PDFDocument, font: PDFFont, rgbFn: (r: number, g: number, b: number) => ReturnType<typeof import("pdf-lib").rgb>) {
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const label = `${i + 1} / ${pages.length}`;
    page.drawText(label, { x: page.getWidth() - MARGIN - font.widthOfTextAtSize(label, 8), y: 20, size: 8, font, color: rgbFn(MUTED.r, MUTED.g, MUTED.b) });
  });
}

function fullName(data: CarnetData): string {
  return [data.profile?.first_name, data.profile?.last_name].filter(Boolean).join(" ");
}

function stagePeriod(stage: CarnetStage): string {
  return `du ${formatDateFr(stage.start_date)} au ${stage.end_date ? formatDateFr(stage.end_date) : "…"}`;
}

/** The two "Stages hospitaliers" pages for one stage — header pre-filled, grid blank, for the maître de stage to fill in by hand. */
function drawEvaluationGrid(w: Writer, data: CarnetData, stage: CarnetStage) {
  w.newPage();
  w.heading("Stages hospitaliers en anesthésiologie ou réanimation", "Anaesthesia or Intensive Care Hospital Training");
  const coordinator = data.supervisors.find((s) => s.id === stage.coordinator_id);
  const rows: [string, string][] = [
    ["Nom et prénom du MSF", fullName(data)],
    ["Année de formation", `${stage.training_year}${stage.training_year === 1 ? "re" : "e"} année`],
    ["Date", stagePeriod(stage)],
    ["Lieu de stage", [stage.hospital, stage.city].filter(Boolean).join(", ")],
    ["Secteur", stage.sector],
    ["Maître de stage", supervisorName(coordinator)],
  ];
  for (const [label, value] of rows) w.text(`${label} : ${value || "……………………………………"}`, { size: 10, gapAfter: 1 });
  w.gap(6);
  w.text(
    "Utilisation de la grille : cotation sur une échelle de 1 à 5 : ≤ 2 : échec, 3 : satisfaisant pour le niveau de formation, 4 : niveau supérieur pour l'année de formation, 5 : niveau exceptionnel pour l'année de formation.",
    { size: 8.5, font: w.fonts.italic, gapAfter: 8 }
  );
  const columns: Column[] = [
    { header: "", width: 0.64 },
    ...["1", "2", "3", "4", "5", "N/A*"].map((h) => ({ header: h, width: 0.06, align: "center" as const })),
  ];
  for (const section of EVALUATION_GRID) {
    columns[0] = { header: section.title, width: 0.64 };
    w.table(columns, [...section.items.map((item) => [{ text: item }, {}, {}, {}, {}, {}, {}]), [{ text: section.overall, bold: true }, {}, {}, {}, {}, {}, {}]], { size: 8, minRowHeight: 17 });
  }
  w.ensure(150);
  w.text("CONCLUSION", { size: 10, font: w.fonts.bold });
  w.text("Le niveau de compétence actuel est évalué par rapport à son année de formation comme :", { size: 9 });
  w.text(COMPETENCE_LEVELS.join("  ·  "), { size: 8.5, color: MUTED, gapAfter: 4 });
  w.text("Note : ……… / 5", { size: 10, gapAfter: 8 });
  w.text("APPRÉCIATION GLOBALE : ……… / 100", { size: 10, font: w.fonts.bold, gapAfter: 8 });
  w.text("COMMENTAIRES", { size: 10, font: w.fonts.bold });
  w.ensure(110);
  w.box(MARGIN, w.y - 100, w.width, 100);
  w.gap(108);
  w.text("* N/A : non applicable, non évaluable", { size: 8, color: MUTED, gapAfter: 10 });
  w.ensure(60);
  w.text("Date : …………………………………", { size: 10, gapAfter: 14 });
  const y = w.y;
  w.page.drawText(toWinAnsi("Signature du Maître de Stage"), { x: MARGIN, y: y - 10, size: 10, font: w.fonts.regular, color: w.color(INK) });
  w.page.drawText(toWinAnsi("Signature du/de la candidat(e)"), { x: MARGIN + w.width / 2, y: y - 10, size: 10, font: w.fonts.regular, color: w.color(INK) });
  w.gap(50);
}

function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Blank evaluation grid for one stage, header pre-filled — to print and hand to the maître de stage. */
export async function buildEvaluationGridPdf(data: CarnetData, stage: CarnetStage): Promise<Uint8Array> {
  const { doc, writer, lib } = await createDoc(`Grille d'évaluation — ${stage.hospital}`);
  drawEvaluationGrid(writer, data, stage);
  numberPages(doc, writer.fonts.regular, lib.rgb);
  return doc.save();
}

export async function downloadEvaluationGrid(data: CarnetData, stage: CarnetStage): Promise<void> {
  downloadPdf(await buildEvaluationGridPdf(data, stage), `grille-evaluation-${slug(stage.hospital)}-${stage.start_date}.pdf`);
}

function inRange(date: string | null, from: string, to: string): boolean {
  return !date || (date >= from && date <= to);
}

/**
 * The whole carnet, for one training year (the carnet is sent yearly) or
 * for the whole training. The activity report and the absence summary
 * always cover every year, as the official form asks.
 */
export async function downloadCarnet(data: CarnetData, trainingYear: number | "all"): Promise<void> {
  const name = fullName(data);
  downloadPdf(await buildCarnetPdf(data, trainingYear), `carnet-de-stage-${trainingYear === "all" ? "complet" : `annee-${trainingYear}`}${name ? `-${slug(name)}` : ""}.pdf`);
}

export async function buildCarnetPdf(data: CarnetData, trainingYear: number | "all"): Promise<Uint8Array> {
  const { doc, writer: w, lib } = await createDoc("Carnet de stage — Anesthésie-Réanimation");
  const stages = sortStages(data.stages)
    .reverse()
    .filter((s) => trainingYear === "all" || s.training_year === trainingYear);
  const stageIds = new Set(stages.map((s) => s.id));
  const from = stages[0]?.start_date ?? "0000-01-01";
  const to = stages.reduce((max, s) => (s.end_date && s.end_date > max ? s.end_date : max), stages.at(-1)?.end_date ?? "9999-12-31");
  const name = fullName(data);
  const numbers = caseNumbers(data.cases, data.stages);
  const supervisors = new Map(data.supervisors.map((s) => [s.id, s]));
  const stageById = new Map(data.stages.map((s) => [s.id, s]));
  const signatureImages = new Map<string, PDFImage>();
  for (const s of data.signatures) {
    try {
      signatureImages.set(s.id, await doc.embedPng(s.image));
    } catch {
      // Unreadable image — the row keeps the signer's name and date instead.
    }
  }
  const signatures = new Map(data.signatures.map((s) => [s.id, s]));

  // --- Cover ---------------------------------------------------------------
  w.newPage();
  for (const line of [
    "MINISTÈRE DE LA FÉDÉRATION WALLONIE-BRUXELLES",
    "Administration générale de l'Enseignement (AGE)",
    "Direction de l'Agrément des Prestataires de Soins de Santé",
    "Commission d'agrément en anesthésie – réanimation",
  ]) {
    w.text(line, { size: 9, color: MUTED });
  }
  w.gap(60);
  w.text("CARNET DE STAGE", { size: 26, font: w.fonts.bold, align: "center" });
  w.text("ANESTHÉSIE – RÉANIMATION", { size: 16, align: "center", gapAfter: 10 });
  w.text(trainingYear === "all" ? "Ensemble de la formation" : `${trainingYear}${trainingYear === 1 ? "re" : "e"} année`, { size: 13, font: w.fonts.bold, align: "center", gapAfter: 30 });
  w.text(
    "Ce carnet de stage doit être renvoyé à la fin de l'année de stage à l'Administration de la Fédération Wallonie-Bruxelles au plus tard six mois après l'achèvement de l'année de stage, à l'adresse : Direction de l'Agrément des Prestataires de Soins de Santé — Commission d'agrément en Anesthésie-Réanimation, Rue Adolphe Lavallée 1, 1080 Bruxelles.",
    { size: 9, gapAfter: 16 }
  );
  w.text(`Je, soussigné(e), ${name || "……………………………………"}, déclare que les informations contenues dans le présent formulaire sont exactes.`, { size: 10, gapAfter: 8 });
  w.text(`Date : ${formatDateFr(localDateIso())}`, { size: 10, gapAfter: 4 });
  w.text("Signature :", { size: 10, gapAfter: 30 });
  w.table(
    [
      { header: "Période de stage", width: 0.3 },
      { header: "Lieu de stage", width: 0.45 },
      { header: "Activité", width: 0.25 },
    ],
    stages.map((s) => [{ text: stagePeriod(s) }, { text: [s.hospital, s.sector, s.city].filter(Boolean).join(" – ") }, { text: s.activity }]),
    { size: 9, minRowHeight: 18 }
  );
  const coordinators = [...new Set(stages.map((s) => supervisorName(supervisors.get(s.coordinator_id ?? ""))).filter(Boolean))];
  w.text(`Maître de stage coordinateur : ${coordinators.join(", ") || "……………………………………"}          Signature :`, { size: 10 });

  // --- Contents ------------------------------------------------------------
  w.newPage();
  w.heading("Table des matières", "Contents");
  [
    "I. Identification",
    "II. Stages hospitaliers en anesthésiologie ou réanimation",
    "III. Activités connexes",
    "IV. Cours suivis",
    "V. Présentations de séminaires",
    "VI. Publications ou communications",
    "VII. Relevé des prestations",
    "VIII. Journal de gardes",
    "Rapport d'activité",
    "IX. Évaluation personnelle",
    "Récapitulatif des absences",
  ].forEach((line) => w.text(line, { size: 11, gapAfter: 4 }));

  // --- I. Identification -----------------------------------------------------
  w.newPage();
  w.heading("I. Identification", "Union européenne des médecins spécialistes — Spécialité : Anesthésiologie – Réanimation");
  const p = data.profile;
  w.field("Nom / Name", p?.last_name ?? "");
  w.field("Prénom(s) / Christian name", p?.first_name ?? "");
  w.field("Nationalité / Nationality", p?.nationality ?? "");
  w.field("Lieu et date de naissance / Place and date of birth", [p?.birth_place, formatDateFr(p?.birth_date)].filter(Boolean).join(", "));
  w.field(
    "Adresse et changements éventuels / Address, changes if any",
    (p?.addresses ?? []).map((a) => (a.since ? `${a.address} (depuis le ${formatDateFr(a.since)})` : a.address)).join("\n")
  );
  w.field("Diplôme de médecine de l'université de / Qualifying diploma", p?.university ?? "");
  w.field("Année de diplôme / Year of qualification", p?.graduation_year ? String(p.graduation_year) : "");
  w.field("Activités professionnelles depuis la fin de l'université jusqu'au début des stages", p?.pre_training_activities ?? "");
  w.field("Adresse mail · Téléphone", [p?.email, p?.phone].filter(Boolean).join(" · "));

  // --- II. Evaluation grids ----------------------------------------------------
  for (const stage of stages) drawEvaluationGrid(w, data, stage);

  // --- III. Related activities ------------------------------------------------
  w.newPage();
  w.heading("III. Activités connexes", "Services d'aide médicale urgente, travaux de laboratoire, clinique de la douleur, acupuncture, etc.");
  const activities = data.related_activities.filter((a) => trainingYear === "all" || inRange(a.start_date, from, to)).sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""));
  if (activities.length === 0) w.text("Aucune.", { color: MUTED });
  for (const a of activities) {
    w.ensure(120);
    w.field("Nature", a.nature);
    w.field("Institution · Ville", [a.institution, a.city].filter(Boolean).join(" · "));
    w.field("Date", a.start_date || a.end_date ? `du ${formatDateFr(a.start_date)} au ${formatDateFr(a.end_date)}` : "");
    w.field("Appréciation", a.appraisal);
    w.text(`Médecin responsable : ${a.responsible || "……………………"}          Signature :`, { size: 10, gapAfter: 14 });
  }

  // --- IV / V. Courses and seminars ---------------------------------------------
  w.newPage(true);
  w.heading("IV. Cours suivis", "Attended courses");
  const courses = data.courses.filter((c) => trainingYear === "all" || inRange(c.start_date, from, to)).sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""));
  w.table(
    [
      { header: "Dates", width: 0.13 },
      { header: "Ville", width: 0.1 },
      { header: "Institution", width: 0.15 },
      { header: "Sujet", width: 0.27 },
      { header: "Examens / Résultats", width: 0.11 },
      { header: "Chargé d'enseignement", width: 0.13 },
      { header: "Signature", width: 0.11 },
    ],
    courses
      .filter((c) => c.kind === "course")
      .map((c) => [
        { text: c.end_date && c.end_date !== c.start_date ? `${formatDateFr(c.start_date)} – ${formatDateFr(c.end_date)}` : formatDateFr(c.start_date) },
        { text: c.city },
        { text: c.institution },
        { text: c.subject },
        { text: c.exam_result },
        { text: c.teacher },
        {},
      ]),
    { minRowHeight: 22 }
  );
  w.heading("V. Présentations de séminaires", "Presentations at seminars");
  w.table(
    [
      { header: "Date", width: 0.11 },
      { header: "Ville", width: 0.12 },
      { header: "Institution", width: 0.17 },
      { header: "Sujet", width: 0.33 },
      { header: "Professeur", width: 0.15 },
      { header: "Signature", width: 0.12 },
    ],
    courses.filter((c) => c.kind === "seminar").map((c) => [{ text: formatDateFr(c.start_date) }, { text: c.city }, { text: c.institution }, { text: c.subject }, { text: c.teacher }, {}]),
    { minRowHeight: 22 }
  );

  // --- VI. Publications ---------------------------------------------------------
  w.newPage();
  w.heading("VI. Publications ou communications", "Papers read or published");
  const publications = data.publications.filter((pub) => trainingYear === "all" || inRange(pub.pub_date, from, to)).sort((a, b) => (a.pub_date ?? "").localeCompare(b.pub_date ?? ""));
  if (publications.length === 0) w.text("Aucune.", { color: MUTED });
  publications.forEach((pub, i) => {
    w.text(`${i + 1}. ${pub.title}${pub.pub_date ? ` (${formatDateFr(pub.pub_date)})` : ""}`, { size: 10, font: w.fonts.bold });
    if (pub.details) w.text(pub.details, { size: 9, color: MUTED });
    w.gap(6);
  });

  // --- VII. Record of cases -------------------------------------------------------
  w.newPage();
  w.heading("VII. Relevé des prestations", "Record of cases — explications pour la colonne 6 (catégorie/degré)");
  w.table(
    [
      { header: "Catégorie", width: 0.15, align: "center" },
      { header: "Signification", width: 0.85 },
    ],
    [
      ...OPERATION_CATEGORIES.map((c) => [{ text: c.code === "X" ? "(X)" : c.code }, { text: c.label }]),
      [{ text: "H" }, { text: "Pédiatrie (moins de 4 ans) — ajouté après la catégorie" }],
      [{ text: "N" }, { text: "Anesthésie générale ou sédation" }],
      [{ text: "O" }, { text: "Anesthésie loco-régionale" }],
      [{ text: "P" }, { text: "Anesthésie péridurale" }],
      [{ text: "T" }, { text: "Acte technique seul (voie centrale, échographie, intubation difficile…)" }],
    ],
    { size: 9 }
  );
  w.text("Degré de participation : " + PARTICIPATION_DEGREES.map((d) => `${d.code} = ${d.label}`).join(" · "), { size: 9, gapAfter: 4 });
  w.text("Exemple : opération césarienne sous anesthésie péridurale supervisée : BP2", { size: 9, font: w.fonts.italic });

  const cases = data.cases
    .filter((c) => stageIds.has(c.stage_id))
    .sort((a, b) => a.case_date.localeCompare(b.case_date) || a.created_at.localeCompare(b.created_at));
  w.newPage(true);
  w.heading("VII. Relevé des prestations", "Record of cases");
  w.table(
    [
      { header: "N°", width: 0.05, align: "right" },
      { header: "Date", width: 0.09 },
      { header: "Hôpital", width: 0.15 },
      { header: "Initiales patient", width: 0.08 },
      { header: "Opération", width: 0.26 },
      { header: "Catégorie / Degré", width: 0.09, align: "center" },
      { header: "Tuteur (S.C.T.)", width: 0.15 },
      { header: "Signature", width: 0.13 },
    ],
    cases.map((c) => {
      const signature = c.signature_id ? signatures.get(c.signature_id) : undefined;
      const image = c.signature_id ? signatureImages.get(c.signature_id) : undefined;
      return [
        { text: String(numbers.get(c.id) ?? "") },
        { text: formatDateFr(c.case_date) },
        { text: stageById.get(c.stage_id)?.hospital ?? "" },
        { text: c.patient_initials },
        { text: c.operation },
        { text: caseCode(c) },
        { text: supervisorName(supervisors.get(c.tutor_id ?? "")) },
        image ? { image } : { text: signature ? `${signature.supervisor_name}, ${formatDateFr(signature.signed_at.slice(0, 10))}` : "" },
      ];
    }),
    { size: 8, minRowHeight: 20 }
  );

  // --- VIII. Days of duty ------------------------------------------------------------
  w.newPage(true);
  w.heading("VIII. Journal de gardes", "Days of duty");
  const duties = data.duties.filter((d) => stageIds.has(d.stage_id)).sort((a, b) => a.duty_date.localeCompare(b.duty_date));
  w.table(
    [
      { header: "Date", width: 0.1 },
      { header: "Ville", width: 0.13 },
      { header: "Institution", width: 0.22 },
      { header: "Type", width: 0.13 },
      { header: "Chef de service", width: 0.24 },
      { header: "Signature", width: 0.18 },
    ],
    duties.map((d) => {
      const image = d.signature_id ? signatureImages.get(d.signature_id) : undefined;
      const signature = d.signature_id ? signatures.get(d.signature_id) : undefined;
      return [
        { text: formatDateFr(d.duty_date) },
        { text: d.city },
        { text: d.institution },
        { text: d.duty_type === "on_site" ? "Sur place" : "À domicile" },
        { text: d.head_of_department },
        image ? { image } : { text: signature?.supervisor_name ?? "" },
      ];
    }),
    { size: 8, minRowHeight: 20 }
  );

  // --- Activity report (whole training) ------------------------------------------------
  w.newPage(true);
  w.heading("Rapport d'activité", "À compléter pour l'ensemble de la formation");
  for (const section of activityReport(data)) {
    w.table(
      [
        { header: section.title, width: 0.52 },
        ...Array.from({ length: REPORT_YEARS }, (_, i) => ({ header: `Année ${i + 1}`, width: 0.08, align: "right" as const })),
        { header: "TOTAL", width: 0.08, align: "right" as const },
      ],
      section.rows.map((r) => [{ text: r.label, bold: r.emphasis }, ...r.byYear.map((n) => ({ text: n ? String(n) : "" })), { text: String(r.total), bold: true }]),
      { size: 8, minRowHeight: 14 }
    );
  }
  w.gap(10);
  w.text("Date et signature du candidat                    Signature du Maître de stage coordinateur                    Signature du Maître de stage local", { size: 9 });

  // --- IX. Personal evaluation -------------------------------------------------------------
  for (const stage of stages) {
    const review = data.stage_reviews.find((r) => r.stage_id === stage.id);
    w.newPage();
    w.heading("IX. Évaluation personnelle", "Personal report");
    w.field("Lieu de stage / Training place", `${[stage.hospital, stage.sector].filter(Boolean).join(" – ")} (${stagePeriod(stage)})`);
    w.field("Impression globale du stage", review?.global_impression ?? "");
    w.field("Ce que vous avez aimé", review?.liked ?? "");
    w.field("Ce que vous n'avez pas aimé", review?.disliked ?? "");
    w.field("Que changeriez-vous résolument si on vous en donnait la possibilité ?", review?.would_change ?? "");
    w.field("Si vous en aviez l'occasion, y retourneriez-vous en stage ?", review?.would_return === null || review?.would_return === undefined ? "" : review.would_return ? "OUI" : "NON");
    const score = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
    w.table(
      [
        { header: "", width: 0.85 },
        { header: "COTE", width: 0.15, align: "center" },
      ],
      [
        [{ text: "Le travail clinique vous a paru intéressant (0 pas du tout – 10 exceptionnellement intéressant)" }, { text: score(review?.score_interest) }],
        [{ text: "Les diplômés assurant votre encadrement ont-ils fourni une guidance clinique (0 insuffisante – 10 excellente)" }, { text: score(review?.score_clinical_guidance) }],
        [{ text: "L'ambiance de travail vous a paru (0 exécrable – 10 idyllique)" }, { text: score(review?.score_atmosphere) }],
        [{ text: "Les diplômés assurant votre encadrement vous ont-ils fourni une guidance théorique (0 jamais – 10 en permanence)" }, { text: score(review?.score_theoretical_guidance) }],
        [
          { text: "Responsabilités cliniques confiées : de -5 (beaucoup trop peu) à +5 (beaucoup trop), l'idéal se situant à 0" },
          { text: review?.score_responsibilities === null || review?.score_responsibilities === undefined ? "" : `${review.score_responsibilities > 0 ? "+" : ""}${review.score_responsibilities}` },
        ],
      ],
      { size: 9, minRowHeight: 22 }
    );
  }

  // --- Absences (whole training) -------------------------------------------------------------
  w.newPage();
  w.heading("Récapitulatif des absences", "À compléter pour l'ensemble de la formation");
  const years = Array.from({ length: Math.max(REPORT_YEARS, ...data.years.map((y) => y.training_year)) }, (_, i) => i + 1);
  const yearRow = new Map(data.years.map((y) => [y.training_year, y]));
  w.table(
    [{ header: "", width: 0.1, align: "center" }, ...years.map((y) => ({ header: `Année ${y}`, width: 0.9 / years.length, align: "right" as const }))],
    ABSENCE_CATEGORIES.map((c) => [{ text: c.code, bold: true }, ...years.map((y) => ({ text: yearRow.get(y)?.absences[c.code] !== undefined ? String(yearRow.get(y)!.absences[c.code]).replace(".", ",") : "" }))]),
    { size: 9, minRowHeight: 18 }
  );
  for (const c of ABSENCE_CATEGORIES) w.text(`${c.code} = ${c.label}`, { size: 8.5 });
  w.text("En jours de travail (1 par journée pleine, 0,5 par demi-jour).", { size: 8.5, font: w.fonts.italic, gapAfter: 16 });
  w.text(`NOM : ${p?.last_name ?? ""}`, { size: 10 });
  w.text(`Prénom : ${p?.first_name ?? ""}`, { size: 10 });
  w.text(`Adresse mail : ${p?.email ?? ""}`, { size: 10 });
  w.text(`Téléphone : ${p?.phone ?? ""}`, { size: 10 });

  numberPages(doc, w.fonts.regular, lib.rgb);
  return doc.save();
}
