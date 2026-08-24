import "server-only";

import { extractPdfPageTexts } from "@/lib/el-profesor/pdf-text";
import { ocrScannedPages } from "@/lib/el-profesor/gemini";
import { getElProfesorGeminiConfig } from "@/lib/el-profesor/dal";

// Bounds the OCR request to a chapter with a handful of scanned pages
// (the realistic case — a photocopied insert, a few unreadable plates), not
// an entire book scanned cover to cover, which would be a large, slow,
// expensive single request better left to manual review.
const MAX_OCR_PAGES_PER_CHAPTER = 60;

/**
 * Extracts a PDF's per-page text (pdfjs), then best-effort OCRs via Gemini
 * any page that came back empty — a scanned/photographed page with no text
 * layer. Item "OCR des PDF scannés" of the pistes d'amélioration
 * 2026-08-24: citation page correction (correctExtractionCitations /
 * correctComplementaryCitations) silently can't verify anything on such a
 * page and leaves the citation as originally stated — this only ever
 * improves on that baseline, never makes it worse, since it degrades to
 * the plain pdfjs result whenever no Gemini key is configured or the OCR
 * call itself fails.
 *
 * Deliberately scoped to citation correction only: the PDF viewer's
 * coverage overlay and text selection still rely on pdfjs's own text layer
 * rendered live in the browser, which this doesn't (and can't, without
 * per-word bounding boxes OCR doesn't give us) retrofit — a scanned page
 * stays unhighlightable in the viewer even after this.
 */
export async function extractPdfPageTextsWithOcr(bytes: Uint8Array, chapterTitle: string): Promise<string[]> {
  const pageTexts = await extractPdfPageTexts(bytes);
  const emptyPageNumbers = pageTexts.map((t, i) => (t.trim() ? null : i + 1)).filter((n): n is number => n !== null);
  if (emptyPageNumbers.length === 0 || emptyPageNumbers.length > MAX_OCR_PAGES_PER_CHAPTER) return pageTexts;

  let config;
  try {
    config = await getElProfesorGeminiConfig();
  } catch {
    return pageTexts; // No Gemini key configured — OCR unavailable, not an error.
  }

  try {
    const ocrByPage = await ocrScannedPages(config, bytes, `${chapterTitle}.pdf`, emptyPageNumbers);
    return pageTexts.map((t, i) => ocrByPage.get(i + 1) || t);
  } catch {
    return pageTexts; // Best-effort — leave pages empty rather than fail the whole correction pass.
  }
}
