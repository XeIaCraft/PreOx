"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAccess, getElProfesorGeminiConfig } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateFromSelection } from "@/lib/el-profesor/gemini";
import { logContentChange } from "@/lib/el-profesor/content-log";
import { GeminiError } from "@/lib/gemini-shared";
import type { BlockContent, Citation, FlashcardSide } from "@/lib/el-profesor/types";

export interface ActionState {
  error?: string;
  success?: string;
}

/**
 * Lets any user with module access turn a passage they picked by hand in
 * the PDF into a new draft block (+ optional flashcard) on an existing
 * sub-entity. Users can't write to the content tables directly (admin-only
 * RLS) — this action validates access first, then uses the service-role
 * client for the one scoped insert it performs, matching the pattern
 * already used for chapter PDF storage.
 */
export async function proposeFromSelection(
  chapterId: string,
  subEntityId: string,
  chapterTitle: string,
  page: number,
  quote: string
): Promise<ActionState> {
  await requireElProfesorAccess();
  const supabase = await createClient();

  const { data: subEntity } = await supabase
    .from("el_profesor_sub_entities")
    .select("id, name, chapter_id")
    .eq("id", subEntityId)
    .eq("chapter_id", chapterId)
    .single();
  if (!subEntity) return { error: "Sous-entité introuvable." };

  const { data: fiche } = await supabase.from("el_profesor_fiches").select("id").eq("sub_entity_id", subEntity.id).single();
  if (!fiche) return { error: "Fiche introuvable pour cette sous-entité." };

  const trimmedQuote = quote.trim();
  if (trimmedQuote.length < 10) return { error: "Sélectionne un passage un peu plus long." };

  try {
    const config = await getElProfesorGeminiConfig();
    const result = await generateFromSelection(config, subEntity.name, chapterTitle, page, trimmedQuote);

    const admin = createAdminClient();

    const { count } = await admin
      .from("el_profesor_fiche_blocks")
      .select("id", { count: "exact", head: true })
      .eq("fiche_id", fiche.id);

    const { error: blockError } = await admin.from("el_profesor_fiche_blocks").insert({
      fiche_id: fiche.id,
      order_index: count ?? 0,
      block_type: result.block.block_type,
      content: result.block.content as unknown as BlockContent as never,
      citations: result.block.citations as unknown as Citation[] as never,
      needs_review: true,
      status: "draft",
    });
    if (blockError) return { error: "Impossible d'enregistrer le bloc proposé." };

    if (result.flashcard) {
      const { error: cardError } = await admin.from("el_profesor_flashcards").insert({
        fiche_id: fiche.id,
        front: { text: result.flashcard.front } as FlashcardSide as never,
        back: { text: result.flashcard.back } as FlashcardSide as never,
        citations: result.flashcard.citations as unknown as Citation[] as never,
        status: "draft",
        needs_review: true,
      });
      if (cardError) return { error: "Bloc enregistré, mais échec de l'enregistrement de la flashcard." };
    }

    revalidatePath("/apps/el-profesor");
    return {
      success: result.flashcard
        ? "Bloc et flashcard ajoutés en brouillon — un administrateur doit encore les publier."
        : "Bloc ajouté en brouillon — un administrateur doit encore le publier.",
    };
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la génération à partir du passage sélectionné." };
  }
}

const MAX_CONTRIBUTION_LENGTH = 1000;

/**
 * Piste d'amélioration 2026-08-24 ("contributions des utilisateurs") — a
 * third, simplest path alongside signalement (report a problem) and
 * proposeFromSelection (AI-assisted, needs a PDF passage): any user with
 * module access can hand-write a flashcard for an existing sub-entity, no
 * AI and no source text required — their own mnemonic, clarification, or
 * exam-style question. Lands as draft/needs_review, exactly like every
 * other non-admin-authored content, and is never auto-published.
 */
export async function proposeManualFlashcard(subEntityId: string, front: string, back: string): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();

  const trimmedFront = front.trim().slice(0, MAX_CONTRIBUTION_LENGTH);
  const trimmedBack = back.trim().slice(0, MAX_CONTRIBUTION_LENGTH);
  if (trimmedFront.length < 5 || trimmedBack.length < 1) return { error: "La question et la réponse sont obligatoires." };

  const { data: subEntity } = await supabase.from("el_profesor_sub_entities").select("id").eq("id", subEntityId).maybeSingle();
  if (!subEntity) return { error: "Sous-entité introuvable." };

  const { data: fiche } = await supabase.from("el_profesor_fiches").select("id").eq("sub_entity_id", subEntityId).maybeSingle();
  if (!fiche) return { error: "Fiche introuvable pour cette sous-entité." };

  const admin = createAdminClient();
  const { data: card, error } = await admin
    .from("el_profesor_flashcards")
    .insert({
      fiche_id: fiche.id,
      front: { text: trimmedFront } as FlashcardSide as never,
      back: { text: trimmedBack } as FlashcardSide as never,
      citations: [] as unknown as Citation[] as never,
      status: "draft",
      needs_review: true,
    })
    .select("id")
    .single();
  if (error || !card) return { error: "Impossible d'enregistrer cette contribution." };

  await logContentChange(profile.id, "flashcard", card.id, "user_contribution");

  revalidatePath("/apps/el-profesor");
  return { success: "Merci ! Votre flashcard est en attente de relecture par un administrateur." };
}
