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
  buildComplementaryBatchContent,
  buildNotionCategorizationBatchContent,
  buildContradictionCheckBatchContent,
  type ClaudeBatchKind,
  type ClaudeBatchRequestSpec,
} from "@/lib/el-profesor/anthropic";
import { buildCoverageSummary } from "@/lib/el-profesor/extraction-persist";
import { GeminiError } from "@/lib/gemini-shared";
import type { ElProfesorBatchJobRow, ElProfesorChapterStatus } from "@/lib/supabase/types";

export interface ActionState {
  error?: string;
  success?: string;
}

// One request per pair/chapter/fiche, tracked in el_profesor_batch_items so the
// poller (/api/cron/el-profesor-batch-poll) can find its way back to the DB
// entity a result applies to — the custom_id itself carries no meaning, kept
// as an opaque random ID to stay safely within Anthropic's custom_id charset
// (letters/digits/-/_, 64 chars max) regardless of what it points to.
type ChapterExtractionTarget = { type: "chapter"; chapterId: string; mode: "extraction" };
type ChapterComplementaryTarget = { type: "chapter"; chapterId: string; mode: "complementary"; originalStatus: ElProfesorChapterStatus };
type FicheNotionTarget = { type: "fiche"; ficheId: string };
type ContradictionTarget = { type: "contradiction"; notionId: string; ficheIdA: string; ficheIdB: string };
export type BatchItemTarget = ChapterExtractionTarget | ChapterComplementaryTarget | FicheNotionTarget | ContradictionTarget;

async function insertBatchJob(kind: ClaudeBatchKind, anthropicBatchId: string, requestCount: number, createdBy: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("el_profesor_batch_jobs")
    .insert({ kind, anthropic_batch_id: anthropicBatchId, request_count: requestCount, created_by: createdBy })
    .select("id")
    .single();
  if (error || !data) throw new GeminiError("Lot Claude soumis, mais son suivi n'a pas pu être enregistré.");
  return data.id;
}

async function insertBatchItems(batchJobId: string, items: { customId: string; target: BatchItemTarget }[]) {
  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_batch_items").insert(
    items.map((i) => ({ batch_job_id: batchJobId, custom_id: i.customId, target: i.target as never }))
  );
  if (error) throw new GeminiError("Lot Claude soumis, mais le détail des requêtes n'a pas pu être enregistré.");
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

  const batchJobId = await insertBatchJob("extraction", anthropicBatchId, requests.length, profile.id);
  await insertBatchItems(batchJobId, requests);
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
 */
export async function submitComplementaryBatch(chapterIds: string[]): Promise<ActionState> {
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

  const requests: (ClaudeBatchRequestSpec & { target: BatchItemTarget })[] = [];
  for (const chapter of eligible) {
    const [bytes, existingContent] = await Promise.all([
      downloadChapterPdfBytes(chapter.pdf_storage_path!),
      getChapterContent(chapter.id, true),
    ]);
    const coverageSummary = buildCoverageSummary(existingContent);
    requests.push({
      customId: randomUUID(),
      content: buildComplementaryBatchContent(chapter.title, bytes, coverageSummary),
      tool: claudeBatchTool("complementary"),
      target: { type: "chapter", chapterId: chapter.id, mode: "complementary", originalStatus: chapter.status },
    });
  }

  let anthropicBatchId: string;
  try {
    anthropicBatchId = await submitClaudeBatch(config, "complementary", requests);
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la soumission du lot." };
  }

  const batchJobId = await insertBatchJob("complementary", anthropicBatchId, requests.length, profile.id);
  await insertBatchItems(batchJobId, requests);
  await supabase.from("el_profesor_chapters").update({ status: "queued", extraction_error: null }).in(
    "id",
    eligible.map((c) => c.id)
  );

  revalidatePath("/apps/el-profesor");
  const skipped = chapterIds.length - eligible.length;
  return {
    success:
      `Lot Claude soumis pour ${eligible.length} chapitre(s) — récupération automatique dès que prêt.` +
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

  const batchJobId = await insertBatchJob("notion_categorization", anthropicBatchId, requests.length, profile.id);
  await insertBatchItems(batchJobId, requests);

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

  const batchJobId = await insertBatchJob("contradiction_check", anthropicBatchId, requests.length, profile.id);
  await insertBatchItems(batchJobId, requests);

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
