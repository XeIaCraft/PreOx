import type { CoverageEntry } from "@/components/el-profesor/pdf-viewer";
import type { SubEntityWithFiche } from "@/lib/el-profesor/dal";

/** Flattens every block/flashcard citation across a chapter's sub-entities into the PDF coverage overlay's entry list — shared by chapter-view.tsx and extraction-review-view.tsx, which both render the same overlay over the same data shape. */
export function buildCoverageEntries(withFiche: SubEntityWithFiche[]): CoverageEntry[] {
  const entries: CoverageEntry[] = [];
  for (const sub of withFiche) {
    for (const block of sub.fiche!.blocks) {
      for (const c of block.citations) entries.push({ page: c.page, quote: c.quote, kind: "block", id: block.id });
    }
    for (const card of sub.fiche!.flashcards) {
      for (const c of card.citations) entries.push({ page: c.page, quote: c.quote, kind: "flashcard", id: card.id });
    }
  }
  return entries;
}
