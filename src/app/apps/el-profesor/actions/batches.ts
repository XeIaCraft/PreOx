"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  requireElProfesorAdmin,
  getElProfesorClaudeConfig,
  getChapterContent,
  getFicheTextForAI,
  getAllNotionNames,
  getNotionSummaries,
} from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { downloadChapterPdfBytes } from "@/lib/el-profesor/storage";
import {
  submitClaudeBatch,
  claudeBatchTool,
  buildExtractionBatchContent,
  buildNotionCategorizationBatchContent,
  buildContradictionCheckBatchContent,
  buildNotionUpdateCheckBatchContent,
  type ClaudeBatchRequestSpec,
} from "@/lib/el-profesor/anthropic";
import { insertBatchJob, insertBatchItems, submitComplementaryBatchCore, type BatchItemTarget } from "@/lib/el-profesor/batch-submit";
import { pollAllClaudeBatches } from "@/lib/el-profesor/batch-poll";
import { GeminiError } from "@/lib/gemini-shared";
import type { ElProfesorBatchJobRow, ElProfesorNotionUpdateSourceKind } from "@/lib/supabase/types";

export interface ActionState {
  error?: string;
  success?: string;
}

/**
 * Submits every eligible chapter's initial extraction as one Claude batch
 * (50% cheaper than the same calls made one by one — see anthropic.ts).
 * Chapters move to `queued`; results land later via the cron poller, no
 * admin needing to keep the tab open. Word/PowerPoint chapters are skipped
 * (Claude's batch path is PDF-only, same restriction as the sync path).
 */
export async function submitExtractionBatch(chapterIds: string[]): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  if (chapterIds.length === 0) return { error: "Aucun chapitre sélectionné." };

  const supabase = await createClient();
  const { data: chapters } = await supabase.from("el_profesor_chapters").select("*").in("id", chapterIds);
  const eligible = (chapters ?? []).filter((c) => c.source_kind === "pdf" && c.status !== "extracting" && c.status !== "queued");
  if (eligible.length === 0) return { error: "Aucun chapitre PDF éligible (déjà en cours ou en file)." };

  let config;
  try {
    config = await getElProfesorClaudeConfig();
  } catch {
    return { error: "Configurez votre clé API Claude dans les réglages d'El Profesor." };
  }

  const requests: (ClaudeBatchRequestSpec & { target: BatchItemTarget })[] = [];
  for (const chapter of eligible) {
    const bytes = await downloadChapterPdfBytes(chapter.pdf_storage_path!);
    requests.push({
      customId: randomUUID(),
      content: buildExtractionBatchContent(chapter.title, bytes),
      tool: claudeBatchTool("extraction"),
      target: { type: "chapter", chapterId: chapter.id, mode: "extraction" },
    });
  }

  let anthropicBatchId: string;
  try {
    anthropicBatchId = await submitClaudeBatch(config, "extraction", requests);
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la soumission du lot." };
  }

  const batchJobId = await insertBatchJob(supabase, "extraction", anthropicBatchId, requests.length, profile.id, config.model);
  await insertBatchItems(supabase, batchJobId, requests);
  await supabase.from("el_profesor_chapters").update({ status: "queued", extraction_error: null }).in(
    "id",
    eligible.map((c) => c.id)
  );

  revalidatePath("/apps/el-profesor");
  const skipped = chapterIds.length - eligible.length;
  return {
    success:
      `Lot Claude soumis pour ${eligible.length} chapitre(s) — récupération automatique dès que prêt (généralement sous l'heure).` +
      (skipped > 0 ? ` ${skipped} chapitre(s) ignoré(s) (non-PDF ou déjà en cours).` : ""),
  };
}

/**
 * Submits a gap-fill pass for every eligible chapter as one Claude batch.
 * Mirrors submitExtractionBatch — see there for the batching rationale.
 * With `untilComplete: true`, each chapter's chain keeps going on its own
 * after this first pass: the cron poller re-submits (via
 * continueComplementaryBatch in batch-submit.ts) as long as a pass still
 * made progress and coverage isn't complete, up to the same safety cap the
 * synchronous Gemini "jusqu'à couverture" loop uses.
 */
export async function submitComplementaryBatch(chapterIds: string[], options?: { untilComplete?: boolean }): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  if (chapterIds.length === 0) return { error: "Aucun chapitre sélectionné." };

  const supabase = await createClient();
  const { data: chapters } = await supabase.from("el_profesor_chapters").select("*").in("id", chapterIds);
  const eligible = (chapters ?? []).filter(
    (c) => c.source_kind === "pdf" && (c.status === "draft_ready" || c.status === "published")
  );
  if (eligible.length === 0) {
    return { error: "Aucun chapitre éligible (il faut une extraction initiale déjà faite, et un chapitre PDF)." };
  }

  let config;
  try {
    config = await getElProfesorClaudeConfig();
  } catch {
    return { error: "Configurez votre clé API Claude dans les réglages d'El Profesor." };
  }

  let requestCount: number;
  try {
    const result = await submitComplementaryBatchCore(
      supabase,
      config,
      eligible,
      profile.id,
      options?.untilComplete ?? false,
      new Map(eligible.map((c) => [c.id, 0]))
    );
    requestCount = result.requestCount;
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la soumission du lot." };
  }

  revalidatePath("/apps/el-profesor");
  const skipped = chapterIds.length - eligible.length;
  return {
    success:
      `Lot Claude soumis pour ${requestCount} chapitre(s)${options?.untilComplete ? " — enchaînera automatiquement jusqu'à couverture" : ""} — récupération automatique dès que prêt.` +
      (skipped > 0 ? ` ${skipped} chapitre(s) ignoré(s).` : ""),
  };
}

/**
 * Tags every published fiche of a chapter with cross-book notions in one
 * Claude batch instead of one sequential call per fiche — the "réunification"
 * step (item 51+) is exactly the kind of bulk, non-urgent operation the
 * user asked to route through Claude's cheaper async path.
 */
export async function submitNotionCategorizationBatch(chapterId: string): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  const supabase = await createClient();

  const subEntities = await getChapterContent(chapterId, false);
  const fiches = subEntities.filter((s) => s.fiche).map((s) => s.fiche!);
  if (fiches.length === 0) return { error: "Aucune fiche publiée dans ce chapitre à catégoriser." };

  let config;
  try {
    config = await getElProfesorClaudeConfig();
  } catch {
    return { error: "Configurez votre clé API Claude dans les réglages d'El Profesor." };
  }

  // One shared snapshot of existing notion names for the whole batch — good
  // enough for reuse-detection even though fiches in this same batch won't
  // see each other's brand-new notions (same tradeoff the sequential/Gemini
  // path already has within one run, just more visible when batched).
  const existingNotionNames = await getAllNotionNames();

  const requests: (ClaudeBatchRequestSpec & { target: BatchItemTarget })[] = [];
  for (const fiche of fiches) {
    const content = await getFicheTextForAI(fiche.id);
    if (!content || !content.text.trim()) continue;
    requests.push({
      customId: randomUUID(),
      content: buildNotionCategorizationBatchContent(content.title, content.text, existingNotionNames),
      tool: claudeBatchTool("notion_categorization"),
      target: { type: "fiche", ficheId: fiche.id },
    });
  }
  if (requests.length === 0) return { error: "Aucune fiche avec du contenu à catégoriser." };

  let anthropicBatchId: string;
  try {
    anthropicBatchId = await submitClaudeBatch(config, "notion_categorization", requests);
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la soumission du lot." };
  }

  const batchJobId = await insertBatchJob(supabase, "notion_categorization", anthropicBatchId, requests.length, profile.id, config.model);
  await insertBatchItems(supabase, batchJobId, requests);

  revalidatePath("/apps/el-profesor/notions");
  return { success: `Lot Claude soumis pour ${requests.length} fiche(s) — les notions seront appliquées automatiquement dès que prêt.` };
}

// Batched calls are cheap and asynchronous, so this run cap is far more
// generous than the synchronous Gemini path's MAX_CONTRADICTION_PAIRS_PER_RUN
// (15) — still bounded well under Anthropic's 100k-requests-per-batch limit.
const MAX_CONTRADICTION_PAIRS_PER_BATCH = 300;

/**
 * Compares every pair of fiches linked to a notion in one Claude batch —
 * the batched counterpart of detectContradictionsForNotion in notions.ts.
 */
export async function submitContradictionCheckBatch(notionId: string): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  const supabase = await createClient();

  const summaries = await getNotionSummaries();
  const summary = summaries.find((s) => s.notion.id === notionId);
  if (!summary) return { error: "Notion introuvable." };
  if (summary.fiches.length < 2) return { error: "Il faut au moins 2 fiches liées à cette notion pour comparer." };

  let config;
  try {
    config = await getElProfesorClaudeConfig();
  } catch {
    return { error: "Configurez votre clé API Claude dans les réglages d'El Profesor." };
  }

  const pairs: [string, string][] = [];
  outer: for (let i = 0; i < summary.fiches.length; i++) {
    for (let j = i + 1; j < summary.fiches.length; j++) {
      pairs.push([summary.fiches[i].ficheId, summary.fiches[j].ficheId]);
      if (pairs.length >= MAX_CONTRADICTION_PAIRS_PER_BATCH) break outer;
    }
  }

  const requests: (ClaudeBatchRequestSpec & { target: BatchItemTarget })[] = [];
  for (const [ficheIdA, ficheIdB] of pairs) {
    const [contentA, contentB] = await Promise.all([getFicheTextForAI(ficheIdA), getFicheTextForAI(ficheIdB)]);
    if (!contentA?.text.trim() || !contentB?.text.trim()) continue;
    requests.push({
      customId: randomUUID(),
      content: buildContradictionCheckBatchContent(summary.notion.name, contentA.title, contentA.text, contentB.title, contentB.text),
      tool: claudeBatchTool("contradiction_check"),
      target: { type: "contradiction", notionId, ficheIdA, ficheIdB },
    });
  }
  if (requests.length === 0) return { error: "Aucune paire de fiches avec du contenu à comparer." };

  let anthropicBatchId: string;
  try {
    anthropicBatchId = await submitClaudeBatch(config, "contradiction_check", requests);
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la soumission du lot." };
  }

  const batchJobId = await insertBatchJob(supabase, "contradiction_check", anthropicBatchId, requests.length, profile.id, config.model);
  await insertBatchItems(supabase, batchJobId, requests);

  revalidatePath("/apps/el-profesor/notions");
  const truncated = (summary.fiches.length * (summary.fiches.length - 1)) / 2 > MAX_CONTRADICTION_PAIRS_PER_BATCH;
  return {
    success:
      `Lot Claude soumis pour ${requests.length} paire(s) — résultats appliqués automatiquement dès que prêts.` +
      (truncated ? ` Limite de ${MAX_CONTRADICTION_PAIRS_PER_BATCH} paires atteinte — relancez pour continuer au-delà.` : ""),
  };
}

/** Recent batch jobs, for the admin "Lots Claude" panel — no need to check Anthropic's own dashboard. */
export async function getBatchJobs(): Promise<ElProfesorBatchJobRow[]> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_batch_jobs").select("*").order("created_at", { ascending: false }).limit(30);
  return data ?? [];
}

/**
 * On-demand version of the cron poller (item requested 2026-08-25, after a
 * report of a chapter staying at "En file (lot Claude)" while Claude had
 * already billed and finished the batch) — the cron only fires once a day
 * on the Vercel Hobby plan, which can otherwise leave a finished batch
 * unlanded for up to 24h. Runs the exact same pass, just triggered from the
 * "Vérifier maintenant" button instead of waiting for the schedule.
 */
export async function pollClaudeBatchesNow(): Promise<ActionState & { polled?: number; completed?: number }> {
  await requireElProfesorAdmin();
  const { polled, completed } = await pollAllClaudeBatches();
  if (polled === 0) return { success: "Aucun lot en attente — rien à vérifier.", polled, completed };
  return {
    success: `${polled} lot(s) vérifié(s), ${completed} terminé(s) et appliqué(s).`,
    polled,
    completed,
  };
}

/**
 * Compares an external source (pasted answer or extracted article text) to
 * every fiche linked to a notion, in one Claude batch — called by
 * actions/notion-updates.ts when Claude is the active provider. `sourceText`
 * is the full text (already read from the paste or the uploaded file);
 * only a short excerpt of it is stored per-item, for admin traceability —
 * the full text isn't needed again once each fiche has been checked.
 */
export async function submitNotionUpdateCheckBatch(
  notionId: string,
  sourceKind: ElProfesorNotionUpdateSourceKind,
  sourceText: string
): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  const supabase = await createClient();
  if (!sourceText.trim()) return { error: "Source vide." };

  const summaries = await getNotionSummaries();
  const summary = summaries.find((s) => s.notion.id === notionId);
  if (!summary) return { error: "Notion introuvable." };
  if (summary.fiches.length === 0) return { error: "Aucune fiche liée à cette notion." };

  let config;
  try {
    config = await getElProfesorClaudeConfig();
  } catch {
    return { error: "Configurez votre clé API Claude dans les réglages d'El Profesor." };
  }

  const sourceLabel = sourceKind === "article" ? "extrait d'un article importé" : "réponse d'un outil de littérature médicale";
  const sourceExcerpt = sourceText.slice(0, 500);

  const requests: (ClaudeBatchRequestSpec & { target: BatchItemTarget })[] = [];
  for (const f of summary.fiches) {
    const content = await getFicheTextForAI(f.ficheId);
    if (!content || !content.text.trim()) continue;
    requests.push({
      customId: randomUUID(),
      content: buildNotionUpdateCheckBatchContent(summary.notion.name, content.title, content.text, sourceLabel, sourceText),
      tool: claudeBatchTool("notion_update_check"),
      target: { type: "notion_update", notionId, ficheId: f.ficheId, sourceKind, sourceExcerpt },
    });
  }
  if (requests.length === 0) return { error: "Aucune fiche avec du contenu à comparer." };

  let anthropicBatchId: string;
  try {
    anthropicBatchId = await submitClaudeBatch(config, "notion_update_check", requests);
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la soumission du lot." };
  }

  const batchJobId = await insertBatchJob(supabase, "notion_update_check", anthropicBatchId, requests.length, profile.id, config.model);
  await insertBatchItems(supabase, batchJobId, requests);

  revalidatePath("/apps/el-profesor/notions");
  return { success: `Lot Claude soumis pour ${requests.length} fiche(s) — les propositions apparaîtront ici dès qu'elles seront prêtes.` };
}
