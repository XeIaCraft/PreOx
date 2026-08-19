import { RECIPE_QUALITY_GUIDELINES } from "./prompts";
import { GUEST_COURSE_LABELS } from "./constants";
import type { GuestCourseKey, Preferences, TemporaryIngredient } from "./types";

const NUTRITION_SKELETON = '{"kcal": 420, "protein_g": 12, "carb_g": 55, "fat_g": 14, "fiber_g": 8}';

export const WINE_INSTRUCTION =
  "Propose 2 à 4 suggestions d'accord mets-vins sous forme d'appellations ou dénominations réelles et courantes (AOC/AOP, ex. \"Côtes du Rhône rouge\", \"Chablis\", \"Beaujolais-Villages\", \"Sancerre blanc\") avec une courte justification liée au menu. En plus de l'appellation, si tu es raisonnablement confiant qu'il s'agit d'une grande maison largement distribuée en grande surface (ex. \"Guigal\", \"Georges Duboeuf\"), tu peux citer 1 à 2 maisons dans le champ \"producers\" — jamais un domaine confidentiel ou incertain, liste vide si aucune ne te vient naturellement avec confiance.";

export function buildGuestMenuContext(preferences: Preferences, tempIngredients: TemporaryIngredient[], notes: string): string {
  const lines: string[] = [];
  const diets = preferences.diets ?? [];
  lines.push(`- Régimes du foyer : ${diets.length ? diets.join(", ") : "aucun"}.`);
  const allergies = preferences.allergies ?? [];
  lines.push(`- Allergies/intolérances : ${allergies.length ? allergies.join(", ") : "aucune"}.`);

  const liked = preferences.liked_ingredients ?? [];
  const disliked = preferences.disliked_ingredients ?? [];
  if (liked.length || disliked.length) {
    lines.push(
      `- Goûts : adore ${liked.length ? liked.join(", ") : "rien de spécifique"}; n'aime pas ${disliked.length ? disliked.join(", ") : "rien de spécifique"}.`
    );
  }

  if (tempIngredients.length) {
    const tempLines = tempIngredients.map((t) => `- ${t.quantity ?? ""} ${t.unit ?? ""} ${t.name}`);
    lines.push(`- Aliments déjà disponibles à utiliser en priorité :\n${tempLines.join("\n")}`);
  }

  if (notes) lines.push(`- Occasion / contraintes précisées par l'utilisateur : ${notes}`);
  if (preferences.stove_levels) {
    lines.push(
      `- Plaque de cuisson : ${preferences.stove_levels} niveaux de puissance. Pour toute étape utilisant la plaque de cuisson, précise le niveau à utiliser (1 à ${preferences.stove_levels}).`
    );
  }

  return lines.join("\n");
}

function courseJsonSkeleton(key: string, composed: boolean): string {
  if (composed) {
    return `    "${key}": {"title": "...", "notes": "...", "items": [{"title": "...", "ingredients": [{"name": "...", "quantity": 1, "unit": "..."}], "steps": ["..."], "step_labels": ["un court libellé actionnable par étape (3-5 mots), même longueur que steps"], "nutrition": ${NUTRITION_SKELETON}, "image_query": "short English stock-photo search phrase for this dish, 3-5 words"}]}`;
  }
  return `    "${key}": {"title": "...", "ingredients": [{"name": "...", "quantity": 1, "unit": "..."}], "steps": ["..."], "step_labels": ["un court libellé actionnable par étape (3-5 mots), même longueur que steps"], "notes": "...", "nutrition": ${NUTRITION_SKELETON}, "image_query": "short English stock-photo search phrase for this dish, 3-5 words"}`;
}

interface BuildGuestMenuInstructionsInput {
  guests: number;
  context: string;
  selected: GuestCourseKey[];
  composed: Set<GuestCourseKey>;
  counts: Record<string, number>;
}

export function buildGuestMenuInstructions({ guests, context, selected, composed, counts }: BuildGuestMenuInstructionsInput): string {
  const courseLabels = selected.map((k) => GUEST_COURSE_LABELS[k].toLowerCase()).join(", ");
  let composedNote = "";
  if (composed.size > 0) {
    const parts = Array.from(composed).map((k) => `${GUEST_COURSE_LABELS[k].toLowerCase()} (${counts[k]} variantes)`);
    composedNote = ` Pour ${parts.join(", ")}, propose un assortiment de variantes distinctes (champ "items", exactement le nombre de variantes indiqué, une entrée par variante) plutôt qu'un plat unique.`;
  }
  const jsonSkeleton = selected.map((k) => courseJsonSkeleton(k, composed.has(k))).join(",\n");

  return (
    `Tu es un assistant culinaire qui compose un repas complet pour recevoir des invités. Le repas est prévu pour ${guests} convives.\n\n` +
    "CONTEXTE :\n" +
    `${context}\n\n` +
    `${RECIPE_QUALITY_GUIDELINES}\n\n` +
    `Compose les services suivants, cohérents entre eux (pas de répétition d'ingrédients ou de techniques d'un plat à l'autre) : ${courseLabels}. Adapte-toi aux régimes/allergies du foyer, en utilisant en priorité les aliments déjà disponibles si pertinent.${composedNote} ${WINE_INSTRUCTION}\n\n` +
    "RÉSULTAT ATTENDU : Retourne UNIQUEMENT un JSON valide, sans texte avant ni après, exactement au format :\n" +
    "{\n" +
    '  "courses": {\n' +
    `${jsonSkeleton}\n` +
    "  },\n" +
    '  "wine_pairings": [{"style": "...", "description": "...", "producers": []}]\n' +
    "}"
  );
}
