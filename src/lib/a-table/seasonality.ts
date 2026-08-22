// Approximate in-season months (France, 1 = janvier) for common fruits and
// vegetables — a reference table, not an exhaustive database. Informational
// only: never blocks planning, just surfaces a gentle heads-up.
const SEASONAL_PRODUCE: Record<string, number[]> = {
  "asperge": [4, 5, 6],
  "artichaut": [5, 6, 7, 8, 9],
  "aubergine": [6, 7, 8, 9, 10],
  "betterave": [6, 7, 8, 9, 10, 11],
  "brocoli": [9, 10, 11, 12, 1, 2, 3],
  "carotte": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  "céleri": [9, 10, 11, 12, 1, 2],
  "champignon": [9, 10, 11],
  "chou-fleur": [9, 10, 11, 12, 1, 2, 3],
  "chou": [9, 10, 11, 12, 1, 2, 3],
  "concombre": [5, 6, 7, 8, 9],
  "courgette": [6, 7, 8, 9],
  "courge": [9, 10, 11, 12],
  "potiron": [9, 10, 11, 12],
  "endive": [10, 11, 12, 1, 2, 3],
  "épinard": [3, 4, 5, 9, 10, 11],
  "fenouil": [7, 8, 9, 10, 11],
  "haricot vert": [6, 7, 8, 9],
  "poireau": [9, 10, 11, 12, 1, 2, 3, 4],
  "poivron": [7, 8, 9, 10],
  "petit pois": [5, 6, 7],
  "radis": [4, 5, 6, 7, 8, 9],
  "salade": [4, 5, 6, 7, 8, 9, 10],
  "tomate": [6, 7, 8, 9, 10],
  "abricot": [6, 7, 8],
  "cerise": [5, 6, 7],
  "citron": [1, 2, 3, 4, 11, 12],
  "clémentine": [11, 12, 1],
  "fraise": [4, 5, 6, 7],
  "framboise": [6, 7, 8, 9],
  "figue": [8, 9, 10],
  "kiwi": [11, 12, 1, 2, 3, 4],
  "mandarine": [11, 12, 1],
  "melon": [6, 7, 8, 9],
  "mirabelle": [8, 9],
  "myrtille": [6, 7, 8, 9],
  "orange": [11, 12, 1, 2, 3],
  "pastèque": [6, 7, 8, 9],
  "pêche": [6, 7, 8, 9],
  "poire": [9, 10, 11, 12, 1, 2],
  "pomme": [9, 10, 11, 12, 1, 2, 3],
  "prune": [7, 8, 9],
  "raisin": [8, 9, 10],
  "rhubarbe": [4, 5, 6],
};

export interface SeasonalityCheck {
  name: string;
  inSeason: boolean;
}

/** Matches an ingredient name against the reference table (substring match on the normalized name); returns null if the ingredient isn't a tracked fruit/vegetable (e.g. meat, dairy, spices — always "no opinion" rather than a false "out of season"). */
export function checkSeasonality(ingredientName: string, month: number): SeasonalityCheck | null {
  const lower = ingredientName.toLowerCase();
  const found = Object.entries(SEASONAL_PRODUCE).find(([key]) => lower.includes(key));
  if (!found) return null;
  const [name, months] = found;
  return { name, inSeason: months.includes(month) };
}

/** Ingredients (deduped by matched reference name) that are out of season this month, across a set of ingredient names. */
export function findOutOfSeasonIngredients(ingredientNames: string[], month: number = new Date().getMonth() + 1): string[] {
  const outOfSeason = new Set<string>();
  for (const name of ingredientNames) {
    const check = checkSeasonality(name, month);
    if (check && !check.inSeason) outOfSeason.add(check.name);
  }
  return [...outOfSeason].sort((a, b) => a.localeCompare(b, "fr"));
}

export interface MonthlySeasonalityStat {
  month: number;
  label: string;
  mealsWithTrackedProduce: number;
  outOfSeasonMeals: number;
}

/**
 * Aggregates, from actual cooking history, how often meals used an
 * out-of-season ingredient — upgrades the one-off planning warning into a
 * trend over time. Only meals containing at least one ingredient the
 * reference table has an opinion on are counted (a meal of just meat/pasta
 * is neither "in" nor "out" of season, so it's excluded rather than
 * counted as a false positive).
 */
export function computeSeasonalityStats(
  entries: { cooked_at: string; ingredientNames: string[] }[],
  monthsBack = 6,
  now: Date = new Date()
): MonthlySeasonalityStat[] {
  const buckets = new Map<string, MonthlySeasonalityStat>();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    buckets.set(key, {
      month: d.getMonth() + 1,
      label: d.toLocaleDateString("fr-FR", { month: "short" }),
      mealsWithTrackedProduce: 0,
      outOfSeasonMeals: 0,
    });
  }

  for (const entry of entries) {
    const cookedAt = new Date(entry.cooked_at);
    const key = `${cookedAt.getFullYear()}-${cookedAt.getMonth()}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;

    const checks = entry.ingredientNames.map((n) => checkSeasonality(n, cookedAt.getMonth() + 1)).filter((c): c is SeasonalityCheck => Boolean(c));
    if (checks.length === 0) continue;
    bucket.mealsWithTrackedProduce += 1;
    if (checks.some((c) => !c.inSeason)) bucket.outOfSeasonMeals += 1;
  }

  return [...buckets.values()];
}
