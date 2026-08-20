"use server";

import { revalidatePath } from "next/cache";
import { requireATableAccess } from "@/lib/a-table/dal";
import { createClient } from "@/lib/supabase/server";
import { getDecryptedGeminiConfig, getDecryptedPexelsKey } from "@/lib/a-table/ai-config";
import { callGemini, GeminiError, validStepLabels } from "@/lib/a-table/gemini";
import { searchPexelsImage } from "@/lib/a-table/pexels";
import { buildGuestMenuContext, buildGuestMenuInstructions, WINE_INSTRUCTION } from "@/lib/a-table/guest-prompts";
import { RECIPE_QUALITY_GUIDELINES, buildRefineInstructions } from "@/lib/a-table/prompts";
import { GUEST_COURSE_KEYS, GUEST_COURSE_LABELS } from "@/lib/a-table/constants";
import type { GuestCourse, GuestCourseDish, GuestCourseKey, Preferences, TemporaryIngredient, WinePairing } from "@/lib/a-table/types";
import type { Json } from "@/lib/supabase/types";

export interface ActionState {
  error?: string;
  success?: string;
}

function isComposed(course: GuestCourse): course is { items: GuestCourseDish[] } {
  return "items" in course;
}

async function illustrateCourses(courses: Record<string, GuestCourse>, selected: GuestCourseKey[], pexelsKey: string | null) {
  if (!pexelsKey) return;
  await Promise.all(
    selected.map(async (key) => {
      const course = courses[key];
      if (!course) return;
      if (isComposed(course)) {
        await Promise.all(
          course.items.map(async (item) => {
            try {
              item.image_url = await searchPexelsImage(item.image_query || item.title, pexelsKey);
              item.image_status = "found";
            } catch {
              // best-effort
            }
          })
        );
      } else {
        try {
          course.image_url = await searchPexelsImage(course.image_query || course.title, pexelsKey);
          course.image_status = "found";
        } catch {
          // best-effort
        }
      }
    })
  );
}

interface GenerateGuestMenuInput {
  guests: number;
  notes: string;
  courseKeys: GuestCourseKey[];
  composedKeys: GuestCourseKey[];
  composedCounts: Record<string, number>;
}

export async function generateGuestMenu(input: GenerateGuestMenuInput): Promise<ActionState & { menuId?: string }> {
  const profile = await requireATableAccess();

  const selected = input.courseKeys.filter((k) => GUEST_COURSE_KEYS.includes(k));
  if (selected.length === 0) return { error: "Choisis au moins un service pour le menu." };

  const composed = new Set(input.composedKeys.filter((k) => selected.includes(k)));
  const counts: Record<string, number> = {};
  for (const key of composed) {
    counts[key] = Math.max(2, Math.min(6, input.composedCounts[key] ?? 3));
  }

  let config;
  try {
    config = await getDecryptedGeminiConfig(profile.id);
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages." };
  }

  const supabase = await createClient();
  const [{ data: settingsRow }, { data: tempRows }] = await Promise.all([
    supabase.from("a_table_settings").select("preferences").eq("user_id", profile.id).single(),
    supabase.from("a_table_temporary_ingredients").select("*").eq("user_id", profile.id),
  ]);

  const preferences = (settingsRow?.preferences ?? {}) as Preferences;
  const tempIngredients = (tempRows ?? []) as unknown as TemporaryIngredient[];
  const context = buildGuestMenuContext(preferences, tempIngredients, input.notes);
  const instructions = buildGuestMenuInstructions({ guests: input.guests, context, selected, composed, counts });

  let courses: Record<string, GuestCourse>;
  let winePairings: WinePairing[];

  try {
    const result = (await callGemini({ ...config, instructions })) as { courses?: unknown; wine_pairings?: unknown };
    if (!result.courses || typeof result.courses !== "object" || !selected.every((k) => k in (result.courses as object))) {
      throw new GeminiError("Réponse IA invalide.");
    }
    courses = result.courses as Record<string, GuestCourse>;
    for (const key of selected) {
      const course = courses[key];
      if (isComposed(course)) {
        course.items = course.items.map((item) => ({ ...item, step_labels: validStepLabels(item.steps, item.step_labels) }));
      } else {
        (course as GuestCourseDish).step_labels = validStepLabels(course.steps, (course as GuestCourseDish).step_labels);
      }
    }
    winePairings = Array.isArray(result.wine_pairings) ? (result.wine_pairings as WinePairing[]) : [];
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "L'IA n'a pas pu générer ce menu. Réessaie." };
  }

  const pexelsKey = preferences.auto_illustrate === false ? null : await getDecryptedPexelsKey(profile.id);
  await illustrateCourses(courses, selected, pexelsKey);

  const { data: menu, error } = await supabase
    .from("a_table_guest_menus")
    .insert({
      user_id: profile.id,
      guests: input.guests,
      notes: input.notes,
      course_keys: selected,
      composed_keys: Array.from(composed),
      composed_counts: counts as Json,
      courses: courses as Json,
      wine_pairings: winePairings as Json,
    })
    .select("id")
    .single();

  if (error || !menu) return { error: "Menu généré, mais impossible à enregistrer." };

  revalidatePath("/apps/a-table");
  return { success: "Menu généré.", menuId: menu.id };
}

async function loadMenu(userId: string, menuId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("a_table_guest_menus").select("*").eq("id", menuId).eq("user_id", userId).single();
  return data;
}

export async function regenerateGuestCourse(menuId: string, courseKey: GuestCourseKey, itemIndex?: number): Promise<ActionState> {
  const profile = await requireATableAccess();
  const menu = await loadMenu(profile.id, menuId);
  if (!menu) return { error: "Menu introuvable." };

  const courses = menu.courses as Record<string, GuestCourse>;
  const course = courses[courseKey];
  if (!course) return { error: "Service introuvable." };
  if (itemIndex != null && !isComposed(course)) return { error: "Ce service n'est pas un assortiment." };

  let config;
  try {
    config = await getDecryptedGeminiConfig(profile.id);
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages." };
  }

  const supabase = await createClient();
  const { data: settingsRow } = await supabase.from("a_table_settings").select("preferences").eq("user_id", profile.id).single();
  const preferences = (settingsRow?.preferences ?? {}) as Preferences;
  const otherTitles = Object.entries(courses)
    .filter(([key]) => key !== courseKey)
    .map(([, c]) => (isComposed(c) ? c.items.map((i) => i.title).join(", ") : c.title))
    .join(", ");

  const instructions =
    `Remplace le service "${GUEST_COURSE_LABELS[courseKey]}" d'un menu invité par une nouvelle idée distincte, cohérente avec le reste du menu (${otherTitles || "aucun autre plat"}). Ne répète pas les mêmes ingrédients ou techniques.\n\n` +
    `CONTEXTE :\n${buildGuestMenuContext(preferences, [], menu.notes)}\n\n${RECIPE_QUALITY_GUIDELINES}\n\n` +
    'RÉSULTAT ATTENDU (JSON strict, un seul plat) :\n{"title":"...","ingredients":[{"name":"...","quantity":1,"unit":"..."}],"steps":["..."],"step_labels":["..."],"notes":"...","nutrition":{"kcal":0,"protein_g":0,"carb_g":0,"fat_g":0,"fiber_g":0},"image_query":"..."}';

  try {
    const result = (await callGemini({ ...config, instructions })) as Record<string, unknown>;
    if (!result.title) throw new GeminiError("Réponse IA incomplète.");
    const dish: GuestCourseDish = {
      title: String(result.title),
      ingredients: (result.ingredients as GuestCourseDish["ingredients"]) ?? [],
      steps: Array.isArray(result.steps) ? (result.steps as string[]) : [],
      step_labels: validStepLabels(result.steps, result.step_labels),
      notes: typeof result.notes === "string" ? result.notes : "",
      nutrition: (result.nutrition as GuestCourseDish["nutrition"]) ?? {},
      image_query: typeof result.image_query === "string" ? result.image_query : undefined,
    };

    const pexelsKey = preferences.auto_illustrate === false ? null : await getDecryptedPexelsKey(profile.id);
    if (pexelsKey) {
      try {
        dish.image_url = await searchPexelsImage(dish.image_query || dish.title, pexelsKey);
        dish.image_status = "found";
      } catch {
        // best-effort
      }
    }

    if (itemIndex != null && isComposed(course)) {
      course.items[itemIndex] = dish;
    } else {
      courses[courseKey] = dish;
    }

    const { error } = await supabase.from("a_table_guest_menus").update({ courses: courses as Json }).eq("id", menuId).eq("user_id", profile.id);
    if (error) return { error: "Régénéré, mais impossible à enregistrer." };
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Impossible de régénérer ce plat. Réessaie." };
  }

  revalidatePath("/apps/a-table");
  return { success: "" };
}

export async function refineGuestCourse(
  menuId: string,
  courseKey: GuestCourseKey,
  message: string,
  itemIndex?: number
): Promise<ActionState> {
  const profile = await requireATableAccess();
  const menu = await loadMenu(profile.id, menuId);
  if (!menu) return { error: "Menu introuvable." };

  const courses = menu.courses as Record<string, GuestCourse>;
  const course = courses[courseKey];
  if (!course) return { error: "Service introuvable." };

  const target = itemIndex != null && isComposed(course) ? course.items[itemIndex] : course;
  if (!target) return { error: "Plat introuvable." };

  let config;
  try {
    config = await getDecryptedGeminiConfig(profile.id);
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages." };
  }

  try {
    const instructions = buildRefineInstructions(target as GuestCourseDish, message);
    const result = (await callGemini({ ...config, instructions })) as Record<string, unknown>;
    if (!result.title) throw new GeminiError("Réponse IA incomplète.");

    const updated = { ...target, ...result, step_labels: validStepLabels(result.steps, result.step_labels) };
    if (itemIndex != null && isComposed(course)) course.items[itemIndex] = updated as GuestCourseDish;
    else courses[courseKey] = updated as GuestCourseDish;

    const supabase = await createClient();
    const { error } = await supabase.from("a_table_guest_menus").update({ courses: courses as Json }).eq("id", menuId).eq("user_id", profile.id);
    if (error) return { error: "Modifié, mais impossible à enregistrer." };
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "L'IA n'a pas pu appliquer cette modification. Réessaie." };
  }

  revalidatePath("/apps/a-table");
  return { success: "" };
}

export async function regenerateWinePairings(menuId: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const menu = await loadMenu(profile.id, menuId);
  if (!menu) return { error: "Menu introuvable." };

  let config;
  try {
    config = await getDecryptedGeminiConfig(profile.id);
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages." };
  }

  const courses = menu.courses as Record<string, GuestCourse>;
  const titles = Object.values(courses)
    .map((c) => (isComposed(c) ? c.items.map((i) => i.title).join(", ") : c.title))
    .join(", ");

  const instructions = `Voici les plats d'un menu : ${titles}.\n\n${WINE_INSTRUCTION}\n\nRÉSULTAT ATTENDU (JSON strict) :\n{"wine_pairings": [{"style": "...", "description": "...", "producers": []}]}`;

  try {
    const result = (await callGemini({ ...config, instructions })) as { wine_pairings?: WinePairing[] };
    const supabase = await createClient();
    const { error } = await supabase
      .from("a_table_guest_menus")
      .update({ wine_pairings: (result.wine_pairings ?? []) as Json })
      .eq("id", menuId)
      .eq("user_id", profile.id);
    if (error) return { error: "Impossible d'enregistrer les accords mets-vins." };
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Impossible de régénérer les accords. Réessaie." };
  }

  revalidatePath("/apps/a-table");
  return { success: "" };
}

export async function saveDishAsRecipe(dish: GuestCourseDish, servings: number): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { error } = await supabase.from("a_table_recipes").insert({
    user_id: profile.id,
    title: dish.title,
    source_kind: "personal_manual",
    servings: servings || 4,
    tags: [],
    ingredients: dish.ingredients as unknown as Json,
    steps: dish.steps,
    step_labels: dish.step_labels,
    notes: dish.notes,
    nutrition: dish.nutrition as unknown as Json,
    image_url: dish.image_url ?? null,
  });

  if (error) return { error: "Impossible d'enregistrer ce plat comme recette." };

  revalidatePath("/apps/a-table");
  return { success: "Plat enregistré dans « Mes recettes »." };
}

export async function dismissGuestMenu(menuId: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();
  const { error } = await supabase.from("a_table_guest_menus").delete().eq("id", menuId).eq("user_id", profile.id);
  if (error) return { error: "Impossible de supprimer ce menu." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}
