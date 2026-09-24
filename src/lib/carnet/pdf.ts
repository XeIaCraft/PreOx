"use client";

// PDF export of the carnet, generated on the device with pdf-lib (loaded
// on demand) — works offline, nothing to wait for on the server.
//
// The official form itself is the page: public/carnet/modele-carnet-de-stage.pdf
// is the Commission's .doc (Carnet_de_stage_anesthesie-reanimation.doc)
// converted to PDF as is, and every page of the export is one of its pages
// with the candidate's data written on top, where a pen would go — nothing
// of the form is redrawn or re-laid out. Pages meant to be repeated
// (evaluation grid per stage, record of cases, duties, related activities,
// personal evaluation per stage) are repeated like photocopies of the
// blank page. Text is set in Carlito (metric twin of the form's Calibri),
// in a pen blue. A field whose text doesn't fit its space, even smaller,
// is cut and continued in full in an annex at the end.
import type { PDFDocument, PDFEmbeddedPage, PDFFont, PDFImage, PDFPage } from "pdf-lib";
import { caseCode, supervisorName } from "./referentiel";
import { activityReport, caseNumbers, formatDateFr, localDateIso, REPORT_YEARS, sortStages } from "./logic";
import type { CarnetData, CarnetStage } from "./types";

export const TEMPLATE_URL = "/carnet/modele-carnet-de-stage.pdf";
export const FONT_URL = "/carnet/carlito.ttf";

export interface CarnetPdfAssets {
  template: ArrayBuffer | Uint8Array;
  font: ArrayBuffer | Uint8Array;
}

let assetsPromise: Promise<CarnetPdfAssets> | null = null;

/** The blank form and its font, fetched once (and kept by the service worker for offline exports). */
export function loadCarnetPdfAssets(): Promise<CarnetPdfAssets> {
  if (!assetsPromise) {
    const get = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      return res.arrayBuffer();
    };
    assetsPromise = Promise.all([get(TEMPLATE_URL), get(FONT_URL)])
      .then(([template, font]) => ({ template, font }))
      .catch((err) => {
        assetsPromise = null;
        throw err;
      });
  }
  return assetsPromise;
}

// ---------------------------------------------------------------------------
// Template geometry — measured on the form (points, origin top-left).
// ---------------------------------------------------------------------------

/** 0-based page indexes in the template. */
const TPL = {
  cover: 0,
  declaration: 1,
  contents: 2,
  identification: 3,
  grid: [4, 5],
  activity: 6,
  courses: 8,
  seminars: 9,
  publications: 10,
  legend: 11,
  casesFirst: 12,
  cases: 13,
  duties: 28,
  report: [32, 33, 34],
  review: 35,
  absences: 36,
} as const;

const CASES_TABLE = { cols: [36.9, 79.4, 157.4, 277.9, 355.8, 502.7, 590.2, 677.7, 809.4], top: 133.3, rowHeight: 31, rows: 12 };
const DUTIES_TABLE = { cols: [65.5, 205.4, 345.3, 485.3, 625.2, 765.2], top: 106.4, rowHeight: 31, rows: 13 };
const COURSES_TABLE = { cols: [65.5, 165.4, 265.4, 365.3, 465.3, 565.2, 665.2, 765.2], top: 210.4, rowHeight: 13.95, rows: 21 };
const SEMINARS_TABLE = { cols: [65.5, 182.1, 298.7, 415.3, 531.9, 648.5, 765.2], top: 161.3, rowHeight: 13.95, rows: 24 };
const DECLARATION_ROWS = [455.7, 483.2, 511.5, 539.0, 567.3, 595.6, 623.9];
const DECLARATION_COLS = [65.5, 191.4, 425.3, 538.4];

/** Rapport d'activité: row key (logic.activityReport) → [report page 0..2, top, bottom]. */
const REPORT_ROWS: Record<string, [number, number, number]> = {
  cat_A: [0, 117.6, 133.3],
  cat_B: [0, 133.3, 149.1],
  cat_C: [0, 149.1, 164.8],
  cat_D: [0, 164.8, 180.6],
  cat_E: [0, 180.6, 196.3],
  cat_F: [0, 196.3, 212.1],
  cat_G: [0, 212.1, 227.8],
  cat_I: [0, 227.8, 243.6],
  cat_J1: [0, 243.6, 259.3],
  cat_J2: [0, 259.3, 275.1],
  cat_K: [0, 275.1, 290.8],
  cat_L: [0, 290.8, 306.6],
  cat_X: [0, 306.6, 323.1],
  total1: [0, 323.3, 339.6],
  H: [0, 339.8, 366.2],
  N: [0, 400.7, 416.5],
  alr_plexus_brachial: [0, 416.5, 432.2],
  alr_membre_inferieur: [0, 432.2, 462.0],
  alr_caudale: [0, 462.0, 477.8],
  alr_peridurale: [0, 477.8, 493.5],
  alr_alriv: [0, 493.5, 509.3],
  alr_rachianesthesie: [1, 87.0, 102.8],
  alr_autre_alr: [1, 102.8, 118.5],
  alr_total: [1, 118.5, 134.3],
  act_voie_centrale: [1, 134.3, 150.0],
  act_autres: [1, 150.0, 166.5],
  total2: [1, 166.7, 183.0],
  counter_soins_intensifs: [1, 217.5, 233.3],
  counter_smur: [1, 233.3, 249.0],
  counter_smur_intra: [1, 249.0, 278.8],
  counter_urgences_extra: [1, 278.8, 308.6],
  counter_analgesie_aigue: [1, 308.6, 338.4],
  counter_uspa: [1, 338.4, 368.2],
  counter_algologie: [1, 368.2, 384.0],
  counter_consultations_preop: [1, 384.0, 413.8],
  echo_alr: [1, 413.8, 429.5],
  echo_vasculaire: [1, 429.5, 445.3],
  echo_cardiaque: [1, 445.3, 461.0],
  fibroscopie: [1, 461.0, 476.8],
  videolaryngoscope: [1, 476.8, 492.5],
  intubation_difficile_autre: [1, 492.5, 508.3],
  duty_on_site: [2, 153.1, 168.8],
  duty_on_call: [2, 168.8, 185.3],
  duty_total: [2, 185.5, 201.8],
};
const REPORT_YEAR_COLS = [375.7, 443.7, 511.7, 579.8, 647.8, 715.9];
const REPORT_DUTY_YEAR_COLS = [375.7, 432.4, 478.8, 531.6, 578.0, 715.9];
const REPORT_TOTAL_COL: [number, number] = [715.9, 760.7];

const PEN = { r: 0.07, g: 0.16, b: 0.52 };

// ---------------------------------------------------------------------------
// Writing on a template page
// ---------------------------------------------------------------------------

interface Overflow {
  where: string;
  text: string;
}

interface Ctx {
  lib: typeof import("pdf-lib");
  doc: PDFDocument;
  font: PDFFont;
  pages: Map<number, PDFEmbeddedPage>;
  glyphs: Set<number>;
  overflow: Overflow[];
  images: Map<string, PDFImage>;
}

interface TextOpts {
  size?: number;
  /** Smallest size tried before cutting the text. */
  minSize?: number;
  align?: "left" | "center" | "right";
  /** Horizontal span [x0, x1] of the form's dotted line to blank out before writing — like typing into the form. */
  clear?: [number, number];
  /** Name of the field, for the annex if the text doesn't fit. */
  where?: string;
}

/** Characters the embedded font has no glyph for become their unaccented form, or disappear (emoji…). */
function printable(ctx: Ctx, input: string): string {
  let out = "";
  for (const ch of input.replace(/\r/g, "").replace(/\t/g, " ")) {
    if (ch === "\n" || ctx.glyphs.has(ch.codePointAt(0)!)) out += ch;
    else {
      const stripped = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (stripped && [...stripped].every((c) => ctx.glyphs.has(c.codePointAt(0)!))) out += stripped;
    }
  }
  return out;
}

function wrapLines(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (let word of words) {
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
  while (lines.length > 1 && lines.at(-1) === "") lines.pop();
  return lines;
}

class Sheet {
  constructor(
    readonly page: PDFPage,
    private ctx: Ctx
  ) {}

  private get height() {
    return this.page.getHeight();
  }

  private color() {
    return this.ctx.lib.rgb(PEN.r, PEN.g, PEN.b);
  }

  whiteout(x0: number, top: number, x1: number, bottom: number) {
    this.page.drawRectangle({ x: x0, y: this.height - bottom, width: x1 - x0, height: bottom - top, color: this.ctx.lib.rgb(1, 1, 1) });
  }

  /** One line of text on a baseline; shrinks down to minSize to fit maxWidth, then cuts (full text to the annex). */
  line(raw: string | null | undefined, x: number, baseline: number, maxWidth: number, opts: TextOpts = {}) {
    const text = printable(this.ctx, (raw ?? "").replace(/\s*\n\s*/g, " ").trim());
    if (!text) return;
    const font = this.ctx.font;
    let size = opts.size ?? 10;
    const minSize = opts.minSize ?? Math.min(size, 7);
    while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.25;
    let shown = text;
    if (font.widthOfTextAtSize(shown, size) > maxWidth) {
      while (shown.length > 1 && font.widthOfTextAtSize(`${shown}…`, size) > maxWidth) shown = shown.slice(0, -1);
      shown = `${shown.trimEnd()}…`;
      if (opts.where) this.ctx.overflow.push({ where: opts.where, text });
    }
    const width = font.widthOfTextAtSize(shown, size);
    const left = opts.align === "center" ? x + (maxWidth - width) / 2 : opts.align === "right" ? x + maxWidth - width : x;
    if (opts.clear) this.whiteout(opts.clear[0], baseline - 9.5, opts.clear[1], baseline + 3);
    this.page.drawText(shown, { x: left, y: this.height - baseline, size, font, color: this.color() });
  }

  /** Wrapped text in a box; shrinks, then cuts (full text to the annex). */
  box(raw: string | null | undefined, x0: number, top: number, x1: number, bottom: number, opts: TextOpts & { valign?: "top" | "middle" } = {}) {
    const text = printable(this.ctx, (raw ?? "").trim());
    if (!text) return;
    const font = this.ctx.font;
    const width = x1 - x0;
    const height = bottom - top;
    let size = opts.size ?? 10;
    const minSize = opts.minSize ?? Math.min(size, 7);
    const leading = (s: number) => s * 1.18;
    let lines = wrapLines(font, text, size, width);
    while (size > minSize && lines.length * leading(size) > height) {
      size -= 0.25;
      lines = wrapLines(font, text, size, width);
    }
    const capacity = Math.max(1, Math.floor(height / leading(size)));
    if (lines.length > capacity) {
      lines = lines.slice(0, capacity);
      let last = lines[capacity - 1];
      while (last.length > 1 && font.widthOfTextAtSize(`${last}…`, size) > width) last = last.slice(0, -1);
      lines[capacity - 1] = `${last.trimEnd()}…`;
      if (opts.where) this.ctx.overflow.push({ where: opts.where, text });
    }
    const blockHeight = lines.length * leading(size);
    const firstTop = opts.valign === "middle" ? top + (height - blockHeight) / 2 : top;
    lines.forEach((l, i) => {
      const w = font.widthOfTextAtSize(l, size);
      const left = opts.align === "center" ? x0 + (width - w) / 2 : opts.align === "right" ? x1 - w : x0;
      const baseline = firstTop + i * leading(size) + size * 0.92;
      this.page.drawText(l, { x: left, y: this.height - baseline, size, font, color: this.color() });
    });
  }

  /** Text in a table cell, vertically centred, with inner padding. */
  cell(text: string | null | undefined, x0: number, top: number, x1: number, bottom: number, opts: TextOpts = {}) {
    this.box(text, x0 + 3, top + 1.5, x1 - 3, bottom - 1.5, { valign: "middle", ...opts });
  }

  image(img: PDFImage, x0: number, top: number, x1: number, bottom: number) {
    const scale = Math.min((x1 - x0) / img.width, (bottom - top) / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    this.page.drawImage(img, { x: x0 + (x1 - x0 - w) / 2, y: this.height - top - (bottom - top + h) / 2, width: w, height: h });
  }

  cross(cx: number, cy: number, r: number) {
    const color = this.color();
    const y = this.height - cy;
    this.page.drawLine({ start: { x: cx - r, y: y - r }, end: { x: cx + r, y: y + r }, thickness: 1.8, color });
    this.page.drawLine({ start: { x: cx - r, y: y + r }, end: { x: cx + r, y: y - r }, thickness: 1.8, color });
  }

  ellipse(x0: number, top: number, x1: number, bottom: number) {
    this.page.drawEllipse({ x: (x0 + x1) / 2, y: this.height - (top + bottom) / 2, xScale: (x1 - x0) / 2, yScale: (bottom - top) / 2, borderColor: this.color(), borderWidth: 1.2 });
  }
}

/**
 * `pageIndexes`: the template pages the export uses — embedded all at once
 * so they share the form's fonts and images instead of copying them per page.
 */
async function createCtx(assets: CarnetPdfAssets, title: string, pageIndexes: number[]): Promise<{ ctx: Ctx; template: PDFDocument }> {
  const lib = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const template = await lib.PDFDocument.load(assets.template);
  const doc = await lib.PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(title);
  doc.setCreator("PreOx — Carnet de stage");
  doc.setProducer("PreOx");
  // Not subset: pdf-lib's subsetting drops glyphs of this font (letters vanish); the whole font compresses to ~350 KB.
  // Ligatures off: Carlito's "ti"/"fi" ligatures come out with a gap in pdf-lib's layout.
  const font = await doc.embedFont(assets.font, { features: { liga: false, clig: false, dlig: false } });
  const indexes = [...new Set(pageIndexes)];
  const embedded = await doc.embedPages(indexes.map((i) => template.getPage(i)));
  const pages = new Map(indexes.map((index, i) => [index, embedded[i]]));
  return { ctx: { lib, doc, font, pages, glyphs: new Set(font.getCharacterSet()), overflow: [], images: new Map() }, template };
}

/** A new page of the export: a copy of template page `index` (embedded once, stamped on each copy), ready to be written on. */
async function addTemplatePage(ctx: Ctx, template: PDFDocument, index: number): Promise<Sheet> {
  let embedded = ctx.pages.get(index);
  if (!embedded) {
    embedded = await ctx.doc.embedPage(template.getPage(index));
    ctx.pages.set(index, embedded);
  }
  const page = ctx.doc.addPage([embedded.width, embedded.height]);
  page.drawPage(embedded, { x: 0, y: 0 });
  return new Sheet(page, ctx);
}

async function signatureImage(ctx: Ctx, key: string, dataUrl: string | null | undefined): Promise<PDFImage | undefined> {
  if (!dataUrl) return undefined;
  if (!ctx.images.has(key)) {
    try {
      ctx.images.set(key, await ctx.doc.embedPng(dataUrl));
    } catch {
      return undefined;
    }
  }
  return ctx.images.get(key);
}

/** Fields cut on the form, in full — plain pages after the form. */
function addAnnex(ctx: Ctx) {
  if (ctx.overflow.length === 0) return;
  const { lib, doc, font } = ctx;
  const ink = lib.rgb(0.1, 0.1, 0.1);
  const [W, H] = [595.28, 841.89];
  const margin = 70.9;
  let page = doc.addPage([W, H]);
  let y = 80;
  const write = (text: string, size: number, gap: number) => {
    for (const l of wrapLines(font, printable(ctx, text), size, W - 2 * margin)) {
      if (y + size > H - 60) {
        page = doc.addPage([W, H]);
        y = 80;
      }
      page.drawText(l, { x: margin, y: H - y - size * 0.92, size, font, color: ink });
      y += size * 1.25;
    }
    y += gap;
  };
  write("Annexe — suite des champs du carnet", 16, 6);
  write("Textes trop longs pour la place prévue sur le formulaire, reproduits ici en entier.", 10, 14);
  for (const o of ctx.overflow) {
    write(o.where, 11, 2);
    write(o.text, 10, 12);
  }
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function fullName(data: CarnetData): string {
  return [data.profile?.first_name, data.profile?.last_name].filter(Boolean).join(" ");
}

function yearLabel(year: number): string {
  return `${year}${year === 1 ? "re" : "e"} année`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out.length > 0 ? out : [[]];
}

async function fillGrid(ctx: Ctx, template: PDFDocument, data: CarnetData, stage: CarnetStage) {
  const first = await addTemplatePage(ctx, template, TPL.grid[0]);
  const where = `Grille d'évaluation — ${stage.hospital}`;
  // "Nom et prénom du MSF" — the MSF (médecin spécialiste en formation) is the candidate.
  first.line(fullName(data), 186, 147.4, 314, { size: 11, clear: [183, 500.5], where });
  first.line(yearLabel(stage.training_year), 170, 174.3, 110, { size: 11, clear: [168.3, 280.5] });
  first.line(formatDateFr(stage.start_date), 365, 174.3, 54, { size: 11, clear: [363.2, 419.5] });
  if (stage.end_date) first.line(formatDateFr(stage.end_date), 437, 174.3, 64, { size: 11, clear: [435.1, 501.8] });
  first.line([stage.hospital, stage.city].filter(Boolean).join(", "), 139, 201.2, 142, { size: 11, clear: [137.2, 281.8], where });
  first.line(stage.sector, 360, 201.2, 145, { size: 11, clear: [358.2, 505.6], where });
  const second = await addTemplatePage(ctx, template, TPL.grid[1]);
  const supervisor = data.supervisors.find((s) => s.id === stage.supervisor_id);
  second.line(supervisorName(supervisor), 76, 714, 200, { size: 10 });
}

/** The two "Stages hospitaliers" pages for one stage — header filled in, grid left for the maître de stage. */
export async function buildEvaluationGridPdf(data: CarnetData, stage: CarnetStage, assets?: CarnetPdfAssets): Promise<Uint8Array> {
  const { ctx, template } = await createCtx(assets ?? (await loadCarnetPdfAssets()), `Grille d'évaluation — ${stage.hospital}`, [...TPL.grid]);
  await fillGrid(ctx, template, data, stage);
  addAnnex(ctx);
  return ctx.doc.save();
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

export async function buildCarnetPdf(data: CarnetData, trainingYear: number | "all", assets?: CarnetPdfAssets): Promise<Uint8Array> {
  const { ctx, template } = await createCtx(
    assets ?? (await loadCarnetPdfAssets()),
    "Carnet de stage — Anesthésie-Réanimation",
    Object.values(TPL).flatMap((v) => (typeof v === "number" ? [v] : [...v]))
  );
  const stages = sortStages(data.stages)
    .reverse()
    .filter((s) => trainingYear === "all" || s.training_year === trainingYear);
  const stageIds = new Set(stages.map((s) => s.id));
  const stageById = new Map(data.stages.map((s) => [s.id, s]));
  const from = stages[0]?.start_date ?? "0000-01-01";
  const to = stages.reduce((max, s) => (s.end_date && s.end_date > max ? s.end_date : max), stages.at(-1)?.end_date ?? "9999-12-31");
  const supervisors = new Map(data.supervisors.map((s) => [s.id, s]));
  const signatures = new Map(data.signatures.map((s) => [s.id, s]));
  const p = data.profile;
  const today = formatDateFr(localDateIso());
  const candidateSignature = await signatureImage(ctx, "candidate", p?.signature);

  // --- Cover: year(s) ticked, contact block -------------------------------------------------------
  const cover = await addTemplatePage(ctx, template, TPL.cover);
  const years = [...new Set(stages.map((s) => s.training_year))].sort((a, b) => a - b);
  for (const y of years) {
    const row = Math.min(y, 6) - 1;
    cover.cross(94.6, 532.8 + row * 34.8, 5.2);
    if (y > 5) cover.line(`(${yearLabel(y)})`, 182, 537 + row * 34.8, 30, { size: 11 });
  }
  cover.line(p?.last_name, 250, 504.4, 268, { size: 11 });
  cover.line(p?.first_name, 262, 526.8, 256, { size: 11 });
  cover.line(p?.email, 283, 549.1, 235, { size: 11 });
  cover.line(p?.phone, 274, 571.5, 244, { size: 11 });

  // --- Declaration + stages table + coordinator ------------------------------------------------------
  const coordinatorIds = [...new Set(stages.map((s) => s.coordinator_id).filter((id): id is string => !!id))];
  const coordinatorNames = coordinatorIds.map((id) => supervisorName(supervisors.get(id))).filter(Boolean);
  for (const [pageIndex, group] of chunk(stages, 6).entries()) {
    const page = await addTemplatePage(ctx, template, TPL.declaration);
    if (pageIndex === 0) {
      page.line(fullName(data), 134, 290.3, 162, { size: 11, clear: [131.4, 298.2] });
      page.line(today, 102, 344.1, 150, { size: 11 });
      if (candidateSignature) page.image(candidateSignature, 125, 356, 290, 402);
    }
    group.forEach((stage, i) => {
      const top = DECLARATION_ROWS[i];
      const bottom = DECLARATION_ROWS[i + 1];
      page.whiteout(DECLARATION_COLS[0] + 1, top + 1, DECLARATION_COLS[1] - 1, bottom - 1);
      page.line(`Du ${formatDateFr(stage.start_date)}`, 70.9, top + 11.5, 115, { size: 10.5 });
      page.line(`Au ${stage.end_date ? formatDateFr(stage.end_date) : "../../…."}`, 70.9, top + 23.5, 115, { size: 10.5 });
      page.cell([stage.hospital, stage.city].filter(Boolean).join(", "), DECLARATION_COLS[1], top, DECLARATION_COLS[2], bottom, { size: 10.5, minSize: 7.5, where: "Page 2 — lieu de stage" });
      page.cell(stage.sector, DECLARATION_COLS[2], top, DECLARATION_COLS[3], bottom, { size: 10.5, minSize: 7.5, where: "Page 2 — activité" });
    });
    page.line(coordinatorNames.join(" / "), 106.3, 694, 250, { size: 11 });
  }

  await addTemplatePage(ctx, template, TPL.contents);

  // --- Identification --------------------------------------------------------------------------------
  const id = await addTemplatePage(ctx, template, TPL.identification);
  id.line(p?.last_name, 230, 242.9, 295, { size: 12 });
  id.line(p?.first_name, 230, 294.2, 295, { size: 12 });
  id.line(p?.nationality, 230, 345.5, 295, { size: 12 });
  id.line([p?.birth_place, formatDateFr(p?.birth_date)].filter(Boolean).join(", "), 230, 396.8, 295, { size: 12 });
  id.box(
    (p?.addresses ?? []).map((a) => `${a.address}${a.since ? ` (depuis le ${formatDateFr(a.since)})` : ""}`).join("\n"),
    70.9,
    473,
    525,
    566,
    { size: 11.5, minSize: 8, where: "Identification — adresse et changements éventuels" }
  );
  id.line(p?.university, 306, 584.9, 219, { size: 12, where: "Identification — diplôme" });
  id.line(p?.graduation_year ? String(p.graduation_year) : "", 185, 636.2, 200, { size: 12 });
  id.box(p?.pre_training_activities, 70.9, 727, 525, 758, { size: 10, minSize: 7.5, where: "Identification — activités professionnelles avant les stages" });

  // --- Evaluation grids: one pair of pages per stage ---------------------------------------------------
  if (stages.length === 0) {
    await addTemplatePage(ctx, template, TPL.grid[0]);
    await addTemplatePage(ctx, template, TPL.grid[1]);
  }
  for (const stage of stages) await fillGrid(ctx, template, data, stage);

  // --- Related activities: one page each -----------------------------------------------------------------
  const activities = data.related_activities
    .filter((a) => trainingYear === "all" || inRange(a.start_date, from, to))
    .sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""));
  for (const a of activities.length > 0 ? activities : [null]) {
    const page = await addTemplatePage(ctx, template, TPL.activity);
    if (!a) continue;
    const where = `Activités connexes — ${a.nature}`;
    page.line(a.nature, 125, 288.9, 400, { size: 11, where });
    page.line(a.institution, 125, 329.2, 400, { size: 11, where });
    page.line(a.city, 125, 369.6, 400, { size: 11 });
    page.line(formatDateFr(a.start_date), 125, 409.9, 118, { size: 11 });
    page.line(formatDateFr(a.end_date), 270, 409.9, 120, { size: 11 });
    page.box(a.appraisal, 70.9, 469, 525, 530, { size: 10.5, minSize: 7.5, where: `${where} — appréciation` });
    page.line(a.responsible, 172, 544.4, 142, { size: 10.5, where });
  }

  // --- Courses and seminars ---------------------------------------------------------------------------------
  const courses = data.courses
    .filter((c) => trainingYear === "all" || inRange(c.start_date, from, to))
    .sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""));
  const period = (a: string | null, b: string | null) => (b && b !== a ? `${formatDateFr(a)} – ${formatDateFr(b)}` : formatDateFr(a));
  for (const group of chunk(courses.filter((c) => c.kind === "course"), COURSES_TABLE.rows)) {
    const page = await addTemplatePage(ctx, template, TPL.courses);
    const t = COURSES_TABLE;
    group.forEach((c, i) => {
      const top = t.top + i * t.rowHeight;
      const where = `Cours suivis — ${c.subject}`;
      [period(c.start_date, c.end_date), c.city, c.institution, c.subject, c.exam_result, c.teacher].forEach((value, col) =>
        page.cell(value, t.cols[col], top, t.cols[col + 1], top + t.rowHeight, { size: 9, minSize: 6.5, where })
      );
    });
  }
  for (const group of chunk(courses.filter((c) => c.kind === "seminar"), SEMINARS_TABLE.rows)) {
    const page = await addTemplatePage(ctx, template, TPL.seminars);
    const t = SEMINARS_TABLE;
    group.forEach((c, i) => {
      const top = t.top + i * t.rowHeight;
      const where = `Présentation de séminaires — ${c.subject}`;
      [period(c.start_date, c.end_date), c.city, c.institution, c.subject, c.teacher].forEach((value, col) =>
        page.cell(value, t.cols[col], top, t.cols[col + 1], top + t.rowHeight, { size: 9, minSize: 6.5, where })
      );
    });
  }

  // --- Publications: one per "-" line of the form, more lines below if needed ---------------------------------
  const publications = data.publications
    .filter((pub) => trainingYear === "all" || inRange(pub.pub_date, from, to))
    .sort((a, b) => (a.pub_date ?? "").localeCompare(b.pub_date ?? ""));
  {
    let page = await addTemplatePage(ctx, template, TPL.publications);
    let lineTop = 155.3;
    let onFirstPage = true;
    for (const [i, pub] of publications.entries()) {
      const text = [pub.title, pub.details, pub.pub_date ? `(${formatDateFr(pub.pub_date)})` : ""].filter(Boolean).join(" — ");
      const lines = Math.min(4, wrapLines(ctx.font, printable(ctx, text), 11, 425).length);
      const height = Math.max(24.4, lines * 13 + 11.4);
      if (lineTop + height > 740) {
        page = await addTemplatePage(ctx, template, TPL.publications);
        lineTop = 155.3;
        onFirstPage = false;
      }
      // The form prints two "-" lines; the next ones get the same dash.
      if (!onFirstPage || i >= 2 || lineTop > 180) page.line("-", 88.9, lineTop + 19, 10, { size: 20 });
      page.box(text, 100, lineTop + 6.8, 525, lineTop + 6.8 + lines * 13 + 1, { size: 11, minSize: 8, where: `Publications — ${pub.title}` });
      lineTop += height;
    }
  }

  await addTemplatePage(ctx, template, TPL.legend);

  // --- Record of cases (with each tutor's signature) -----------------------------------------------------------
  const numbers = caseNumbers(data.cases, data.stages);
  const cases = data.cases
    .filter((c) => stageIds.has(c.stage_id))
    .sort(
      (a, b) =>
        (stageById.get(a.stage_id)?.training_year ?? 0) - (stageById.get(b.stage_id)?.training_year ?? 0) ||
        a.case_date.localeCompare(b.case_date) ||
        a.created_at.localeCompare(b.created_at)
    );
  for (const [pageIndex, group] of chunk(cases, CASES_TABLE.rows).entries()) {
    const page = await addTemplatePage(ctx, template, pageIndex === 0 ? TPL.casesFirst : TPL.cases);
    const t = CASES_TABLE;
    for (const [i, c] of group.entries()) {
      const top = t.top + i * t.rowHeight;
      const bottom = top + t.rowHeight;
      const col = (n: number) => [t.cols[n], top, t.cols[n + 1], bottom] as const;
      const where = `Relevé des prestations — cas n° ${numbers.get(c.id)} du ${formatDateFr(c.case_date)}`;
      page.cell(String(numbers.get(c.id) ?? ""), ...col(0), { size: 10, align: "center" });
      page.cell(formatDateFr(c.case_date), ...col(1), { size: 10 });
      page.cell(stageById.get(c.stage_id)?.hospital, ...col(2), { size: 9.5, minSize: 7, where });
      page.cell(c.patient_initials, ...col(3), { size: 10 });
      page.cell(c.operation, ...col(4), { size: 9.5, minSize: 7, where });
      page.cell(caseCode(c), ...col(5), { size: 11, align: "center" });
      page.cell(supervisorName(supervisors.get(c.tutor_id ?? "")), ...col(6), { size: 9.5, minSize: 7 });
      const signature = c.signature_id ? signatures.get(c.signature_id) : undefined;
      const image = signature ? await signatureImage(ctx, signature.id, signature.image) : undefined;
      if (image) page.image(image, t.cols[7] + 4, top + 2, t.cols[8] - 4, bottom - 2);
    }
  }

  // --- Days of duty --------------------------------------------------------------------------------------------
  const duties = data.duties.filter((d) => stageIds.has(d.stage_id)).sort((a, b) => a.duty_date.localeCompare(b.duty_date) || a.created_at.localeCompare(b.created_at));
  for (const group of chunk(duties, DUTIES_TABLE.rows)) {
    const page = await addTemplatePage(ctx, template, TPL.duties);
    const t = DUTIES_TABLE;
    for (const [i, d] of group.entries()) {
      const top = t.top + i * t.rowHeight;
      const bottom = top + t.rowHeight;
      page.cell(`${formatDateFr(d.duty_date)}\n${d.duty_type === "on_site" ? "sur place" : "à domicile (rappelable)"}`, t.cols[0], top, t.cols[1], bottom, { size: 9.5, minSize: 7.5 });
      page.cell(d.city, t.cols[1], top, t.cols[2], bottom, { size: 10, minSize: 7 });
      page.cell(d.institution, t.cols[2], top, t.cols[3], bottom, { size: 10, minSize: 7 });
      page.cell(d.head_of_department, t.cols[3], top, t.cols[4], bottom, { size: 10, minSize: 7 });
      const signature = d.signature_id ? signatures.get(d.signature_id) : undefined;
      const image = signature ? await signatureImage(ctx, signature.id, signature.image) : undefined;
      if (image) page.image(image, t.cols[4] + 4, top + 2, t.cols[5] - 4, bottom - 2);
    }
  }

  // --- Activity report (whole training) ------------------------------------------------------------------------------
  const reportPages: Sheet[] = [];
  for (const index of TPL.report) reportPages.push(await addTemplatePage(ctx, template, index));
  // Years of the training so far get a figure (0 included); later years stay blank.
  const yearsSoFar = new Set(data.stages.map((s) => Math.min(s.training_year, REPORT_YEARS)));
  for (const row of activityReport(data).flatMap((s) => s.rows)) {
    const place = REPORT_ROWS[row.key];
    if (!place) continue;
    const [pageOffset, top, bottom] = place;
    const page = reportPages[pageOffset];
    const cols = row.key.startsWith("duty_") ? REPORT_DUTY_YEAR_COLS : REPORT_YEAR_COLS;
    row.byYear.forEach((n, i) => {
      if (n === 0 && !yearsSoFar.has(i + 1)) return;
      page.line(String(n).replace(".", ","), cols[i] + 2, bottom - 3.5, cols[i + 1] - cols[i] - 4, { size: 11, align: "center" });
    });
    // The form's total cell shows a computed "0": replaced by the real total.
    page.whiteout(REPORT_TOTAL_COL[0] + 1, top + 1, REPORT_TOTAL_COL[1] - 1, bottom - 1);
    page.line(String(row.total).replace(".", ","), REPORT_TOTAL_COL[0] + 2, bottom - 3.5, REPORT_TOTAL_COL[1] - REPORT_TOTAL_COL[0] - 4, { size: 11, align: "center" });
  }
  const lastReport = reportPages[2];
  const pubTitles = printable(ctx, publications.map((pub) => pub.title).join(" ; "));
  if (pubTitles) {
    const lines = wrapLines(ctx.font, pubTitles, 10, 380);
    lastReport.line(lines[0], 378, 249, 380, { size: 10 });
    if (lines.length > 1) lastReport.line(lines.slice(1).join(" "), 378, 283.5, 380, { size: 10, where: "Rapport d'activité — titres des publications" });
  }
  if (candidateSignature) lastReport.image(candidateSignature, 72, 365, 185, 405);
  lastReport.line(today, 84.8, 418, 110, { size: 10.5 });

  // --- Personal evaluation: one page per stage -------------------------------------------------------------------------
  for (const stage of stages.length > 0 ? stages : [null]) {
    const page = await addTemplatePage(ctx, template, TPL.review);
    if (!stage) continue;
    const review = data.stage_reviews.find((r) => r.stage_id === stage.id);
    const where = `Évaluation personnelle — ${stage.hospital}`;
    const place = [stage.hospital, stage.sector].filter(Boolean).join(" – ");
    page.line(`${place} (du ${formatDateFr(stage.start_date)}${stage.end_date ? ` au ${formatDateFr(stage.end_date)}` : ""})`, 145, 89.2, 380, { size: 11, where });
    if (!review) continue;
    page.box(review.global_impression, 70.9, 148, 525, 171, { size: 10.5, minSize: 7.5, where: `${where} — impression globale` });
    page.box(review.liked, 70.9, 202, 525, 265, { size: 10.5, minSize: 7.5, where: `${where} — ce que vous avez aimé` });
    page.box(review.disliked, 70.9, 296, 525, 346, { size: 10.5, minSize: 7.5, where: `${where} — ce que vous n'avez pas aimé` });
    page.box(review.would_change, 70.9, 377, 525, 427, { size: 10.5, minSize: 7.5, where: `${where} — ce que vous changeriez` });
    if (review.would_return === true) page.ellipse(350.5, 426.5, 374, 443.5);
    if (review.would_return === false) page.ellipse(377, 426.5, 405.5, 443.5);
    const scores = [review.score_interest, review.score_clinical_guidance, review.score_atmosphere, review.score_theoretical_guidance, review.score_responsibilities];
    const rows = [483.0, 523.9, 578.2, 605.6, 659.9, 741.1];
    scores.forEach((score, i) => {
      if (score === null || score === undefined) return;
      page.cell(i === 4 && score > 0 ? `+${score}` : String(score), 524.5, rows[i], 573.3, rows[i + 1], { size: 13, align: "center" });
    });
  }

  // --- Absences (whole training) ----------------------------------------------------------------------------------------
  const absences = await addTemplatePage(ctx, template, TPL.absences);
  const absenceCols = [85.1, 148.3, 211.5, 274.7, 337.9, 401.1, 464.3, 527.6];
  const absenceRows = [144.9, 164.7, 184.6, 204.4, 224.3, 244.1, 264.0];
  for (const y of data.years) {
    const col = y.training_year - 1;
    if (col < 0 || col >= absenceCols.length - 1) continue;
    if (y.training_year > 5) {
      // "Année …" columns: the "…" becomes the year.
      absences.whiteout(absenceCols[col] + 36, 131, absenceCols[col + 1] - 1, 143);
      absences.line(String(y.training_year), absenceCols[col] + 37, 141, 20, { size: 11 });
    }
    ["A", "B", "C", "D", "E", "F"].forEach((code, row) => {
      const value = y.absences[code];
      if (value === undefined) return;
      absences.cell(String(value).replace(".", ","), absenceCols[col], absenceRows[row], absenceCols[col + 1], absenceRows[row + 1], { size: 11, align: "center" });
    });
  }

  addAnnex(ctx);
  return ctx.doc.save();
}
