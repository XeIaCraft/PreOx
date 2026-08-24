"use server";

import { revalidatePath } from "next/cache";
import {
  requireElProfesorAdmin,
  getElProfesorGeminiConfig,
  getElProfesorAiProvider,
  getFicheTextForAI,
  getNotionSummaries,
} from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { checkNotionUpdate } from "@/lib/el-profesor/gemini";
import { submitNotionUpdateCheckBatch } from "./batches";
import { appendFicheAdditions } from "@/lib/el-profesor/extraction-persist";
import { extractTextFromUpload } from "@/lib/el-profesor/upload-text";
import { GeminiError } from "@/lib/gemini-shared";
import type { NotionUpdateSourceKind, ExtractedFicheBlock, ExtractedFlashcard } from "@/lib/el-profesor/types";

export interface ActionState {
  error?: string;
  success?: string;
}

const MAX_ARTICLE_BYTES = 15 * 1024 * 1024;

/**
 * Compares an external source against every fiche linked to a notion, and
 * stages a draft proposal (never applied automatically) for each fiche the
 * model flags as needing an update — see checkNotionUpdate/checkContradiction's
 * doc comments for the "propose, never overwrite" pattern this follows.
 * With Claude selected, delegates to the batch path (bulk, async, cheaper —
 * same reasoning as categorizeChapterNotions/detectContradictionsForNotion).
 */
async function runNotionUpdateCheck(notionId: string, sourceKind: NotionUpdateSourceKind, sourceText: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const trimmed = sourceText.trim();
  if (!trimmed) return { error: "Aucun texte à comparer." };
  if (trimmed.length < 30) return { error: "Texte trop court pour être une source exploitable." };

  const provider = await getElProfesorAiProvider();
  if (provider === "claude") {
    return submitNotionUpdateCheckBatch(notionId, sourceKind, trimmed);
  }

  const summaries = await getNotionSummaries();
  const summary = summaries.find((s) => s.notion.id === notionId);
  if (!summary) return { error: "Notion introuvable." };
  if (summary.fiches.length === 0) return { error: "Aucune fiche liée à cette notion." };

  let config;
  try {
    config = await getElProfesorGeminiConfig();
  } catch {
    return { error: "Configurez votre clé API Gemini dans les réglages d'El Profesor." };
  }

  const sourceLabel = sourceKind === "article" ? "extrait d'un article importé" : "réponse d'un outil de littérature médicale";
  const sourceExcerpt = trimmed.slice(0, 500);
  const supabase = await createClient();

  let checkedCount = 0;
  // AI calls stay sequential (one per fiche, each comparing it against the
  // source) — only the resulting proposal rows are batched into a single
  // insert after the loop instead of one round-trip per fiche.
  const proposals: {
    notion_id: string;
    fiche_id: string;
    source_kind: NotionUpdateSourceKind;
    source_excerpt: string;
    explanation: string;
    additions: never;
  }[] = [];
  try {
    for (const f of summary.fiches) {
      const content = await getFicheTextForAI(f.ficheId);
      if (!content || !content.text.trim()) continue;
      const result = await checkNotionUpdate(config, summary.notion.name, content.title, content.text, sourceLabel, trimmed);
      checkedCount += 1;
      if (!result.needs_update || (!result.blocks.length && !result.flashcards.length)) continue;

      proposals.push({
        notion_id: notionId,
        fiche_id: f.ficheId,
        source_kind: sourceKind,
        source_excerpt: sourceExcerpt,
        explanation: result.explanation,
        additions: { blocks: result.blocks, flashcards: result.flashcards } as never,
      });
    }
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la comparaison." };
  }

  let proposedCount = 0;
  if (proposals.length > 0) {
    const { error } = await supabase.from("el_profesor_notion_update_proposals").insert(proposals);
    if (!error) proposedCount = proposals.length;
  }

  revalidatePath("/apps/el-profesor/notions");
  return {
    success:
      proposedCount > 0
        ? `${checkedCount} fiche(s) comparée(s), ${proposedCount} proposition(s) de mise à jour à relire.`
        : `${checkedCount} fiche(s) comparée(s) — rien à mettre à jour, tout semble déjà à jour.`,
  };
}

/** Paste path — "je donne sa réponse" (Consensus, OpenEvidence, ou tout autre texte collé directement). */
export async function checkNotionForUpdatesFromText(notionId: string, sourceText: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  return runNotionUpdateCheck(notionId, "pasted_text", sourceText);
}

/** Upload path — "j'importe un article" (PDF, Word, PowerPoint, ou texte brut). */
export async function checkNotionForUpdatesFromArticle(notionId: string, fileBase64: string, filename: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const bytes = Buffer.from(fileBase64, "base64");
  if (bytes.byteLength > MAX_ARTICLE_BYTES) return { error: "Fichier trop lourd (15 Mo maximum)." };

  let sourceText: string;
  try {
    sourceText = await extractTextFromUpload(bytes, filename);
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la lecture du fichier." };
  }

  return runNotionUpdateCheck(notionId, "article", sourceText);
}

/** Applies a proposal's additions to its target fiche, as new draft/needs_review content — the admin still reviews and publishes it like any other generated content. */
export async function applyNotionUpdateProposal(proposalId: string): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: proposal } = await supabase.from("el_profesor_notion_update_proposals").select("*").eq("id", proposalId).maybeSingle();
  if (!proposal) return { error: "Proposition introuvable." };
  if (proposal.status !== "pending") return { error: "Cette proposition a déjà été traitée." };

  const additions = proposal.additions as unknown as { blocks: ExtractedFicheBlock[]; flashcards: ExtractedFlashcard[] };
  const added = await appendFicheAdditions(supabase, proposal.fiche_id, additions.blocks ?? [], additions.flashcards ?? []);
  if (added === 0) return { error: "Rien à appliquer pour cette proposition." };

  const { error } = await supabase
    .from("el_profesor_notion_update_proposals")
    .update({ status: "applied", resolved_at: new Date().toISOString(), resolved_by: profile.id })
    .eq("id", proposalId);
  if (error) return { error: "Contenu ajouté, mais impossible de marquer la proposition comme appliquée." };

  revalidatePath("/apps/el-profesor/notions");
  return { success: `${added} élément(s) ajouté(s) en brouillon — à relire avant publication.` };
}

export async function dismissNotionUpdateProposal(proposalId: string): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("el_profesor_notion_update_proposals")
    .update({ status: "dismissed", resolved_at: new Date().toISOString(), resolved_by: profile.id })
    .eq("id", proposalId);
  if (error) return { error: "Impossible d'ignorer cette proposition." };
  revalidatePath("/apps/el-profesor/notions");
  return { success: "Proposition ignorée." };
}
