// The planning image read cell by cell, by classic OCR (Tesseract, no
// language model): the slide found in the image, the table's grid found from
// its lines, then each cell cut out, enlarged ×4, turned to black on white
// and read on its own as one line with only the characters a cell can hold.
// What is read where is found by reading, not by position: the « Anesth »
// rows by the first column, the rooms by the header, the week by the title.

import path from "node:path";
import sharp from "sharp";
import { createWorker, OEM, PSM, type Worker } from "tesseract.js";
import { cellBox, contentBox, crop, findGrid, inkIn, type Box, type GrayImage, type Grid } from "./grid";

export interface OcrCell {
  /** The room's column label as read in the header (« SALLE 1 », « END »…). */
  column: string;
  /** Where the cell is in the image (pixels of the original image). */
  box: Box;
  text: string;
  /** Tesseract's confidence, 0–100 (100 for a cell with no ink: nobody). */
  confidence: number;
  empty: boolean;
}

export interface OcrDay {
  /** 0 = Monday … 4 = Friday. */
  index: number;
  label: string;
  cells: OcrCell[];
}

export interface PlanningRead {
  width: number;
  height: number;
  /** « DU 09/11/2026 AU 13/11/2026 », as ISO dates; absent when the title could not be read. */
  period?: { from: string; to: string };
  titleText: string;
  columns: string[];
  days: OcrDay[];
  warnings: string[];
}

const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"];
/** Characters an « Anesth » cell can hold. */
const CELL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzéèàçÉ-/?+ ";
const LABEL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const HEADER_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+. ";
const TITLE_CHARS = "ADUadu0123456789/ ";
/** Below this confidence a cell is read again, larger and with other thresholds. */
const RETRY_BELOW = 75;
const LOW_CONFIDENCE_RETRIES: [number, number][] = [
  [6, 165],
  [6, 140],
  [8, 185],
];

/** The English model shipped with the app (no download when the function starts). */
export const LANG_PATH = path.join(process.cwd(), "node_modules/@tesseract.js-data/eng/4.0.0_best_int");

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** « LUNDl » → 0; not a day → -1. */
export function dayOf(text: string): number {
  const t = fold(text).replace(/[^a-z]/g, "");
  if (t.length < 4) return -1;
  let best = -1;
  let bestD = 3;
  DAYS.forEach((d, i) => {
    const dist = lev(t, d);
    if (dist < bestD) {
      best = i;
      bestD = dist;
    }
  });
  return best;
}

/** « Anesth » (« Anésth », « Anesth. », « nesth » misread). */
export const isAnesthLabel = (text: string) => {
  const t = fold(text).replace(/[^a-z]/g, "");
  return t.length >= 4 && (t.includes("nesth") || lev(t, "anesth") <= 2);
};

/** « DU 09/11/2026 AU 13/11/2026 » → ISO dates. */
export function periodOf(text: string): { from: string; to: string } | undefined {
  const m = text.replace(/\s+/g, " ").match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4}).*?(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/);
  if (!m) return undefined;
  const iso = (d: string, mo: string, y: string) => `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const from = iso(m[1], m[2], m[3]);
  const to = iso(m[4], m[5], m[6]);
  return Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)) ? undefined : { from, to };
}


export class PlanningOcr {
  private constructor(private worker: Worker) {}

  static async start(langPath = LANG_PATH): Promise<PlanningOcr> {
    const worker = await createWorker("eng", OEM.LSTM_ONLY, { langPath, gzip: true, cacheMethod: "none" });
    return new PlanningOcr(worker);
  }

  async stop() {
    await this.worker.terminate();
  }

  /** One cell (or one strip of the image), enlarged, black on white, read as one line. */
  async readBox(img: GrayImage, box: Box, chars: string, scale = 4, cut = 165): Promise<{ text: string; confidence: number }> {
    const png = await sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 1 } })
      .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
      .resize(box.w * scale, box.h * scale, { kernel: "lanczos3" })
      .normalise()
      // Coloured and grey fills go white, the writing black.
      .threshold(cut)
      .extend({ top: 12, bottom: 12, left: 12, right: 12, background: "#ffffff" })
      .png()
      .toBuffer();
    await this.worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: chars, preserve_interword_spaces: "1" });
    const { data } = await this.worker.recognize(png);
    return { text: data.text.replace(/\s+/g, " ").trim(), confidence: Math.round(data.confidence) };
  }

  /** The whole planning: week, rooms, and each day's « Anesth » cells. */
  async read(image: Buffer): Promise<PlanningRead> {
    const warnings: string[] = [];
    const { data, info } = await sharp(image).grayscale().raw().toBuffer({ resolveWithObject: true });
    const full: GrayImage = { data: new Uint8Array(data), width: info.width, height: info.height };
    const area = contentBox(full);
    const img = crop(full, area);
    const grid: Grid = findGrid(img);
    const nRows = grid.rows.length - 1;
    const nCols = grid.cols.length - 1;
    const toImage = (b: Box): Box => ({ x: b.x + area.x, y: b.y + area.y, w: b.w, h: b.h });
    if (nRows < 6 || nCols < 3) {
      warnings.push(`Tableau non reconnu (${nRows} lignes, ${nCols} colonnes trouvées).`);
      return { width: full.width, height: full.height, titleText: "", columns: [], days: [], warnings };
    }

    // The column of the row labels (« LUNDI », « Circ », « Anesth »): the first of the first three where they are read.
    const labels: { col: number; rows: string[] } = { col: -1, rows: [] };
    for (let col = 0; col < Math.min(3, nCols) && labels.col < 0; col++) {
      const rows: string[] = [];
      for (let r = 0; r < nRows; r++) {
        const b = cellBox(grid, r, col);
        rows.push(b && inkIn(img, b) > 4 ? (await this.readBox(img, b, LABEL_CHARS)).text : "");
      }
      if (rows.some(isAnesthLabel) && rows.some((t) => dayOf(t) >= 0)) Object.assign(labels, { col, rows });
    }
    if (labels.col < 0) {
      warnings.push("Lignes « Anesth » ou jours introuvables dans la première colonne.");
      return { width: full.width, height: full.height, titleText: "", columns: [], days: [], warnings };
    }

    // Days and their « Anesth » row: the first one after the day's row, before the next day.
    const dayRows = labels.rows.map((t, r) => ({ r, d: dayOf(t) })).filter((x) => x.d >= 0);
    const firstDay = dayRows[0].r;

    // The header: the row above the first day; the title: the rows above the header.
    const headerRow = firstDay - 1;
    const columns: string[] = [];
    for (let col = labels.col + 1; col < nCols; col++) {
      const b = headerRow >= 0 ? cellBox(grid, headerRow, col) : null;
      columns.push(b && inkIn(img, b) > 4 ? (await this.readBox(img, b, HEADER_CHARS)).text : "");
    }
    let titleText = "";
    if (headerRow > 0) {
      const top = grid.rows[0];
      const bottom = grid.rows[headerRow];
      titleText = (await this.readBox(img, { x: 2, y: top + 2, w: img.width - 4, h: bottom - top - 4 }, TITLE_CHARS, 2)).text;
    }
    const period = periodOf(titleText);
    if (!period) warnings.push(`Période illisible dans le titre (« ${titleText} »).`);

    const days: OcrDay[] = [];
    for (const [k, dr] of dayRows.entries()) {
      const next = dayRows[k + 1]?.r ?? nRows;
      const row = labels.rows.findIndex((t, r) => r > dr.r && r < next && isAnesthLabel(t));
      if (row < 0) {
        warnings.push(`${DAYS[dr.d]} : ligne « Anesth » introuvable.`);
        continue;
      }
      const cells: OcrCell[] = [];
      for (let col = labels.col + 1; col < nCols; col++) {
        const b = cellBox(grid, row, col);
        if (!b) continue;
        const column = columns[col - labels.col - 1];
        // No ink: nobody (an empty or greyed cell) — not read.
        if (inkIn(img, b) <= 4) {
          cells.push({ column, box: toImage(b), text: "", confidence: 100, empty: true });
          continue;
        }
        let r = await this.readBox(img, b, CELL_CHARS);
        // Small writing (« Ch+Fr » squeezed in a narrow column): read again larger, the surer reading kept.
        for (const [scale, cut] of LOW_CONFIDENCE_RETRIES) {
          if (r.confidence >= RETRY_BELOW) break;
          const again = await this.readBox(img, b, CELL_CHARS, scale, cut);
          if (again.confidence > r.confidence) r = again;
        }
        cells.push({ column, box: toImage(b), text: r.text, confidence: r.confidence, empty: !r.text });
      }
      days.push({ index: dr.d, label: DAYS[dr.d], cells });
    }
    return { width: full.width, height: full.height, period, titleText, columns, days, warnings };
  }
}
