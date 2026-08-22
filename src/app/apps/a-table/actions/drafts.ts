"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireATableAccess } from "@/lib/a-table/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDecryptedGeminiConfig, getDecryptedPexelsKey } from "@/lib/a-table/ai-config";
import { callGemini, GeminiError, validStepLabels } from "@/lib/a-table/gemini";
import { searchPexelsImage } from "@/lib/a-table/pexels";
import { buildDraftContext, buildDraftInstructions, buildRefineInstructions, pickDraftProposalDefaults } from "@/lib/a-table/prompts";
import { DRAFT_BATCH_SIZE } from "@/lib/a-table/constants";
import type { DraftProposal, GenerationRules, HistoryEntry, Preferences, Recipe, TemporaryIngredient } from "@/lib/a-table/types";

export interface ActionState {
  error?: string;
  success?: string;
  draftId?: string;
}

async function loadGenerationInputs(userId: string) {
  const supabase = await createClient();
  const [settingsRes, recipesRes, tempRes, historyRes] = await Promise.all([
    supabase.from("a_table_settings").select("preferences, generation_rules").eq("user_id", userId).single(),
    supabase.from("a_table_recipes").select("*").eq("user_id", userId),
    supabase.from("a_table_temporary_ingredients").select("*").eq("user_id", userId),
    supabase.from("a_table_history").select("*").eq("user_id", userId).order("cooked_at", { ascending: false }).limit(50),
  ]);

  return {
    preferences: (settingsRes.data?.preferences ?? {}) as Preferences,
    rules: (settingsRes.data?.generation_rules ?? {}) as GenerationRules,
    recipes: (recipesRes.data ?? []) as unknown as Recipe[],
    tempIngredients: (tempRes.data ?? []) as unknown as TemporaryIngredient[],
    history: (historyRes.data ?? []) as unknown as HistoryEntry[],
  };
}

async function generateBatch(
  apiKey: string,
  model: string,
  context: string,
  batchCount: number,
  alreadyTitles: string[]
): Promise<DraftProposal[]> {
  try {
    const instructions = buildDraftInstructions(context, batchCount, alreadyTitles);
    const result = (await callGemini({ apiKey, model, instructions })) as { proposals?: unknown };
    const proposals = Array.isArray(result.proposals) ? result.proposals : [];
    return (proposals as Record<string, unknown>[]).map((p) => ({
      ...pickDraftProposalDefaults(p as Partial<DraftProposal>),
      step_labels: validStepLabels(p.steps, p.step_labels),
    }));
  } catch {
    return [];
  }
}

/** Generates in batches of 4 (mirrors `_DRAFT_BATCH_SIZE`), one retry per batch, fails only if every batch fails. */
export async function generateDraft(count: number): Promise<ActionState> {
  const profile = await requireATableAccess();

  let config;
  try {
    config = await getDecryptedGeminiConfig(profile.id);
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages pour générer des propositions." };
  }

  const clampedCount = Math.min(Math.max(count, 1), 8);
  const { preferences, rules, recipes, tempIngredients, history } = await loadGenerationInputs(profile.id);
  const context = buildDraftContext(preferences, rules, tempIngredients, recipes, history);

  const proposals: DraftProposal[] = [];
  let remaining = clampedCount;

  while (remaining > 0) {
    const batchSize = Math.min(DRAFT_BATCH_SIZE, remaining);
    const alreadyTitles = proposals.map((p) => p.title);

    let batch = await generateBatch(config.apiKey, config.model, context, batchSize, alreadyTitles);
    if (batch.length === 0) {
      batch = await generateBatch(config.apiKey, config.model, context, batchSize, alreadyTitles);
    }

    proposals.push(...batch);
    remaining -= batchSize;
  }

  if (proposals.length === 0) {
    return { error: "Génération impossible pour le moment. Réessaie dans un instant." };
  }

  const pexelsKey = preferences.auto_illustrate === false ? null : await getDecryptedPexelsKey(profile.id);
  if (pexelsKey) {
    await Promise.all(
      proposals.map(async (proposal) => {
        try {
          proposal.image_url = await searchPexelsImage(proposal.image_query || proposal.title, pexelsKey);
          proposal.image_status = "found";
        } catch {
          // Best-effort — a missing illustration never blocks a draft.
        }
      })
    );
  }

  const supabase = await createClient();
  const { data: draft, error } = await supabase
    .from("a_table_drafts")
    .insert({ user_id: profile.id, proposals })
    .select("id")
    .single();

  if (error || !draft) return { error: "Impossible d'enregistrer les propositions générées." };

  revalidatePath("/apps/a-table");
  return { success: "", draftId: draft.id };
}

interface ValidateDraftInput {
  draftId: string;
  selectedIndices?: number[];
  modifications?: Record<string, Partial<DraftProposal>>;
  discard?: boolean;
}

export async function validateDraft(input: ValidateDraftInput): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: draft } = await supabase
    .from("a_table_drafts")
    .select("proposals")
    .eq("id", input.draftId)
    .eq("user_id", profile.id)
    .single();

  if (!draft) return { error: "Brouillon introuvable." };

  if (input.discard) {
    await supabase.from("a_table_drafts").delete().eq("id", input.draftId).eq("user_id", profile.id);
    revalidatePath("/apps/a-table");
    return { success: "Brouillon écarté." };
  }

  const proposals = (draft.proposals as DraftProposal[]) ?? [];
  const indices = input.selectedIndices ?? proposals.map((_, i) => i);
  const modifications = input.modifications ?? {};

  const { data: tempIngredients } = await supabase
    .from("a_table_temporary_ingredients")
    .select("id, name")
    .eq("user_id", profile.id);

  const usedTempIds = new Set<string>();
  let position = await nextBacklogPosition(profile.id);
  const createdRecipeIds: string[] = [];

  for (const idx of indices) {
    if (idx < 0 || idx >= proposals.length) continue;
    const proposal = proposals[idx];
    const mod = modifications[String(idx)] ?? {};
    const merged = { ...proposal, ...mod };

    const ingNames = new Set((merged.ingredients ?? []).map((i) => (i.name || "").toLowerCase()));
    for (const t of tempIngredients ?? []) {
      const name = (t.name || "").toLowerCase();
      if (name && Array.from(ingNames).some((n) => n.includes(name))) usedTempIds.add(t.id);
    }

    const { data: recipe, error: recipeError } = await supabase
      .from("a_table_recipes")
      .insert({
        user_id: profile.id,
        title: merged.title,
        source_kind: "ai_generated",
        servings: merged.servings,
        cooking_minutes: merged.cooking_minutes,
        ingredients: merged.ingredients,
        steps: merged.steps,
        step_labels: merged.step_labels,
        notes: merged.notes,
        nutrition: merged.nutrition,
        tags: merged.tags,
        price_per_serving: merged.price_per_serving,
        image_url: merged.image_url ?? null,
        image_status: merged.image_status ?? "missing",
      })
      .select("id")
      .single();

    if (recipeError || !recipe) continue;

    createdRecipeIds.push(recipe.id);
    await supabase.from("a_table_meal_cards").insert({
      user_id: profile.id,
      recipe_id: recipe.id,
      placement: "backlog",
      position: position++,
      servings: merged.servings,
    });
  }

  if (usedTempIds.size > 0) {
    await supabase
      .from("a_table_temporary_ingredients")
      .delete()
      .eq("user_id", profile.id)
      .in("id", Array.from(usedTempIds));
  }

  await supabase.from("a_table_drafts").delete().eq("id", input.draftId).eq("user_id", profile.id);

  revalidatePath("/apps/a-table");
  return { success: `${createdRecipeIds.length} recette(s) ajoutée(s) à « À cuisiner ».` };
}

async function nextBacklogPosition(userId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("a_table_meal_cards")
    .select("position")
    .eq("user_id", userId)
    .eq("placement", "backlog")
    .eq("status", "active")
    .order("position", { ascending: false })
    .limit(1);
  return (data?.[0]?.position ?? -1) + 1;
}

export async function regenerateProposal(draftId: string, index: number): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: draft } = await supabase
    .from("a_table_drafts")
    .select("proposals")
    .eq("id", draftId)
    .eq("user_id", profile.id)
    .single();

  if (!draft) return { error: "Brouillon introuvable." };
  const proposals = (draft.proposals as DraftProposal[]) ?? [];
  if (index < 0 || index >= proposals.length) return { error: "Proposition introuvable." };

  let config;
  try {
    config = await getDecryptedGeminiConfig(profile.id);
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages." };
  }

  const { preferences, rules, recipes, tempIngredients, history } = await loadGenerationInputs(profile.id);
  const context = buildDraftContext(preferences, rules, tempIngredients, recipes, history);
  const alreadyTitles = proposals.filter((_, i) => i !== index).map((p) => p.title);

  const batch = await generateBatch(config.apiKey, config.model, context, 1, alreadyTitles);
  if (batch.length === 0) return { error: "Impossible de régénérer cette proposition. Réessaie." };

  proposals[index] = batch[0];
  const { error } = await supabase.from("a_table_drafts").update({ proposals }).eq("id", draftId).eq("user_id", profile.id);
  if (error) return { error: "Régénéré, mais impossible d'enregistrer." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}

export async function refineProposal(draftId: string, index: number, message: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { data: draft } = await supabase
    .from("a_table_drafts")
    .select("proposals")
    .eq("id", draftId)
    .eq("user_id", profile.id)
    .single();

  if (!draft) return { error: "Brouillon introuvable." };
  const proposals = (draft.proposals as DraftProposal[]) ?? [];
  if (index < 0 || index >= proposals.length) return { error: "Proposition introuvable." };

  let config;
  try {
    config = await getDecryptedGeminiConfig(profile.id);
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages." };
  }

  try {
    const instructions = buildRefineInstructions(proposals[index], message);
    const result = (await callGemini({ ...config, instructions })) as Record<string, unknown>;
    if (!result.title) throw new GeminiError("Réponse IA incomplète.");

    proposals[index] = {
      ...proposals[index],
      ...(result as Partial<DraftProposal>),
      step_labels: validStepLabels(result.steps, result.step_labels),
    };

    const { error } = await supabase.from("a_table_drafts").update({ proposals }).eq("id", draftId).eq("user_id", profile.id);
    if (error) return { error: "Modifié, mais impossible d'enregistrer." };
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "L'IA n'a pas pu appliquer cette modification. Réessaie." };
  }

  revalidatePath("/apps/a-table");
  return { success: "" };
}

/** Toggles the public family-voting link for a draft — same opaque-token model as a recipe share link. */
export async function toggleDraftVoting(draftId: string, enable: boolean): Promise<ActionState & { voteToken?: string | null }> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const voteToken = enable ? randomUUID() : null;
  const { error } = await supabase
    .from("a_table_drafts")
    .update({ vote_token: voteToken, votes: {} })
    .eq("id", draftId)
    .eq("user_id", profile.id);

  if (error) return { error: "Impossible de mettre à jour le vote." };

  revalidatePath("/apps/a-table");
  return { success: enable ? "Vote activé." : "Vote désactivé.", voteToken };
}

/**
 * Public, unauthenticated: toggles one anonymous voter's pick on one
 * proposal. No requireATableAccess — the draft is looked up by its opaque
 * vote_token instead, same trust model as the public share links.
 */
export async function castDraftVote(voteToken: string, proposalIndex: number, voterId: string): Promise<ActionState> {
  if (!voteToken || !voterId) return { error: "Requête invalide." };

  const supabase = createAdminClient();
  const { data: draft } = await supabase.from("a_table_drafts").select("id, proposals, votes").eq("vote_token", voteToken).maybeSingle();
  if (!draft) return { error: "Ce vote n'est plus disponible." };

  const proposals = (draft.proposals as unknown as DraftProposal[]) ?? [];
  if (proposalIndex < 0 || proposalIndex >= proposals.length) return { error: "Proposition introuvable." };

  const votes = { ...((draft.votes as unknown as Record<string, string[]>) ?? {}) };
  const key = String(proposalIndex);
  const current = votes[key] ?? [];
  votes[key] = current.includes(voterId) ? current.filter((v) => v !== voterId) : [...current, voterId];

  const { error } = await supabase.from("a_table_drafts").update({ votes }).eq("id", draft.id);
  if (error) return { error: "Impossible d'enregistrer ce vote." };

  return { success: "" };
}
