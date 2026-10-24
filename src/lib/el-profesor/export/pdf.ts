import "server-only";

import fontkit from "@pdf-lib/fontkit";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, rgb, type PDFFont, type PDFImage, type PDFPage, type PDFRef } from "pdf-lib";
import type { ProtocolBlockContent, TableBlockContent, TextBlockContent } from "../types";
import { BLOCK_LABELS, BLOCK_TONES, type BlockTone, type ExportBlock, type ExportFiche, type ExportImage, type ExportVolume } from "./model";
import { parseText, type TextLine } from "./text";

// The airy « fiche » layout (choice made with the user): A4, one column,
// generous spacing; each chapter opens a page, each part has its own title
// page; the closing « À retenir » and the divergences stand out in a tinted
// box, pitfalls, pearls and thresholds get a coloured rule. Laid out by
// hand on pdf-lib (no browser on the server): text is measured word by word,
// boxes continue on the next page, tables repeat their header.

export type PdfFonts = Record<"serif" | "serifItalic" | "serifSemibold" | "serifBold" | "sans" | "sansItalic" | "sansSemibold" | "sansBold" | "fallback" | "fallbackBold", Uint8Array>;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 60;
const TOP = 70;
const BOTTOM = 70;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;

type Color = [number, number, number];
const INK: Color = [0.13, 0.15, 0.18];
const MUTED: Color = [0.38, 0.42, 0.47];
const SUBTLE: Color = [0.58, 0.61, 0.65];
const ACCENT: Color = [0.11, 0.36, 0.58];
const HAIRLINE: Color = [0.86, 0.88, 0.9];
const ZEBRA: Color = [0.965, 0.97, 0.975];
const HEADER_FILL: Color = [0.92, 0.94, 0.96];

type FontKey = keyof PdfFonts;
type Style = { font: FontKey; size: number; color: Color; leading: number };

const S = {
  body: { font: "serif", size: 9.9, color: INK, leading: 14.2 } as Style,
  bodyLead: { font: "serifSemibold", size: 9.9, color: INK, leading: 14.2 } as Style,
  summary: { font: "serifItalic", size: 9.4, color: MUTED, leading: 13.4 } as Style,
  label: { font: "sansSemibold", size: 7.4, color: MUTED, leading: 11 } as Style,
  blockHeading: { font: "sansSemibold", size: 10.6, color: INK, leading: 14.5 } as Style,
  ficheTitle: { font: "sansBold", size: 14, color: INK, leading: 18.5 } as Style,
  chapterKicker: { font: "sansSemibold", size: 8.5, color: ACCENT, leading: 12 } as Style,
  chapterTitle: { font: "sansBold", size: 20, color: INK, leading: 25 } as Style,
  subPartTitle: { font: "sansSemibold", size: 13, color: ACCENT, leading: 17 } as Style,
  table: { font: "sans", size: 8.4, color: INK, leading: 11 } as Style,
  tableHead: { font: "sansSemibold", size: 8.4, color: INK, leading: 11 } as Style,
  stepLabel: { font: "sansSemibold", size: 10, color: INK, leading: 14 } as Style,
  stepCondition: { font: "serifItalic", size: 9.2, color: MUTED, leading: 13 } as Style,
  sources: { font: "sans", size: 7.4, color: SUBTLE, leading: 10.4 } as Style,
  caption: { font: "sansItalic", size: 8, color: MUTED, leading: 11 } as Style,
  running: { font: "sans", size: 7.4, color: SUBTLE, leading: 10 } as Style,
  tocPart: { font: "sansBold", size: 11, color: INK, leading: 16 } as Style,
  tocSubPart: { font: "sansSemibold", size: 9.6, color: ACCENT, leading: 14 } as Style,
  tocChapter: { font: "serif", size: 9.6, color: INK, leading: 13.6 } as Style,
};

// -- Text measurement, with a fallback font for the glyphs the main ones lack (↔, ⇌, ∅…) -------------------------------

type Segment = { text: string; font: FontKey; size: number; color: Color };

interface GlyphCheck {
  embedder?: { font?: { hasGlyphForCodePoint(cp: number): boolean } };
}

class Measurer {
  private widths = new Map<string, number>();
  private glyphs = new Map<string, boolean>();
  constructor(readonly fonts: Record<FontKey, PDFFont>) {}

  private has(font: FontKey, ch: string): boolean {
    const key = font + ch;
    let v = this.glyphs.get(key);
    if (v === undefined) {
      const cp = ch.codePointAt(0)!;
      v = cp < 0x80 || Boolean((this.fonts[font] as unknown as GlyphCheck).embedder?.font?.hasGlyphForCodePoint(cp));
      this.glyphs.set(key, v);
    }
    return v;
  }

  /** The text cut into runs of the style's font and of the fallback font where a glyph is missing. */
  segments(text: string, style: Style): Segment[] {
    const out: Segment[] = [];
    const fallback: FontKey = style.font.toLowerCase().includes("bold") || style.font.toLowerCase().includes("semibold") ? "fallbackBold" : "fallback";
    for (const ch of text) {
      const font = this.has(style.font, ch) ? style.font : this.has(fallback, ch) ? fallback : null;
      if (!font) continue; // Neither font has it (a stray CJK character): dropped rather than drawn as a box.
      const last = out.at(-1);
      if (last && last.font === font) last.text += ch;
      else out.push({ text: ch, font, size: style.size, color: style.color });
    }
    return out;
  }

  width(text: string, style: Style): number {
    const key = `${style.font}|${style.size}|${text}`;
    let w = this.widths.get(key);
    if (w === undefined) {
      w = this.segments(text, style).reduce((n, s) => n + this.fonts[s.font].widthOfTextAtSize(s.text, s.size), 0);
      if (this.widths.size < 200_000) this.widths.set(key, w);
    }
    return w;
  }

  /** Greedy line breaking; a word longer than the line (a URL) is cut. */
  wrap(text: string, style: Style, maxWidth: number, firstIndent = 0): string[] {
    const words = text.replace(/\s+/g, " ").trim().split(" ");
    const lines: string[] = [];
    let line = "";
    let available = maxWidth - firstIndent;
    const space = this.width(" ", style);
    let lineWidth = 0;
    for (let word of words) {
      if (!word) continue;
      let w = this.width(word, style);
      while (w > available && !line) {
        // Cut an over-long word at the last character that fits.
        let cut = word.length - 1;
        while (cut > 1 && this.width(word.slice(0, cut), style) > available) cut--;
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
        w = this.width(word, style);
        available = maxWidth;
      }
      if (line && lineWidth + space + w > available) {
        lines.push(line);
        line = word;
        lineWidth = w;
        available = maxWidth;
      } else {
        line = line ? `${line} ${word}` : word;
        lineWidth = line === word ? w : lineWidth + space + w;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }
}

// -- Pages as lists of drawing operations, drawn once the whole volume is laid out --------------------------------------

type Op =
  | { kind: "text"; x: number; y: number; text: string; style: Style }
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill?: Color; stroke?: Color; radius?: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; color: Color; width: number }
  | { kind: "circle"; x: number; y: number; r: number; fill: Color }
  | { kind: "image"; x: number; y: number; w: number; h: number; image: ExportImage };

type LaidPage = { ops: Op[]; chapter: string | null; blank?: boolean };

type Anchor = { level: 0 | 1 | 2 | 3; title: string; page: number; y: number };

type OpenBox = { tone: BlockTone; startIndex: number; startY: number; page: number };

const BOX_PAD_X = 12;
const BOX_PAD_Y = 9;

class Flow {
  pages: LaidPage[] = [];
  y = TOP;
  anchors: Anchor[] = [];
  private boxes: OpenBox[] = [];
  private indent = 0;
  chapter: string | null = null;

  constructor(readonly m: Measurer) {}

  get page(): LaidPage {
    return this.pages[this.pages.length - 1];
  }
  get left(): number {
    return MARGIN_X + this.indent;
  }
  get width(): number {
    return CONTENT_W - 2 * this.indent;
  }
  get bottom(): number {
    return PAGE_H - BOTTOM;
  }
  get atTop(): boolean {
    return this.y <= TOP + 0.5;
  }

  newPage() {
    const reopen = this.boxes.map((b) => b.tone);
    this.closeBoxesForPage();
    this.pages.push({ ops: [], chapter: this.chapter });
    this.y = TOP;
    this.boxes = [];
    for (const tone of reopen) this.openBox(tone, true);
  }

  /** A page that starts at the top: never two blank pages in a row. */
  freshPage() {
    if (!this.pages.length || !this.atTop || this.page.ops.length) this.newPage();
  }

  ensure(height: number) {
    if (this.y + height > this.bottom) this.newPage();
  }

  push(op: Op) {
    this.page.ops.push(op);
  }

  openBox(tone: BlockTone, continued = false) {
    this.boxes.push({ tone, startIndex: this.page.ops.length, startY: this.y, page: this.pages.length - 1 });
    this.indent += BOX_PAD_X;
    this.y += continued ? BOX_PAD_Y - 2 : BOX_PAD_Y;
  }

  closeBox() {
    const box = this.boxes.pop();
    if (!box) return;
    this.y += BOX_PAD_Y;
    this.drawBox(box, this.y);
    this.indent -= BOX_PAD_X;
    this.y += 10;
  }

  private closeBoxesForPage() {
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      this.drawBox(this.boxes[i], Math.min(this.y + 4, this.bottom + 8));
      this.indent -= BOX_PAD_X;
    }
  }

  private drawBox(box: OpenBox, endY: number) {
    const depth = this.boxes.indexOf(box);
    const x = MARGIN_X + Math.max(0, depth) * BOX_PAD_X;
    const w = CONTENT_W - 2 * Math.max(0, depth) * BOX_PAD_X;
    const ops: Op[] =
      box.tone.kind === "box"
        ? [{ kind: "rect", x, y: box.startY, w, h: endY - box.startY, fill: box.tone.tint, stroke: mix(box.tone.color, 0.45), radius: 5 }]
        : [
            { kind: "rect", x, y: box.startY, w, h: endY - box.startY, fill: box.tone.tint },
            { kind: "rect", x, y: box.startY, w: 2.6, h: endY - box.startY, fill: box.tone.color },
          ];
    this.pages[box.page].ops.splice(box.startIndex, 0, ...ops);
    // Ops drawn later on this page shift by what was inserted under them.
    for (const other of this.boxes) if (other !== box && other.page === box.page && other.startIndex >= box.startIndex) other.startIndex += ops.length;
  }

  /** Lines of text, page breaks included; `indent` shifts the lines after the first one (bullets). */
  lines(lines: string[], style: Style, opts: { x?: number; hang?: number } = {}) {
    for (const line of lines) {
      this.ensure(style.leading);
      this.push({ kind: "text", x: this.left + (opts.x ?? 0), y: this.y + style.size, text: line, style });
      this.y += style.leading;
    }
  }

  paragraph(text: string, style: Style, opts: { x?: number; width?: number } = {}) {
    const lines = this.m.wrap(text, style, (opts.width ?? this.width) - (opts.x ?? 0));
    this.lines(lines, style, { x: opts.x });
  }

  anchor(level: Anchor["level"], title: string) {
    this.anchors.push({ level, title, page: this.pages.length - 1, y: this.y });
  }
}

function mix(c: Color, amount: number): Color {
  return [c[0] + (1 - c[0]) * amount, c[1] + (1 - c[1]) * amount, c[2] + (1 - c[2]) * amount];
}

// -- Content ------------------------------------------------------------------------------------------------------------

function layoutVolume(flow: Flow, volume: ExportVolume) {
  for (const part of volume.parts) {
    flow.chapter = null;
    flow.freshPage();
    flow.anchor(0, part.title ?? "Sans partie");
    // Part title page: the title a third down, its sub-parts listed under it.
    flow.y = PAGE_H * 0.3;
    flow.push({ kind: "line", x1: MARGIN_X, y1: flow.y - 18, x2: MARGIN_X + 46, y2: flow.y - 18, color: ACCENT, width: 2.4 });
    flow.paragraph(part.title ?? "Sans partie", { font: "sansBold", size: 26, color: INK, leading: 32 });
    flow.y += 18;
    for (const sub of part.subParts) if (sub.title) flow.paragraph(sub.title, { font: "sans", size: 11, color: MUTED, leading: 17 });

    for (const sub of part.subParts) {
      let first = true;
      for (const chapter of sub.chapters) {
        flow.chapter = chapter.title;
        flow.newPage();
        if (first && sub.title) {
          flow.anchor(1, sub.title);
          flow.paragraph(sub.title.toUpperCase(), S.chapterKicker);
          first = false;
        } else if (sub.title) flow.paragraph(sub.title.toUpperCase(), S.chapterKicker);
        flow.y += 2;
        flow.anchor(2, chapter.title);
        flow.paragraph(chapter.title, S.chapterTitle);
        flow.y += 6;
        flow.push({ kind: "line", x1: MARGIN_X, y1: flow.y, x2: MARGIN_X + CONTENT_W, y2: flow.y, color: HAIRLINE, width: 0.8 });
        flow.y += 22;
        chapter.fiches.forEach((fiche, i) => layoutFiche(flow, fiche, i > 0));
      }
    }
  }
}

function layoutFiche(flow: Flow, fiche: ExportFiche, separated: boolean) {
  const titleLines = flow.m.wrap(fiche.title, S.ficheTitle, flow.width);
  const summaryLines = fiche.summary ? flow.m.wrap(fiche.summary, S.summary, flow.width) : [];
  // The title never ends a page alone: with it, its summary and the start of the first block.
  flow.ensure((separated ? 26 : 0) + titleLines.length * S.ficheTitle.leading + Math.min(summaryLines.length, 3) * S.summary.leading + 60);
  if (separated && !flow.atTop) {
    flow.y += 14;
    flow.push({ kind: "line", x1: MARGIN_X, y1: flow.y, x2: MARGIN_X + 40, y2: flow.y, color: ACCENT, width: 1.4 });
    flow.y += 12;
  }
  flow.anchor(3, fiche.title);
  flow.lines(titleLines, S.ficheTitle);
  if (summaryLines.length) {
    flow.y += 3;
    flow.lines(summaryLines, S.summary);
  }
  flow.y += 10;
  for (const block of fiche.blocks) layoutBlock(flow, block);
  if (fiche.sources.length) {
    flow.y += 2;
    flow.paragraph(`Sources — ${fiche.sources.join(" · ")}`, S.sources);
  }
}

function layoutBlock(flow: Flow, block: ExportBlock) {
  const tone = BLOCK_TONES[block.type];
  const label = BLOCK_LABELS[block.type];
  const heading = "heading" in block.content && typeof block.content.heading === "string" ? block.content.heading.trim() : "";
  const showHeading = heading && heading.toLowerCase() !== label.toLowerCase() && !(block.type === "a_retenir" && /^à retenir/i.test(heading));
  // Label, heading and two lines of the block stay together.
  flow.ensure(S.label.leading + (showHeading ? S.blockHeading.leading * 2 : 0) + S.body.leading * 2 + (tone.kind === "plain" ? 0 : 2 * BOX_PAD_Y));
  if (tone.kind !== "plain") flow.openBox(tone);
  if (block.type !== "texte_libre" || tone.kind !== "plain") {
    flow.paragraph(label.toUpperCase(), { ...S.label, color: tone.kind === "plain" ? MUTED : tone.color });
    flow.y += 1;
  }
  if (showHeading) flow.paragraph(heading, S.blockHeading);
  flow.y += 1;

  const c = block.content;
  if ("rows" in c && Array.isArray(c.rows)) layoutTable(flow, c as TableBlockContent);
  else if ("steps" in c && Array.isArray(c.steps)) layoutSteps(flow, c as ProtocolBlockContent);
  else layoutText(flow, parseText((c as TextBlockContent).text ?? "", label));

  if (block.image) layoutImage(flow, block.image);
  if (tone.kind !== "plain") flow.closeBox();
  else flow.y += 9;
}

function layoutText(flow: Flow, lines: TextLine[]) {
  for (const line of lines) {
    if (line.kind === "para") {
      flow.paragraph(line.text, S.body);
      flow.y += 3;
    } else if (line.kind === "lead") {
      flow.y += 2;
      flow.ensure(S.bodyLead.leading + S.body.leading);
      flow.paragraph(line.text, S.bodyLead);
    } else {
      const indent = line.level === 1 ? 26 : 12;
      const marker = line.marker === "•" ? (line.level === 1 ? "–" : "•") : line.marker;
      const markerW = Math.max(flow.m.width(marker, S.body) + 5, 10);
      const wrapped = flow.m.wrap(line.text, S.body, flow.width - indent - markerW);
      flow.ensure(S.body.leading);
      flow.push({ kind: "text", x: flow.left + indent, y: flow.y + S.body.size, text: marker, style: { ...S.body, color: marker === "•" || marker === "–" ? ACCENT : INK } });
      flow.lines(wrapped, S.body, { x: indent + markerW });
      flow.y += 1.5;
    }
  }
}

function layoutSteps(flow: Flow, content: ProtocolBlockContent) {
  content.steps.forEach((step, i) => {
    const textX = 22;
    const label = flow.m.wrap(step.label ?? "", S.stepLabel, flow.width - textX);
    const detail = step.detail ? flow.m.wrap(step.detail, S.body, flow.width - textX) : [];
    flow.ensure(S.stepLabel.leading + Math.min(detail.length, 2) * S.body.leading);
    flow.push({ kind: "circle", x: flow.left + 7.5, y: flow.y + 6.5, r: 7, fill: ACCENT });
    const n = String(i + 1);
    flow.push({ kind: "text", x: flow.left + 7.5 - flow.m.width(n, { ...S.label, size: 8 }) / 2, y: flow.y + 9.3, text: n, style: { ...S.label, size: 8, color: [1, 1, 1] } });
    flow.lines(label, S.stepLabel, { x: textX });
    flow.lines(detail, S.body, { x: textX });
    if (step.condition) flow.paragraph(`Si : ${step.condition}`, S.stepCondition, { x: textX });
    flow.y += 6;
  });
}

function layoutTable(flow: Flow, content: TableBlockContent) {
  const headers = (content.headers ?? []).map((h) => String(h ?? ""));
  const rows = (content.rows ?? []).map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : [String(r ?? "")]));
  const cols = Math.max(headers.length, ...rows.map((r) => r.length), 1);
  // Wide tables in a smaller size, so that each column still holds its longest word.
  const small = cols >= 6 ? 0.88 : 1;
  const body: Style = { ...S.table, size: S.table.size * small, leading: S.table.leading * small };
  const head: Style = { ...S.tableHead, size: S.tableHead.size * small, leading: S.tableHead.leading * small };
  const pad = cols >= 6 ? 3.5 : 5;
  const available = flow.width;

  // Column widths: each column gets at least its longest word, the rest shared in proportion to its longest cell.
  const all = [headers, ...rows];
  const longestWord = Array.from({ length: cols }, (_, ci) => Math.max(24, ...all.map((r) => Math.max(0, ...(r[ci] ?? "").split(/\s+/).map((w) => flow.m.width(w, head))))) + 2 * pad);
  const wordsFit = longestWord.reduce((a, b) => a + b, 0) <= available;
  const minW = longestWord.map((w) => (wordsFit ? w : Math.min(w, available / cols)));
  const maxW = Array.from({ length: cols }, (_, ci) => Math.max(minW[ci], ...all.map((r, ri) => flow.m.width(r[ci] ?? "", ri === 0 ? head : body) + 2 * pad)));
  const sumMax = maxW.reduce((a, b) => a + b, 0);
  const sumMin = minW.reduce((a, b) => a + b, 0);
  const widths =
    sumMax <= available
      ? maxW.map((w) => (w * available) / sumMax)
      : minW.map((w, i) => w + ((available - sumMin) * (maxW[i] - minW[i])) / Math.max(1, sumMax - sumMin));

  const cellLines = (row: string[], style: Style) => widths.map((w, ci) => (row[ci] ? flow.m.wrap(row[ci], style, w - 2 * pad) : []));
  const drawRow = (lines: string[][], style: Style, fill: Color | null, from = 0, count = Infinity) => {
    const n = Math.min(count, Math.max(1, ...lines.map((l) => l.length - from)));
    const h = n * style.leading + 2 * pad - 2;
    if (fill) flow.push({ kind: "rect", x: flow.left, y: flow.y, w: available, h, fill });
    let x = flow.left;
    lines.forEach((cell, ci) => {
      cell.slice(from, from + n).forEach((t, li) => flow.push({ kind: "text", x: x + pad, y: flow.y + pad + style.size + li * style.leading - 1, text: t, style }));
      x += widths[ci];
    });
    flow.y += h;
    flow.push({ kind: "line", x1: flow.left, y1: flow.y, x2: flow.left + available, y2: flow.y, color: HAIRLINE, width: 0.6 });
    return n;
  };
  const headerLines = headers.some(Boolean) ? cellLines(headers, head) : null;
  const headerH = headerLines ? Math.max(1, ...headerLines.map((l) => l.length)) * head.leading + 2 * pad : 0;
  const drawHeader = () => headerLines && drawRow(headerLines, head, HEADER_FILL);

  flow.ensure(headerH + body.leading * 2 + 2 * pad);
  drawHeader();
  rows.forEach((row, ri) => {
    const lines = cellLines(row, body);
    const total = Math.max(1, ...lines.map((l) => l.length));
    let from = 0;
    while (from < total) {
      const room = Math.floor((flow.bottom - flow.y - 2 * pad) / body.leading);
      if (room < Math.min(total - from, 2)) {
        flow.newPage();
        drawHeader();
        continue;
      }
      from += drawRow(lines, body, ri % 2 ? ZEBRA : null, from, room);
    }
  });
  flow.y += 8;
}

function layoutImage(flow: Flow, image: ExportImage) {
  const maxH = 300;
  let w = Math.min(flow.width, image.width * 0.6);
  let h = (w * image.height) / image.width;
  if (h > maxH) {
    h = maxH;
    w = (h * image.width) / image.height;
  }
  const caption = image.alt ? flow.m.wrap(image.alt, S.caption, flow.width) : [];
  flow.y += 4;
  flow.ensure(h + caption.length * S.caption.leading + 6);
  flow.push({ kind: "image", x: flow.left + (flow.width - w) / 2, y: flow.y, w, h, image });
  flow.y += h + 4;
  for (const line of caption) {
    flow.push({ kind: "text", x: flow.left + (flow.width - flow.m.width(line, S.caption)) / 2, y: flow.y + S.caption.size, text: line, style: S.caption });
    flow.y += S.caption.leading;
  }
  flow.y += 6;
}

// -- Cover, table of contents, running heads, bookmarks -------------------------------------------------------------------

type TocLine = { anchor: Anchor; style: Style; indent: number; lines: string[]; gapBefore: number };

function tocLines(m: Measurer, anchors: Anchor[]): TocLine[] {
  const numberRoom = 34;
  return anchors
    .filter((a) => a.level <= 2)
    .map((a) => {
      const style = a.level === 0 ? S.tocPart : a.level === 1 ? S.tocSubPart : S.tocChapter;
      const indent = a.level === 0 ? 0 : a.level === 1 ? 10 : 20;
      return { anchor: a, style, indent, lines: m.wrap(a.title, style, CONTENT_W - indent - numberRoom), gapBefore: a.level === 0 ? 12 : a.level === 1 ? 5 : 0 };
    });
}

/** Lays the table of contents out on as many pages as it needs — run once to count them, once to draw them with page numbers. */
function paginateToc(lines: TocLine[]): { page: number; y: number; line: TocLine }[] {
  const out: { page: number; y: number; line: TocLine }[] = [];
  let page = 0;
  let y = TOP + 46;
  for (const line of lines) {
    const h = line.gapBefore + line.lines.length * line.style.leading;
    if (y + h > PAGE_H - BOTTOM) {
      page++;
      y = TOP;
    }
    y += line.gapBefore;
    out.push({ page, y, line });
    y += line.lines.length * line.style.leading;
  }
  return out;
}

export async function renderVolumePdf(volume: ExportVolume, fontBytes: PdfFonts): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = Object.fromEntries(
    await Promise.all(Object.entries(fontBytes).map(async ([k, bytes]) => [k, await doc.embedFont(bytes, { subset: true })]))
  ) as Record<FontKey, PDFFont>;
  const m = new Measurer(fonts);

  const flow = new Flow(m);
  layoutVolume(flow, volume);

  const toc = tocLines(m, flow.anchors);
  const tocPlaced = paginateToc(toc);
  const tocPages = (tocPlaced.at(-1)?.page ?? 0) + 1;
  // Pages: cover, its blank back, the contents (ending on an even page), then the content.
  const front = 2 + tocPages + (tocPages % 2);
  const pdfPageOf = (contentPage: number) => front + contentPage;

  const pages: PDFPage[] = [];
  const addPage = () => {
    const p = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(p);
    return p;
  };
  const images = new Map<ExportImage, PDFImage>();
  const draw = async (page: PDFPage, ops: Op[]) => {
    for (const op of ops) {
      if (op.kind === "text") {
        let x = op.x;
        for (const s of m.segments(op.text, op.style)) {
          page.drawText(s.text, { x, y: PAGE_H - op.y, size: s.size, font: fonts[s.font], color: rgb(...s.color) });
          x += fonts[s.font].widthOfTextAtSize(s.text, s.size);
        }
      } else if (op.kind === "rect") {
        if (op.radius) {
          const r = Math.min(op.radius, op.h / 2, op.w / 2);
          const path = `M ${r} 0 H ${op.w - r} Q ${op.w} 0 ${op.w} ${r} V ${op.h - r} Q ${op.w} ${op.h} ${op.w - r} ${op.h} H ${r} Q 0 ${op.h} 0 ${op.h - r} V ${r} Q 0 0 ${r} 0 Z`;
          page.drawSvgPath(path, { x: op.x, y: PAGE_H - op.y, color: op.fill ? rgb(...op.fill) : undefined, borderColor: op.stroke ? rgb(...op.stroke) : undefined, borderWidth: op.stroke ? 0.7 : 0 });
        } else page.drawRectangle({ x: op.x, y: PAGE_H - op.y - op.h, width: op.w, height: op.h, color: op.fill ? rgb(...op.fill) : undefined, borderColor: op.stroke ? rgb(...op.stroke) : undefined, borderWidth: op.stroke ? 0.7 : 0 });
      } else if (op.kind === "line") {
        page.drawLine({ start: { x: op.x1, y: PAGE_H - op.y1 }, end: { x: op.x2, y: PAGE_H - op.y2 }, thickness: op.width, color: rgb(...op.color) });
      } else if (op.kind === "circle") {
        page.drawCircle({ x: op.x, y: PAGE_H - op.y, size: op.r, color: rgb(...op.fill) });
      } else {
        let img = images.get(op.image);
        if (!img) {
          img = op.image.format === "png" ? await doc.embedPng(op.image.data) : await doc.embedJpg(op.image.data);
          images.set(op.image, img);
        }
        page.drawImage(img, { x: op.x, y: PAGE_H - op.y - op.h, width: op.w, height: op.h });
      }
    }
  };
  const text = (page: PDFPage, value: string, x: number, y: number, style: Style) => draw(page, [{ kind: "text", x, y, text: value, style }]);

  // Cover.
  const cover = addPage();
  cover.drawRectangle({ x: 0, y: PAGE_H - 250, width: PAGE_W, height: 250, color: rgb(...ACCENT) });
  await draw(cover, [
    { kind: "text", x: MARGIN_X, y: 120, text: volume.bookTitle, style: { font: "sansSemibold", size: 13, color: [0.85, 0.9, 0.96], leading: 18 } },
    { kind: "text", x: MARGIN_X, y: 190, text: `Tome ${volume.number}`, style: { font: "sansBold", size: 40, color: [1, 1, 1], leading: 44 } },
  ]);
  let cy = 320;
  for (const line of m.wrap(volume.title, { font: "sansBold", size: 24, color: INK, leading: 31 }, CONTENT_W)) {
    await text(cover, line, MARGIN_X, cy, { font: "sansBold", size: 24, color: INK, leading: 31 });
    cy += 31;
  }
  cy += 18;
  for (const part of volume.parts) {
    for (const sub of part.subParts) {
      if (!sub.title) continue;
      for (const line of m.wrap(sub.title, { font: "sans", size: 11, color: MUTED, leading: 16 }, CONTENT_W - 12)) {
        if (cy > PAGE_H - 140) break;
        await text(cover, line, MARGIN_X + 12, cy, { font: "sans", size: 11, color: MUTED, leading: 16 });
        cy += 16;
      }
    }
  }
  cover.drawLine({ start: { x: MARGIN_X, y: 92 }, end: { x: PAGE_W - MARGIN_X, y: 92 }, thickness: 0.6, color: rgb(...HAIRLINE) });
  await text(cover, `Tome ${volume.number} sur ${volume.count} · Édition du ${volume.date}`, MARGIN_X, PAGE_H - 74, S.running);
  addPage(); // Back of the cover.

  // Contents, with page numbers and links — every page exists first, so links can point at the content.
  for (let i = 0; i < tocPages + (tocPages % 2); i++) addPage();
  for (let i = 0; i < flow.pages.length; i++) addPage();
  await text(pages[2], "Sommaire", MARGIN_X, TOP + 18, { font: "sansBold", size: 20, color: INK, leading: 26 });
  for (const { page, y, line } of tocPlaced) {
    const p = pages[2 + page];
    const target = pdfPageOf(line.anchor.page);
    line.lines.forEach((l, i) => void text(p, l, MARGIN_X + line.indent, y + line.style.size + i * line.style.leading, line.style));
    const lastY = y + line.style.size + (line.lines.length - 1) * line.style.leading;
    const num = String(target + 1);
    const numW = m.width(num, line.style);
    await text(p, num, PAGE_W - MARGIN_X - numW, lastY, line.style);
    if (line.anchor.level === 2) {
      const lastW = m.width(line.lines.at(-1)!, line.style);
      const dotsFrom = MARGIN_X + line.indent + lastW + 6;
      const dotsTo = PAGE_W - MARGIN_X - numW - 6;
      if (dotsTo > dotsFrom) {
        const dotW = m.width(". ", line.style);
        await text(p, ". ".repeat(Math.floor((dotsTo - dotsFrom) / dotW)), dotsFrom, lastY, { ...line.style, color: SUBTLE });
      }
    }
    link(doc, p, pages, { x: MARGIN_X, y: PAGE_H - y - line.lines.length * line.style.leading, w: CONTENT_W, h: line.lines.length * line.style.leading }, target, line.anchor.y);
  }

  // Content, with running heads.
  for (let i = 0; i < flow.pages.length; i++) {
    const page = pages[pdfPageOf(i)];
    const laid = flow.pages[i];
    await draw(page, laid.ops);
    const n = pdfPageOf(i) + 1;
    if (laid.chapter) {
      const left = n % 2 ? truncate(m, laid.chapter, S.running, CONTENT_W * 0.7) : truncate(m, volume.bookTitle, S.running, CONTENT_W * 0.7);
      const x = n % 2 ? PAGE_W - MARGIN_X - m.width(left, S.running) : MARGIN_X;
      await text(page, left, x, 44, S.running);
      page.drawLine({ start: { x: MARGIN_X, y: PAGE_H - 52 }, end: { x: PAGE_W - MARGIN_X, y: PAGE_H - 52 }, thickness: 0.5, color: rgb(...HAIRLINE) });
    }
    const num = String(n);
    await text(page, num, PAGE_W / 2 - m.width(num, S.running) / 2, PAGE_H - 44, S.running);
  }

  outline(doc, pages, flow.anchors.map((a) => ({ ...a, page: pdfPageOf(a.page) })));
  doc.setTitle(`${volume.bookTitle} — Tome ${volume.number} : ${volume.title}`);
  doc.setAuthor("El Profesor");
  doc.setLanguage("fr-FR");
  doc.setCreator("El Profesor");
  return doc.save({ useObjectStreams: true });
}

function truncate(m: Measurer, text: string, style: Style, max: number): string {
  if (m.width(text, style) <= max) return text;
  let t = text;
  while (t.length > 4 && m.width(`${t}…`, style) > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function destination(pages: PDFPage[], page: number, y: number): PDFArray {
  const doc = pages[page].doc;
  return doc.context.obj([pages[page].ref, PDFName.of("XYZ"), PDFNumber.of(0), PDFNumber.of(PAGE_H - Math.max(0, y - 30)), PDFNumber.of(0)]) as PDFArray;
}

function link(doc: PDFDocument, page: PDFPage, pages: PDFPage[], r: { x: number; y: number; w: number; h: number }, target: number, y: number) {
  const annot = doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [r.x, r.y, r.x + r.w, r.y + r.h],
    Border: [0, 0, 0],
    Dest: destination(pages, target, y),
  });
  const ref = doc.context.register(annot);
  const annots = page.node.lookup(PDFName.of("Annots"));
  if (annots instanceof PDFArray) annots.push(ref);
  else page.node.set(PDFName.of("Annots"), doc.context.obj([ref]));
}

/** PDF bookmarks: parts › sub-parts › chapters › fiches. */
function outline(doc: PDFDocument, pages: PDFPage[], anchors: Anchor[]) {
  type Node = { anchor: Anchor | null; children: Node[]; ref?: PDFRef; dict?: PDFDict };
  const root: Node = { anchor: null, children: [] };
  const stack: Node[] = [root];
  for (const a of anchors) {
    while (stack.length > 1 && stack[stack.length - 1].anchor!.level >= a.level) stack.pop();
    const node: Node = { anchor: a, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  const ctx = doc.context;
  const count = (n: Node): number => n.children.reduce((s, c) => s + 1 + count(c), 0);
  const build = (parent: Node, parentRef: PDFRef) => {
    parent.children.forEach((c) => (c.ref = ctx.nextRef()));
    parent.children.forEach((c, i) => {
      const dict = ctx.obj({}) as PDFDict;
      dict.set(PDFName.of("Title"), PDFHexString.fromText(c.anchor!.title));
      dict.set(PDFName.of("Parent"), parentRef);
      dict.set(PDFName.of("Dest"), destination(pages, c.anchor!.page, c.anchor!.y));
      if (i > 0) dict.set(PDFName.of("Prev"), parent.children[i - 1].ref!);
      if (i < parent.children.length - 1) dict.set(PDFName.of("Next"), parent.children[i + 1].ref!);
      if (c.children.length) {
        build(c, c.ref!);
        dict.set(PDFName.of("First"), c.children[0].ref!);
        dict.set(PDFName.of("Last"), c.children[c.children.length - 1].ref!);
        // Parts open, the rest folded.
        dict.set(PDFName.of("Count"), PDFNumber.of(c.anchor!.level === 0 ? count(c) : -count(c)));
      }
      ctx.assign(c.ref!, dict);
    });
  };
  if (!root.children.length) return;
  const rootRef = ctx.nextRef();
  build(root, rootRef);
  ctx.assign(
    rootRef,
    ctx.obj({ Type: "Outlines", First: root.children[0].ref!, Last: root.children[root.children.length - 1].ref!, Count: PDFNumber.of(count(root)) })
  );
  doc.catalog.set(PDFName.of("Outlines"), rootRef);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}
