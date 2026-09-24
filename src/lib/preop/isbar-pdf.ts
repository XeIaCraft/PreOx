// The handover as a one-to-two-page A4 PDF, built on the device (pdf-lib,
// Carlito like the carnet): nothing leaves the phone unless you share it.

import type { PDFFont, PDFPage } from "pdf-lib";
import type { Dossier } from "./dossier";
import type { IsbarSection } from "./isbar";

const FALLBACKS: Record<string, string> = { "≥": ">=", "≤": "<=", "→": "->", "₂": "2", "₃": "3", "–": "-", "—": "-", "…": "...", "×": "x", "µ": "u", "’": "'", "«": '"', "»": '"', "\u00a0": " ", "\u202f": " " };

function clean(text: string, glyphs: Set<number>): string {
  return [...text].map((ch) => (glyphs.has(ch.codePointAt(0)!) ? ch : (FALLBACKS[ch] ?? "?"))).join("");
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out;
}

export async function buildIsbarPdf(d: Dossier, sections: IsbarSection[], fontBytes: ArrayBuffer | Uint8Array, generatedAt: Date = new Date()): Promise<Uint8Array> {
  const lib = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const doc = await lib.PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Transmission ${d.initials}`);
  doc.setCreator("PreOx — Préop");
  doc.setProducer("PreOx");
  const font = await doc.embedFont(fontBytes, { features: { liga: false, clig: false, dlig: false } });
  const glyphs = new Set(font.getCharacterSet());
  const ink = lib.rgb(0.12, 0.14, 0.16);
  const muted = lib.rgb(0.42, 0.45, 0.48);
  const accent = lib.rgb(0.08, 0.36, 0.42);
  const warn = lib.rgb(0.7, 0.38, 0.05);

  const W = 595.28;
  const H = 841.89;
  const M = 48;
  const bodyX = M + 30;
  const bodyW = W - bodyX - M;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < M) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  const text = (s: string, x: number, size: number, color = ink) => page.drawText(clean(s, glyphs), { x, y, size, font, color });

  text(`Transmission — ${d.initials}`, M, 18, accent);
  y -= 20;
  const sub = [d.consultation.surgery.name, generatedAt.toLocaleString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })].filter(Boolean).join(" · ");
  text(sub, M, 10, muted);
  y -= 22;

  for (const s of sections) {
    newPageIfNeeded(40);
    page.drawRectangle({ x: M, y: y - 6, width: 20, height: 20, color: accent });
    page.drawText(s.key, { x: M + 10 - font.widthOfTextAtSize(s.key, 12) / 2, y: y - 1, size: 12, font, color: lib.rgb(1, 1, 1) });
    text(s.title, bodyX, 12, accent);
    y -= 20;
    for (const l of s.lines) {
      const wrapped = wrap(font, clean(l, glyphs), 10, bodyW - 10);
      for (let i = 0; i < wrapped.length; i++) {
        newPageIfNeeded(14);
        if (i === 0) text("•", bodyX, 10, muted);
        text(wrapped[i], bodyX + 10, 10);
        y -= 13;
      }
    }
    if (s.missing.length) {
      for (const l of wrap(font, clean(`Non renseigné : ${s.missing.join(", ")}`, glyphs), 9, bodyW)) {
        newPageIfNeeded(13);
        text(l, bodyX, 9, warn);
        y -= 12;
      }
    }
    y -= 10;
  }
  return doc.save();
}
