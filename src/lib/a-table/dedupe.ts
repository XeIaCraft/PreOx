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
