/** Heuristic French cooking substitutions — common swaps, not exhaustive. Matched by substring on ingredient name. */
const SUBSTITUTIONS: Record<string, string[]> = {
  "beurre": ["huile d'olive", "margarine", "compote de pommes (pâtisserie)"],
  "crème fraîche": ["yaourt nature", "lait + beurre", "crème de soja"],
  "crème liquide": ["lait + maïzena", "crème de soja"],
  "lait": ["lait végétal (soja, avoine, amande)", "eau + poudre de lait"],
  "œuf": ["compote de pommes (60 g/œuf, pâtisserie)", "graine de lin + eau", "banane écrasée (pâtisserie)"],
  "oeuf": ["compote de pommes (60 g/œuf, pâtisserie)", "graine de lin + eau", "banane écrasée (pâtisserie)"],
  "farine de blé": ["farine de riz", "farine de sarrasin", "fécule de maïs (pour lier)"],
  "sucre blanc": ["sucre de coco", "miel (¾ de la quantité)", "sirop d'érable"],
  "vin blanc": ["bouillon de légumes + jus de citron", "jus de pomme"],
  "vin rouge": ["bouillon de bœuf + vinaigre balsamique"],
  "citron": ["vinaigre blanc", "citron vert"],
  "ail": ["ail en poudre (⅛ c.à.c. par gousse)", "échalote"],
  "oignon": ["échalote", "poireau", "oignon en poudre"],
  "chapelure": ["flocons d'avoine mixés", "biscottes émiettées"],
  "parmesan": ["levure maltée (végétalien)", "pecorino"],
  "yaourt nature": ["crème fraîche", "fromage blanc"],
  "moutarde": ["raifort", "vinaigre + curcuma"],
  "bouillon de légumes": ["eau + sauce soja + herbes"],
  "crème de coco": ["crème fraîche + noix de coco râpée"],
};

export interface SubstitutionMatch {
  ingredient: string;
  alternatives: string[];
}

export function findSubstitutions(ingredientNames: string[]): SubstitutionMatch[] {
  const matches: SubstitutionMatch[] = [];
  for (const name of ingredientNames) {
    const lower = name.toLowerCase();
    const found = Object.entries(SUBSTITUTIONS).find(([key]) => lower.includes(key));
    if (found) matches.push({ ingredient: name, alternatives: found[1] });
  }
  return matches;
}
