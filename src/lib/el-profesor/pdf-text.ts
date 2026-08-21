import "server-only";

import type { Citation, ComplementaryResult, ExtractionResult } from "./types";

/**
 * Extracts plain text per page from a PDF, server-side (Node), using
 * pdfjs-dist's legacy build (no browser/worker dependency). Pages that are
 * scanned images yield an empty string — expected and handled by callers
 * (no ground truth to check citations against on those pages).
 */
export async function extractPdfPageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjsLib.getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    pages.push(text);
  }
  return pages;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ground-truth check for one citation's stated page: this is the fix for
 * "the page number is wrong — it uses whatever page it was looking at, not
 * the file-relative position" (the extraction prompt already instructs
 * against this, but the model doesn't always follow it on long documents).
 * Only ever corrects when the quote is found VERBATIM (after normalizing
 * whitespace/case/accents) on exactly one page, different from the one the
 * model stated — deliberately conservative: an ambiguous or absent match
 * (scanned page, paraphrased quote, phrase repeated on 2+ pages) leaves the
 * original page untouched rather than risk a wrong "correction".
 */
function correctCitation(citation: Citation, pageTexts: string[]): void {
  const quote = normalize(citation.quote);
  if (quote.length < 20) return; // too short to locate reliably without false positives
  // A long verbatim quote can still legitimately span a page break in the
  // source, so only require the first stretch of it to match.
  const needle = quote.slice(0, Math.min(80, quote.length));

  let matchPage = -1;
  let matchCount = 0;
  for (let i = 0; i < pageTexts.length; i++) {
    if (!pageTexts[i]) continue;
    if (normalize(pageTexts[i]).includes(needle)) {
      matchCount++;
      matchPage = i + 1;
      if (matchCount > 1) break;
    }
  }

  if (matchCount === 1 && matchPage !== citation.page) {
    citation.page = matchPage;
  }
}

function correctCitations(citations: Citation[], pageTexts: string[]): void {
  for (const c of citations) correctCitation(c, pageTexts);
}

/** Corrects every block/flashcard citation page in a fresh extraction result, in place. */
export function correctExtractionCitations(extraction: ExtractionResult, pageTexts: string[]): void {
  for (const sub of extraction.sub_entities) {
    for (const block of sub.fiche.blocks) correctCitations(block.citations, pageTexts);
    for (const card of sub.fiche.flashcards) correctCitations(card.citations, pageTexts);
  }
}

/** Corrects every block/flashcard citation page in a complementary (gap-fill) result, in place. */
export function correctComplementaryCitations(result: ComplementaryResult, pageTexts: string[]): void {
  for (const addition of result.additions_for_existing) {
    for (const block of addition.blocks) correctCitations(block.citations, pageTexts);
    for (const card of addition.flashcards) correctCitations(card.citations, pageTexts);
  }
  for (const sub of result.new_sub_entities) {
    for (const block of sub.fiche.blocks) correctCitations(block.citations, pageTexts);
    for (const card of sub.fiche.flashcards) correctCitations(card.citations, pageTexts);
  }
}
