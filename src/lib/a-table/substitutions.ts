/** Heuristic French cooking substitutions — common swaps, not exhaustive. Matched by substring on ingredient name.
    `ratio` (when set) is a multiplier applied to the original quantity for a quantity-aware suggestion (e.g. honey
    instead of sugar: use ~75% as much). Omitted for substitutions that aren't a simple linear scale (e.g. eggs,
    which substitute per-count rather than per-gram) — those keep a plain descriptive alternative instead. */
const SUBSTITUTIONS: Record<string, { name: string; ratio?: number }[]> = {
  "beurre": [{ name: "huile d'olive", ratio: 0.75 }, { name: "margarine", ratio: 1 }, { name: "compote de pommes (pâtisserie)", ratio: 1 }],
  "crème fraîche": [{ name: "yaourt nature", ratio: 1 }, { name: "lait + beurre" }, { name: "crème de soja", ratio: 1 }],
  "crème liquide": [{ name: "lait + maïzena" }, { name: "crème de soja", ratio: 1 }],
  "lait": [{ name: "lait végétal (soja, avoine, amande)", ratio: 1 }, { name: "eau + poudre de lait" }],
  "œuf": [{ name: "compote de pommes (60 g/œuf, pâtisserie)" }, { name: "graine de lin + eau" }, { name: "banane écrasée (pâtisserie)" }],
  "oeuf": [{ name: "compote de pommes (60 g/œuf, pâtisserie)" }, { name: "graine de lin + eau" }, { name: "banane écrasée (pâtisserie)" }],
  "farine de blé": [{ name: "farine de riz", ratio: 1 }, { name: "farine de sarrasin", ratio: 1 }, { name: "fécule de maïs (pour lier)", ratio: 0.5 }],
  "sucre blanc": [{ name: "sucre de coco", ratio: 1 }, { name: "miel", ratio: 0.75 }, { name: "sirop d'érable", ratio: 0.75 }],
  "vin blanc": [{ name: "bouillon de légumes + jus de citron", ratio: 1 }, { name: "jus de pomme", ratio: 1 }],
  "vin rouge": [{ name: "bouillon de bœuf + vinaigre balsamique", ratio: 1 }],
  "citron": [{ name: "vinaigre blanc", ratio: 0.5 }, { name: "citron vert", ratio: 1 }],
  "ail": [{ name: "ail en poudre (⅛ c.à.c. par gousse)" }, { name: "échalote", ratio: 1 }],
  "oignon": [{ name: "échalote", ratio: 1 }, { name: "poireau", ratio: 1 }, { name: "oignon en poudre", ratio: 0.15 }],
  "chapelure": [{ name: "flocons d'avoine mixés", ratio: 1 }, { name: "biscottes émiettées", ratio: 1 }],
  "parmesan": [{ name: "levure maltée (végétalien)", ratio: 0.5 }, { name: "pecorino", ratio: 1 }],
  "yaourt nature": [{ name: "crème fraîche", ratio: 1 }, { name: "fromage blanc", ratio: 1 }],
  "moutarde": [{ name: "raifort", ratio: 0.5 }, { name: "vinaigre + curcuma" }],
  "bouillon de légumes": [{ name: "eau + sauce soja + herbes", ratio: 1 }],
  "crème de coco": [{ name: "crème fraîche + noix de coco râpée", ratio: 1 }],
};

export interface SubstitutionAlternative {
  /** Display label — includes the scaled quantity (e.g. "huile d'olive (~37 g)") when a ratio and a numeric source quantity are both available. */
  label: string;
}

export interface SubstitutionMatch {
  ingredient: string;
  alternatives: SubstitutionAlternative[];
}

function formatScaledQuantity(quantity: number, ratio: number): string {
  const scaled = quantity * ratio;
  const rounded = scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  return String(rounded);
}

export function findSubstitutions(ingredients: { name: string; quantity?: number | null; unit?: string }[]): SubstitutionMatch[] {
  const matches: SubstitutionMatch[] = [];
  for (const ing of ingredients) {
    const lower = ing.name.toLowerCase();
    const found = Object.entries(SUBSTITUTIONS).find(([key]) => lower.includes(key));
    if (!found) continue;
    const [, alternatives] = found;
    matches.push({
      ingredient: ing.name,
      alternatives: alternatives.map((alt) => {
        if (alt.ratio != null && typeof ing.quantity === "number" && ing.quantity > 0) {
          const scaled = formatScaledQuantity(ing.quantity, alt.ratio);
          return { label: `${alt.name} (~${scaled} ${ing.unit ?? ""})`.replace(/\s+\)/, ")") };
        }
        return { label: alt.name };
      }),
    });
  }
  return matches;
}
