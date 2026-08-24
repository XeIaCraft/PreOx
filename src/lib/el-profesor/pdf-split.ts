import "server-only";

import { PDFDocument } from "pdf-lib";
import { GeminiError } from "@/lib/gemini-shared";

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
