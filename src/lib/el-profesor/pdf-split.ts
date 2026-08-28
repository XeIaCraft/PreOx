import "server-only";

import { PDFDocument } from "pdf-lib";
import { GeminiError } from "@/lib/gemini-shared";

// Per-page excerpts sent in one prompt (buildChapterSplitPrompt /
// buildChapterInternalSplitPrompt) — bounded so the request stays a single
// reasonably-sized Gemini call; a document past this falls back to manual
// mode (no AI call). Shared by both the whole-book split (split-book.ts)
// and the per-chapter split (split-chapter.ts) — kept here rather than
// exported from either "use server" action file, since Next.js only allows
// async function exports from a "use server" module (a plain `const` export
// there silently strips the whole module's exports in the client bundle).
// Raised 2026-08-25 (700 → 2000): even at 2000 pages the prompt is only
// ~200k tokens (300 chars/page cap), comfortably inside Gemini Flash's 1M
// context window — the real ceiling this guards against is request
// duration, not context size, and 2000 pages covers essentially any
// single-volume book (and vastly more than any single chapter).
export const MAX_PAGES_FOR_AI_DETECTION = 2000;

/**
 * Splits an uploaded book PDF into per-chapter PDFs (admin tool, requested
 * 2026-08-24: uploading a whole book and defining chapters by page range,
 * instead of pre-splitting each chapter into its own file by hand before
 * uploading). One `PDFDocument` load + `copyPages` per range — cheap even
 * for a large book since pages aren't re-rendered, just copied by reference
 * into new documents.
 */
export async function splitPdfByRanges(bytes: Uint8Array, ranges: { startPage: number; endPage: number }[]): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(bytes);
  const pageCount = src.getPageCount();
  for (const r of ranges) {
    if (r.startPage < 1 || r.endPage > pageCount || r.startPage > r.endPage) {
      throw new GeminiError(`Plage de pages invalide (${r.startPage}-${r.endPage}) pour un document de ${pageCount} page(s).`);
    }
  }

  const outputs: Uint8Array[] = [];
  for (const r of ranges) {
    const indices = Array.from({ length: r.endPage - r.startPage + 1 }, (_, i) => r.startPage - 1 + i);
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(src, indices);
    for (const page of pages) doc.addPage(page);
    outputs.push(await doc.save());
  }
  return outputs;
}

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}
