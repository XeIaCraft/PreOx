function normalize(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
}

function wordSet(title: string): Set<string> {
  return new Set(normalize(title).split(/\s+/).filter(Boolean));
}

/** Jaccard word overlap — good enough to flag likely duplicates ("Poulet au curry" vs
    "Poulet curry coco") without a fuzzy-matching dependency. */
function similarity(a: string, b: string): number {
  const setA = wordSet(a);
  const setB = wordSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) if (setB.has(word)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Finds an existing recipe whose title closely matches `title` (exact after
    normalization, or >=60% word overlap), for a non-blocking "similar recipe
    already exists" hint while adding a new one. */
export function findSimilarRecipe<T extends { title: string }>(title: string, existing: T[]): T | null {
  const trimmed = title.trim();
  if (trimmed.length < 3) return null;
  const normalized = normalize(trimmed);
  for (const recipe of existing) {
    if (normalize(recipe.title) === normalized) return recipe;
  }
  let best: T | null = null;
  let bestScore = 0;
  for (const recipe of existing) {
    const score = similarity(trimmed, recipe.title);
    if (score > bestScore) {
      bestScore = score;
      best = recipe;
    }
  }
  return bestScore >= 0.6 ? best : null;
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

/** Sørensen–Dice coefficient on character bigrams — better than word-overlap for short
    ingredient names with morphological variants ("beurre salé" vs "beurre demi-sel"). */
function bigramSimilarity(a: string, b: string): number {
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const bg of setA) if (setB.has(bg)) intersection++;
  return (2 * intersection) / (setA.size + setB.size);
}

export interface NearDuplicatePair {
  a: string;
  b: string;
}

/** Flags ingredient names on a shopping list that likely refer to the same thing but didn't
    merge because the wording differs slightly — the scenario that makes you buy two jars of
    a specialty ingredient (e.g. "beurre salé" and "beurre demi-sel") instead of one. Only
    compares items already in the same shopping category, to keep false positives down. */
export function findNearDuplicateIngredients<T extends { key: string; name: string; category: string }>(
  items: T[]
): NearDuplicatePair[] {
  const pairs: NearDuplicatePair[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.category !== b.category) continue;
      if (normalize(a.name) === normalize(b.name)) continue; // already merged upstream (same key)
      if (bigramSimilarity(normalize(a.name), normalize(b.name)) >= 0.55) {
        pairs.push({ a: a.name, b: b.name });
      }
    }
  }
  return pairs;
}
