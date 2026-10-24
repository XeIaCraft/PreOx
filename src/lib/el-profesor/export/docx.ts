import "server-only";

import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  InternalHyperlink,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
} from "docx";
import type { ProtocolBlockContent, TableBlockContent, TextBlockContent } from "../types";
import { BLOCK_LABELS, BLOCK_TONES, hex, type ExportBlock, type ExportChapter, type ExportFiche, type ExportVolume } from "./model";
import { parseText } from "./text";

// The same volume as pdf.ts, as a Word file meant to be opened (and edited)
// in Google Docs: real heading styles (Docs' outline panel lists them),
// native bullet lists and tables, tinted one-cell tables for the boxed
// blocks. Google Docs caps a document at about a million characters, more
// than a tome holds: a tome is written as several « cahiers » cut between
// chapters (splitForDocs).

const SERIF = "Source Serif 4";
const SANS = "Source Sans 3";
const INK = "21262E";
const MUTED = "616B78";
const SUBTLE = "949BA5";
const ACCENT = hex([0.11, 0.36, 0.58]);
const HAIRLINE = "DCE0E5";
/** Content width on A4 with the margins below, in twentieths of a point. */
const CONTENT_TWIPS = 11906 - 2 * 1250;
const CONTENT_PX = 600;

/** Below Google Docs' limit (≈ 1.02 million characters) with room for edits. */
export const DOCS_MAX_CHARS = 900_000;

export type DocxPart = { index: number; count: number; chapters: { partTitle: string | null; subPartTitle: string | null; chapter: ExportChapter }[] };

/** The characters Google Docs counts: the visible text only. */
function blockChars(block: ExportBlock): number {
  const c = block.content as Partial<TextBlockContent & TableBlockContent & ProtocolBlockContent>;
  let n = (c.heading?.length ?? 0) + (c.text?.length ?? 0);
  for (const h of c.headers ?? []) n += String(h ?? "").length;
  for (const r of c.rows ?? []) for (const cell of Array.isArray(r) ? r : [r]) n += String(cell ?? "").length;
  for (const s of c.steps ?? []) n += (s.label?.length ?? 0) + (s.detail?.length ?? 0) + (s.condition?.length ?? 0);
  return n + 30;
}

function chapterChars(chapter: ExportChapter): number {
  let n = chapter.title.length;
  for (const f of chapter.fiches) {
    n += f.title.length + (f.summary?.length ?? 0) + f.sources.join(" ").length;
    for (const b of f.blocks) n += blockChars(b);
  }
  return n;
}

/** The tome's chapters cut, in order, into cahiers under the Google Docs limit. */
export function splitForDocs(volume: ExportVolume, maxChars = DOCS_MAX_CHARS): DocxPart[] {
  const flat = volume.parts.flatMap((p) => p.subParts.flatMap((s) => s.chapters.map((chapter) => ({ partTitle: p.title, subPartTitle: s.title, chapter }))));
  const total = flat.reduce((n, c) => n + chapterChars(c.chapter), 0);
  const count = Math.max(1, Math.ceil(total / maxChars));
  const target = total / count;
  const groups: DocxPart["chapters"][] = [[]];
  let done = 0;
  for (const c of flat) {
    const size = chapterChars(c.chapter);
    if (groups.at(-1)!.length && groups.length < count && done + size / 2 > target * groups.length) groups.push([]);
    groups.at(-1)!.push(c);
    done += size;
  }
  return groups.map((chapters, i) => ({ index: i + 1, count: groups.length, chapters }));
}

const run = (text: string, opts: Partial<{ bold: boolean; italics: boolean; size: number; color: string; font: string; smallCaps: boolean }> = {}) =>
  new TextRun({ text, font: opts.font ?? SERIF, size: opts.size ?? 20, color: opts.color ?? INK, bold: opts.bold, italics: opts.italics, smallCaps: opts.smallCaps });

function bodyParagraphs(block: ExportBlock): Paragraph[] {
  const c = block.content;
  const out: Paragraph[] = [];
  if ("steps" in c && Array.isArray(c.steps)) {
    (c as ProtocolBlockContent).steps.forEach((step, i) => {
      out.push(new Paragraph({ children: [run(`${i + 1}. `, { font: SANS, bold: true, color: ACCENT }), run(step.label ?? "", { font: SANS, bold: true })], spacing: { before: 80, after: 20 }, keepNext: true }));
      if (step.detail) out.push(new Paragraph({ children: [run(step.detail)], indent: { left: 340 }, spacing: { after: 40, line: 276 } }));
      if (step.condition) out.push(new Paragraph({ children: [run(`Si : ${step.condition}`, { italics: true, color: MUTED, size: 19 })], indent: { left: 340 }, spacing: { after: 40 } }));
    });
    return out;
  }
  for (const line of parseText((c as TextBlockContent).text ?? "", BLOCK_LABELS[block.type])) {
    if (line.kind === "para") out.push(new Paragraph({ children: [run(line.text)], spacing: { after: 80, line: 276 } }));
    else if (line.kind === "lead") out.push(new Paragraph({ children: [run(line.text, { bold: true })], spacing: { before: 60, after: 40 }, keepNext: true }));
    else if (line.marker === "•") out.push(new Paragraph({ children: [run(line.text)], numbering: { reference: "puces", level: line.level }, spacing: { after: 40, line: 264 } }));
    else out.push(new Paragraph({ children: [run(`${line.marker} `, { bold: true, color: ACCENT }), run(line.text)], indent: { left: line.level ? 720 : 360, hanging: 300 }, spacing: { after: 40, line: 264 } }));
  }
  return out;
}

function dataTable(content: TableBlockContent): Table {
  const headers = (content.headers ?? []).map((h) => String(h ?? ""));
  const rows = (content.rows ?? []).map((r) => (Array.isArray(r) ? r.map((x) => String(x ?? "")) : [String(r ?? "")]));
  const cols = Math.max(headers.length, ...rows.map((r) => r.length), 1);
  const size = cols >= 6 ? 15 : 17;
  // Column widths in proportion to their longest cell, within bounds.
  const weights = Array.from({ length: cols }, (_, ci) => Math.min(60, Math.max(8, ...[headers, ...rows].map((r) => (r[ci] ?? "").length))));
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.round((w / sum) * CONTENT_TWIPS));
  const border = { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE };
  const cell = (text: string, ci: number, head: boolean, zebra: boolean) =>
    new TableCell({
      children: [new Paragraph({ children: [run(text, { font: SANS, size, bold: head })], spacing: { after: 0 } })],
      width: { size: widths[ci], type: WidthType.DXA },
      margins: { top: 50, bottom: 50, left: 80, right: 80 },
      shading: head ? { type: ShadingType.CLEAR, fill: "EAEFF4", color: "auto" } : zebra ? { type: ShadingType.CLEAR, fill: "F6F7F9", color: "auto" } : undefined,
    });
  const tableRows: TableRow[] = [];
  if (headers.some(Boolean)) tableRows.push(new TableRow({ tableHeader: true, children: Array.from({ length: cols }, (_, ci) => cell(headers[ci] ?? "", ci, true, false)) }));
  rows.forEach((r, ri) => tableRows.push(new TableRow({ cantSplit: false, children: Array.from({ length: cols }, (_, ci) => cell(r[ci] ?? "", ci, false, ri % 2 === 1)) })));
  return new Table({
    rows: tableRows.length ? tableRows : [new TableRow({ children: [cell("", 0, false, false)] })],
    width: { size: CONTENT_TWIPS, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
  });
}

function blockChildren(block: ExportBlock): (Paragraph | Table)[] {
  const tone = BLOCK_TONES[block.type];
  const label = BLOCK_LABELS[block.type];
  const heading = "heading" in block.content && typeof block.content.heading === "string" ? block.content.heading.trim() : "";
  const showHeading = heading && heading.toLowerCase() !== label.toLowerCase() && !(block.type === "a_retenir" && /^à retenir/i.test(heading));
  const out: (Paragraph | Table)[] = [];
  if (block.type !== "texte_libre" || tone.kind !== "plain")
    out.push(new Paragraph({ children: [run(label.toUpperCase(), { font: SANS, size: 15, bold: true, color: tone.kind === "plain" ? MUTED : hex(tone.color) })], spacing: { before: 60, after: 20 }, keepNext: true }));
  if (showHeading) out.push(new Paragraph({ children: [run(heading, { font: SANS, size: 21, bold: true })], spacing: { after: 60 }, keepNext: true }));
  const c = block.content;
  if ("rows" in c && Array.isArray(c.rows)) out.push(dataTable(c as TableBlockContent), new Paragraph({ children: [], spacing: { after: 60 } }));
  else out.push(...bodyParagraphs(block));
  if (block.image) {
    const w = Math.min(CONTENT_PX * 0.9, block.image.width);
    const h = Math.min(420, (w * block.image.height) / block.image.width);
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 40 },
        children: [new ImageRun({ type: "jpg", data: block.image.data, transformation: { width: (h * block.image.width) / block.image.height, height: h }, altText: block.image.alt ? { name: "Illustration", description: block.image.alt, title: block.image.alt } : undefined })],
      })
    );
    if (block.image.alt) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(block.image.alt, { font: SANS, italics: true, size: 16, color: MUTED })], spacing: { after: 80 } }));
  }
  if (tone.kind === "plain") return out;

  // Boxed and ruled blocks: a one-cell table, tinted, with a full border or a thick coloured rule on the left.
  const color = hex(tone.color);
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const thin = { style: BorderStyle.SINGLE, size: 6, color };
  return [
    new Table({
      width: { size: CONTENT_TWIPS, type: WidthType.DXA },
      columnWidths: [CONTENT_TWIPS],
      rows: [
        new TableRow({
          cantSplit: false,
          children: [
            new TableCell({
              children: out,
              width: { size: CONTENT_TWIPS, type: WidthType.DXA },
              margins: { top: 120, bottom: 100, left: 200, right: 200 },
              shading: { type: ShadingType.CLEAR, fill: hex(tone.tint), color: "auto" },
              borders: tone.kind === "box" ? { top: thin, bottom: thin, left: thin, right: thin } : { top: none, bottom: none, right: none, left: { style: BorderStyle.SINGLE, size: 24, color } },
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ children: [], spacing: { after: 80 } }),
  ];
}

function ficheChildren(fiche: ExportFiche): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [new Paragraph({ heading: "Heading4", children: [new TextRun(fiche.title)], keepNext: true })];
  if (fiche.summary) out.push(new Paragraph({ children: [run(fiche.summary, { italics: true, color: MUTED, size: 19 })], spacing: { after: 160 }, keepNext: true }));
  for (const block of fiche.blocks) out.push(...blockChildren(block));
  if (fiche.sources.length) out.push(new Paragraph({ children: [run(`Sources — ${fiche.sources.join(" · ")}`, { font: SANS, size: 15, color: SUBTLE })], spacing: { before: 40, after: 240 } }));
  return out;
}

export async function renderVolumeDocx(volume: ExportVolume, part: DocxPart): Promise<Uint8Array> {
  const cahier = part.count > 1 ? ` — cahier ${part.index}/${part.count}` : "";
  const children: (Paragraph | Table)[] = [
    new Paragraph({ children: [run(volume.bookTitle, { font: SANS, size: 26, color: ACCENT, bold: true })], spacing: { before: 1800, after: 200 } }),
    new Paragraph({ children: [run(`Tome ${volume.number}${cahier}`, { font: SANS, size: 64, bold: true })], spacing: { after: 300 } }),
    new Paragraph({ children: [run(volume.title, { font: SANS, size: 36, bold: true, color: INK })], spacing: { after: 400 } }),
    ...[...new Set(part.chapters.map((c) => c.subPartTitle).filter((t): t is string => Boolean(t)))].map(
      (t) => new Paragraph({ children: [run(t, { font: SANS, size: 22, color: MUTED })], indent: { left: 240 }, spacing: { after: 60 } })
    ),
    new Paragraph({ children: [run(`Édition du ${volume.date}`, { font: SANS, size: 16, color: SUBTLE })], spacing: { before: 600 } }),
    // Contents: one link per chapter (page numbers don't survive a conversion to Google Docs; links do).
    new Paragraph({ heading: "Title", pageBreakBefore: true, children: [new TextRun("Sommaire")] }),
  ];
  let lastPart: string | null | undefined;
  let lastSub: string | null | undefined;
  part.chapters.forEach((c, i) => {
    if (c.partTitle !== lastPart) children.push(new Paragraph({ children: [run(c.partTitle ?? "Sans partie", { font: SANS, bold: true, size: 22 })], spacing: { before: 200, after: 60 } }));
    if (c.subPartTitle && (c.subPartTitle !== lastSub || c.partTitle !== lastPart))
      children.push(new Paragraph({ children: [run(c.subPartTitle, { font: SANS, bold: true, size: 19, color: ACCENT })], indent: { left: 200 }, spacing: { before: 100, after: 40 } }));
    lastPart = c.partTitle;
    lastSub = c.subPartTitle;
    children.push(new Paragraph({ children: [new InternalHyperlink({ anchor: `chapitre_${i + 1}`, children: [run(c.chapter.title, { size: 19 })] })], indent: { left: 400 }, spacing: { after: 20 } }));
  });

  lastPart = undefined;
  lastSub = undefined;
  part.chapters.forEach((c, i) => {
    if (c.partTitle !== lastPart) children.push(new Paragraph({ heading: "Heading1", pageBreakBefore: true, children: [new TextRun(c.partTitle ?? "Sans partie")] }));
    if (c.subPartTitle && (c.subPartTitle !== lastSub || c.partTitle !== lastPart))
      children.push(new Paragraph({ heading: "Heading2", pageBreakBefore: c.partTitle === lastPart, children: [new TextRun(c.subPartTitle)], keepNext: true }));
    const newSub = c.subPartTitle !== lastSub || c.partTitle !== lastPart;
    lastPart = c.partTitle;
    lastSub = c.subPartTitle;
    children.push(
      new Paragraph({ heading: "Heading3", pageBreakBefore: !newSub, keepNext: true, children: [new Bookmark({ id: `chapitre_${i + 1}`, children: [new TextRun(c.chapter.title)] })] } as IParagraphOptions)
    );
    for (const fiche of c.chapter.fiches) children.push(...ficheChildren(fiche));
  });

  const heading = (id: string, name: string, size: number, color: string, before: number, after: number) => ({
    id,
    name,
    basedOn: "Normal",
    next: "Normal",
    quickFormat: true,
    run: { font: SANS, size, bold: true, color },
    paragraph: { spacing: { before, after }, keepNext: true },
  });

  const doc = new Document({
    creator: "El Profesor",
    title: `${volume.bookTitle} — Tome ${volume.number}${cahier}`,
    description: volume.title,
    styles: {
      default: { document: { run: { font: SERIF, size: 20, color: INK }, paragraph: { spacing: { after: 80 } } } },
      paragraphStyles: [
        heading("Title", "Title", 40, INK, 0, 300),
        heading("Heading1", "Heading 1", 44, INK, 2400, 400),
        heading("Heading2", "Heading 2", 26, ACCENT, 200, 120),
        heading("Heading3", "Heading 3", 36, INK, 120, 240),
        heading("Heading4", "Heading 4", 27, INK, 360, 60),
      ],
    },
    numbering: {
      config: [
        {
          reference: "puces",
          levels: [
            { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } }, run: { color: ACCENT } } },
            { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 240 } }, run: { color: ACCENT } } },
          ],
        },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1250, right: 1250, header: 600, footer: 600 } } },
        headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(`${volume.bookTitle} · Tome ${volume.number}${cahier}`, { font: SANS, size: 15, color: SUBTLE })] })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: SANS, size: 16, color: SUBTLE })] })] }) },
        children,
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
