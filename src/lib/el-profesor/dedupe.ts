// Deterministic (no Gemini cost) near-duplicate detection — flashcard fronts
// within a book, and sub-entity names within a chapter. Same bigram
// technique as src/lib/a-table/dedupe.ts's ingredient dedup, kept as a
// separate small copy rather than a shared cross-module lib (each module
// already keeps its own small self-contained helpers, e.g. substitutions.ts).

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

function bigramSimilarity(a: string, b: string): number {
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const bg of setA) if (setB.has(bg)) intersection++;
  return (2 * intersection) / (setA.size + setB.size);
}

export interface DuplicateFlashcardPair {
  a: { id: string; front: string };
  b: { id: string; front: string };
  similarity: number;
}

/** Flags flashcards whose front text is near-identical (>=70% bigram similarity) — a book-scoped, O(n²) but n is at most a few hundred published cards per book. */
export function findDuplicateFlashcards(flashcards: { id: string; front: string }[]): DuplicateFlashcardPair[] {
  const pairs: DuplicateFlashcardPair[] = [];
  const normalized = flashcards.map((f) => ({ ...f, norm: normalize(f.front) }));
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const similarity = bigramSimilarity(normalized[i].norm, normalized[j].norm);
      if (similarity >= 0.7) {
        pairs.push({ a: { id: normalized[i].id, front: normalized[i].front }, b: { id: normalized[j].id, front: normalized[j].front }, similarity });
      }
    }
  }
  return pairs.sort((a, b) => b.similarity - a.similarity);
}

export interface SimilarSubEntityPair {
  a: { id: string; name: string; chapterId: string };
  b: { id: string; name: string; chapterId: string };
  similarity: number;
}

/** Flags sub-entities within the same chapter whose names are near-identical — likely worth merging (e.g. a term extracted twice under slightly different spellings). */
export function findSimilarSubEntities(subEntities: { id: string; name: string; chapterId: string }[]): SimilarSubEntityPair[] {
  const pairs: SimilarSubEntityPair[] = [];
  const byChapter = new Map<string, typeof subEntities>();
  for (const s of subEntities) {
    const list = byChapter.get(s.chapterId) ?? [];
    list.push(s);
    byChapter.set(s.chapterId, list);
  }
  for (const list of byChapter.values()) {
    const normalized = list.map((s) => ({ ...s, norm: normalize(s.name) }));
    for (let i = 0; i < normalized.length; i++) {
      for (let j = i + 1; j < normalized.length; j++) {
        if (normalized[i].norm === normalized[j].norm) continue; // handled elsewhere, not a "similar" suggestion
        const similarity = bigramSimilarity(normalized[i].norm, normalized[j].norm);
        if (similarity >= 0.6) {
          pairs.push({
            a: { id: normalized[i].id, name: normalized[i].name, chapterId: normalized[i].chapterId },
            b: { id: normalized[j].id, name: normalized[j].name, chapterId: normalized[j].chapterId },
            similarity,
          });
        }
      }
    }
  }
  return pairs.sort((a, b) => b.similarity - a.similarity);
}
