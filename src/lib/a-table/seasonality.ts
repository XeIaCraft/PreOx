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
