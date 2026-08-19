import { APPETITE_MULTIPLIERS } from "./constants";
import type {
  Appetite,
  DraftProposal,
  GenerationRules,
  HistoryEntry,
  Preferences,
  Recipe,
  TemporaryIngredient,
} from "./types";

/** Ported verbatim from coordinator.py — tuned prompt fragments, not rewritten. */
export const RECIPE_QUALITY_GUIDELINES =
  "EXIGENCES DE QUALITÉ :\n" +
  '- Le titre doit être descriptif et citer les ingrédients ou la technique principale (ex. "Curry de pois chiches, courgettes et tomates au riz"), jamais un titre vague comme "Plat du mardi" ou "Recette rapide".\n' +
  "- Les étapes doivent être suffisamment détaillées (temps de cuisson, quantités, températures quand pertinent) pour qu'un débutant puisse suivre sans ambiguïté : au moins 4 à 6 étapes selon la complexité du plat, jamais une seule phrase vague.\n" +
  '- Pour chaque étape, fournis aussi un libellé court et actionnable (3 à 5 mots, ex. "Cuire les pâtes") dans le champ "step_labels" parallèle, dans le même ordre et de la même longueur que "steps".';

export const OBJECTIVE_LABELS: Record<string, string> = {
  reduce_mental_load: "Diminuer la charge mentale",
  eat_balanced: "Manger plus équilibré",
  eat_seasonal: "Manger de saison",
  discover_new_recipes: "Découvrir de nouvelles recettes",
  eat_less_meat: "Manger moins de viande",
  reduce_grocery_budget: "Réduire le budget des courses",
  reduce_food_waste: "Réduire le gaspillage alimentaire",
  quick_meals: "Préparer des repas rapides",
  reduce_ultra_processed: "Réduire les aliments ultra-transformés",
};

function stoveLevelInstruction(prefs: Preferences): string {
  if (!prefs.stove_levels) return "";
  const levels = prefs.stove_levels;
  return `- Plaque de cuisson : ${levels} niveaux de puissance. Pour toute étape utilisant la plaque de cuisson, précise le niveau à utiliser (1 à ${levels}), ex. "Faites revenir à feu vif — niveau ${levels}/${levels}".`;
}

/** Ported from `_build_prompt_context` — the household/diversity context injected into every generation prompt. */
export function buildDraftContext(
  preferences: Preferences,
  rules: GenerationRules,
  tempIngredients: TemporaryIngredient[],
  recipes: Recipe[],
  history: HistoryEntry[]
): string {
  const lines: string[] = [];
  const recipesById = new Map(recipes.map((r) => [r.id, r]));

  lines.push(`- Nous sommes le ${new Date().toLocaleDateString("fr-FR")}.`);

  const servings = preferences.default_servings ?? 2;
  const appetite: Appetite = preferences.appetite ?? "normal";
  const multiplier = APPETITE_MULTIPLIERS[appetite] ?? 1;
  lines.push(
    `- Foyer : ${servings} personnes, appétit ${appetite} (facteur ×${multiplier} sur les quantités par rapport à un appétit normal) — calcule les quantités d'ingrédients en conséquence.`
  );

  const diets = preferences.diets ?? [];
  if (diets.includes("other")) {
    lines.push(`- Régimes : ${diets.join(", ")} (autre : ${preferences.diet_other_text || ""}).`);
  } else {
    lines.push(`- Régimes : ${diets.length ? diets.join(", ") : "aucun"}.`);
  }

  const allergies = preferences.allergies ?? [];
  if (allergies.includes("other")) {
    lines.push(`- Allergies/intolérances : ${allergies.join(", ")} (autre : ${preferences.allergies_other_text || ""}).`);
  } else {
    lines.push(`- Allergies/intolérances : ${allergies.length ? allergies.join(", ") : "aucune"}.`);
  }

  const liked = preferences.liked_ingredients ?? [];
  const disliked = preferences.disliked_ingredients ?? [];
  if (liked.length || disliked.length) {
    lines.push(
      `- Goûts : adore ${liked.length ? liked.join(", ") : "rien de spécifique"}; n'aime pas ${disliked.length ? disliked.join(", ") : "rien de spécifique"}.`
    );
  }

  const available = preferences.available_equipment ?? [];
  lines.push(`- Équipements disponibles : ${available.length ? available.join(", ") : "non spécifiés"}.`);
  if (preferences.preferred_equipment) {
    lines.push(`- Équipement à privilégier : ${preferences.preferred_equipment}.`);
  }

  const objectives = preferences.objectives ?? [];
  const objectiveLabels = objectives.map((o) => OBJECTIVE_LABELS[o] ?? o);
  lines.push(`- Objectifs : ${objectiveLabels.length ? objectiveLabels.join(", ") : "aucun objectif spécifique"}.`);
  if (objectives.includes("eat_seasonal")) {
    lines.push(
      '- Précision sur "Manger de saison" : cela concerne les fruits et légumes de saison, pas l\'exclusion de plats conviviaux comme la raclette, le couscous ou le croque-monsieur, qui restent bienvenus toute l\'année.'
    );
  }

  const budget = preferences.budget_per_serving;
  let budgetStr = budget != null ? `${budget} €` : "non spécifié";
  if (preferences.grocery_store) budgetStr += ` (courses : ${preferences.grocery_store})`;
  lines.push(`- Budget par portion : ${budgetStr}.`);

  const timeStr =
    preferences.time_profile === "quick" ? "max 20 min" : preferences.time_profile === "chill" ? "plus de 60 min" : "max 60 min";
  lines.push(`- Temps de cuisson : ${timeStr}.`);
  lines.push(`- Complexité : ${preferences.complexity ?? "free"}.`);

  const macros = preferences.macro_ratios ?? { protein_pct: 30, carb_pct: 45, fat_pct: 25 };
  lines.push(`- Répartition cible : ${macros.protein_pct}% protéines, ${macros.carb_pct}% glucides, ${macros.fat_pct}% lipides.`);

  if (preferences.target_kcal_per_serving) {
    lines.push(`- Objectif calorique par portion : ${preferences.target_kcal_per_serving} kcal (à respecter approximativement, ±10%).`);
  }

  if (tempIngredients.length) {
    const tempLines = tempIngredients.map((ing) => {
      const extra = ing.note ? ` (${ing.note})` : "";
      const dateExtra = ing.date_limit ? ` à utiliser avant ${ing.date_limit}` : "";
      return `- ${ing.quantity ?? ""} ${ing.unit ?? ""} ${ing.name}${extra}${dateExtra}`;
    });
    lines.push(`- Aliments à utiliser en priorité :\n${tempLines.join("\n")}`);
    lines.push("- Au moins 1 recette doit utiliser ces aliments.");
  } else {
    lines.push("- Aucun aliment temporaire à utiliser en priorité.");
  }

  const historyDays = preferences.history_days_for_generation ?? 20;
  const cutoff = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000).toISOString();
  const recentHistory = history.filter((h) => h.cooked_at >= cutoff);
  if (recentHistory.length) {
    const histLines = recentHistory.slice(-15).map((h) => {
      const recipe = h.recipe_id ? recipesById.get(h.recipe_id) : undefined;
      return `- ${h.cooked_at.slice(0, 10)} : ${recipe?.title ?? "Recette inconnue"}`;
    });
    lines.push(`- Historique récent :\n${histLines.join("\n")}`);
  } else {
    lines.push("- Historique récent : aucun repas cuisiné sur cette période.");
  }

  const favoriteTitles = recipes.filter((r) => r.is_favorite).map((r) => r.title);
  const likedRatings: string[] = [];
  const dislikedRatings: string[] = [];
  for (const r of recipes) {
    for (const rating of r.ratings.slice(-3)) {
      if (rating.liked) likedRatings.push(r.title);
      else dislikedRatings.push(r.title);
    }
  }
  if (favoriteTitles.length || likedRatings.length || dislikedRatings.length) {
    const favLines: string[] = [];
    if (favoriteTitles.length) favLines.push(`- Recettes favorites : ${Array.from(new Set(favoriteTitles)).slice(0, 15).join(", ")}.`);
    if (likedRatings.length)
      favLines.push(`- Recettes appréciées (👍), à pouvoir refaire occasionnellement : ${Array.from(new Set(likedRatings)).slice(0, 15).join(", ")}.`);
    if (dislikedRatings.length) favLines.push(`- Recettes à éviter (👎) : ${Array.from(new Set(dislikedRatings)).slice(0, 15).join(", ")}.`);
    lines.push(`- Favoris et retours :\n${favLines.join("\n")}`);
  }

  if (preferences.include_personal_recipes_in_context ?? true) {
    const titles = recipes.map((r) => r.title).filter(Boolean);
    lines.push(
      titles.length
        ? `- Bibliothèque personnelle (titres) :\n${titles.slice(0, 60).map((t) => `- ${t}`).join("\n")}`
        : "- Bibliothèque personnelle : aucune recette enregistrée."
    );
  } else {
    lines.push("- Bibliothèque personnelle : non incluse dans le contexte.");
  }

  const sources = preferences.recipe_sources;
  if (sources?.enabled ?? true) {
    const domains = sources?.allowed_domains ?? [];
    lines.push(`- Sources culinaires autorisées : ${domains.length ? domains.join(", ") : "aucune"}.`);
    lines.push(`- Utiliser comme inspiration : ${sources?.use_as_inspiration ?? true}.`);
  } else {
    lines.push("- Sources culinaires : désactivées.");
  }

  if (preferences.custom_context) {
    lines.push(`- Autre consigne utilisateur : ${preferences.custom_context}.`);
  }

  const stoveNote = stoveLevelInstruction(preferences);
  if (stoveNote) lines.push(stoveNote);

  lines.push(
    "- QUOTAS DE DIVERSITÉ À RESPECTER STRICTEMENT :\n" +
      `- Au maximum ${rules.max_favorites} proposition(s) parmi les recettes favorites ou évaluées positivement (👍) ci-dessus.\n` +
      `- Au maximum ${rules.max_recurrence} répétition(s) d'un plat identique ou très similaire à l'historique récent.\n` +
      `- Au moins ${rules.min_new_recipes_pct}% des propositions doivent être de nouvelles recettes, absentes de la bibliothèque personnelle listée ci-dessus.\n` +
      `- Au maximum ${rules.max_repeat_protein} proposition(s) partageant la même protéine principale (ex. poulet, boeuf, tofu).\n` +
      `- Au maximum ${rules.max_repeat_starch} proposition(s) partageant le même féculent principal (ex. riz, pâtes, pommes de terre).\n` +
      `- Au maximum ${rules.max_repeat_vegetable} proposition(s) partageant le même légume principal.`
  );

  return lines.join("\n");
}

/** Ported from `_build_draft_instructions`. */
export function buildDraftInstructions(context: string, batchCount: number, alreadyTitles: string[]): string {
  const diversityNote = alreadyTitles.length
    ? `\n\nPROPOSITIONS DÉJÀ RETENUES DANS CETTE MÊME GÉNÉRATION (à ne surtout pas répéter, choisis des idées distinctes) :\n${alreadyTitles.map((t) => `- ${t}`).join("\n")}`
    : "";

  return (
    "Tu es un assistant de planification de repas. Propose des recettes réalistes, appétissantes, cohérentes et adaptées au foyer. Écris de manière naturelle, comme un vrai humain qui cuisine.\n\n" +
    "CONTEXTE UTILISATEUR (à respecter strictement) :\n" +
    `${context}${diversityNote}\n\n` +
    `${RECIPE_QUALITY_GUIDELINES}\n\n` +
    "RÉSULTAT ATTENDU :\n" +
    "Retourne UNIQUEMENT un JSON valide, sans texte avant ni après, exactement au format :\n" +
    "{\n" +
    '  "proposals": [\n' +
    "    {\n" +
    '      "title": "Nom du plat",\n' +
    '      "servings": 2,\n' +
    '      "cooking_minutes": 25,\n' +
    '      "ingredients": [\n' +
    '        {"name": "pâtes", "quantity": 200, "unit": "g"}\n' +
    "      ],\n" +
    '      "steps": ["Étape 1...", "Étape 2..."],\n' +
    "      \"step_labels\": [\"un court libellé actionnable par étape (3-5 mots), ex. 'Cuire les pâtes'\", \"...\"],\n" +
    '      "notes": "...",\n' +
    '      "nutrition": {\n' +
    '        "kcal": 420,\n' +
    '        "protein_g": 12,\n' +
    '        "carb_g": 55,\n' +
    '        "fat_g": 14,\n' +
    '        "fiber_g": 8\n' +
    "      },\n" +
    '      "tags": ["rapide", "végétarien"],\n' +
    '      "price_per_serving": 3.5,\n' +
    '      "image_query": "short English stock-photo search phrase for this dish, 3-5 words"\n' +
    "    }\n" +
    "  ]\n" +
    "}\n\n" +
    `Propose ${batchCount} idées de repas conformes au contexte ci-dessus.`
  );
}

interface RefinableDish {
  title: string;
  servings?: number;
  cooking_minutes?: number | null;
  ingredients?: unknown;
  steps?: unknown;
  step_labels?: unknown;
  notes?: string;
  nutrition?: unknown;
  tags?: unknown;
  price_per_serving?: number | null;
  items?: unknown;
}

/** Ported from `_build_refine_instructions` — shared by recipe/proposal/guest-course free-text edits. */
export function buildRefineInstructions(current: RefinableDish, userMessage: string): string {
  let payload: Record<string, unknown>;
  let composedNote = "";

  if (current.items) {
    payload = { title: current.title, notes: current.notes ?? "", items: current.items };
    composedNote =
      ' Ce plat est un assortiment de plusieurs variantes (champ "items") : garde cette structure de liste, modifie uniquement la ou les variantes concernées par la demande.';
  } else {
    payload = {
      title: current.title,
      servings: current.servings,
      cooking_minutes: current.cooking_minutes,
      ingredients: current.ingredients ?? [],
      steps: current.steps ?? [],
      step_labels: current.step_labels ?? [],
      notes: current.notes ?? "",
      nutrition: current.nutrition ?? {},
      tags: current.tags ?? [],
      price_per_serving: current.price_per_serving ?? null,
    };
  }

  return (
    "Tu es un assistant culinaire. Voici une recette actuelle et une demande de modification de l'utilisateur.\n\n" +
    `RECETTE ACTUELLE (JSON) :\n${JSON.stringify(payload)}\n\n` +
    `DEMANDE UTILISATEUR : ${userMessage}\n\n` +
    "CONSIGNE : si la demande change un ingrédient ou une contrainte (ex. remplacer une protéine), mets à jour ingredients/steps/nutrition/tags en conséquence. Si c'est un simple conseil de cuisson ou une précision, AJOUTE-la uniquement aux steps ou notes sans changer le reste. Ne modifie que ce qui est nécessaire pour répondre à la demande, garde tout le reste identique à la recette actuelle." +
    `${composedNote}\n\n` +
    `${RECIPE_QUALITY_GUIDELINES}\n\n` +
    "RÉSULTAT ATTENDU : Retourne UNIQUEMENT un JSON valide, sans texte avant ni après, reprenant exactement la même structure que la recette actuelle ci-dessus, avec les champs modifiés selon la demande."
  );
}

/** Ported from `async_import_recipe`. */
export function buildImportInstructions(text?: string): string {
  let instructions =
    "Voici une recette fournie par l'utilisateur (texte et/ou photo en pièce jointe). Structure-la au format JSON exact ci-dessous, en français. Estime raisonnablement les valeurs manquantes plutôt que de les laisser vides quand c'est possible (temps de cuisson, portions par défaut 2, tags pertinents, nutrition approximative). Ne modifie pas le fond de la recette : reste fidèle à ce qui est fourni.\n\n" +
    `${RECIPE_QUALITY_GUIDELINES}\n\n`;

  if (text) {
    instructions += `TEXTE FOURNI :\n${text}\n\n`;
  }

  instructions +=
    "RÉSULTAT ATTENDU : Retourne UNIQUEMENT un JSON valide, sans texte avant ni après, exactement au format :\n" +
    "{\n" +
    '  "title": "Nom du plat",\n' +
    '  "servings": 2,\n' +
    '  "cooking_minutes": 25,\n' +
    '  "ingredients": [{"name": "pâtes", "quantity": 200, "unit": "g"}],\n' +
    '  "steps": ["Étape 1...", "Étape 2..."],\n' +
    '  "step_labels": ["Cuire les pâtes", "..."],\n' +
    '  "notes": "...",\n' +
    '  "nutrition": {"kcal": 420, "protein_g": 12, "carb_g": 55, "fat_g": 14, "fiber_g": 8},\n' +
    '  "tags": ["rapide", "végétarien"],\n' +
    '  "price_per_serving": 3.5\n' +
    "}";

  return instructions;
}

export function pickDraftProposalDefaults(proposal: Partial<DraftProposal>): DraftProposal {
  return {
    title: proposal.title ?? "Recette sans titre",
    servings: proposal.servings ?? 2,
    cooking_minutes: proposal.cooking_minutes ?? null,
    ingredients: proposal.ingredients ?? [],
    steps: proposal.steps ?? [],
    step_labels: proposal.step_labels ?? [],
    notes: proposal.notes ?? "",
    nutrition: proposal.nutrition ?? {},
    tags: proposal.tags ?? [],
    price_per_serving: proposal.price_per_serving ?? null,
    image_query: proposal.image_query,
    image_url: proposal.image_url ?? null,
    image_status: proposal.image_status ?? "missing",
  };
}
