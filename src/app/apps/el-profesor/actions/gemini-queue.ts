"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin, getElProfesorAiProvider } from "@/lib/el-profesor/dal";
import { submitExtractionBatch } from "@/app/apps/el-profesor/actions/batches";
import { createClient } from "@/lib/supabase/server";
import { processGeminiQueue } from "@/lib/el-profesor/gemini-queue";
import { GEMINI_QUEUE_NOTE } from "@/lib/el-profesor/gemini-run";
import { MIN_PAGES_TO_SPLIT } from "@/lib/el-profesor/chapter-quality";

export interface ActionState {
  error?: string;
  success?: string;
}

/**
 * Queues chapters for a server-side Gemini run — the window can be closed.
 * mode « extraction »: first extraction of chapters not yet extracted.
 * mode « complementary »: fill the gaps of chapters already extracted (one
 * pass, or passes until full coverage); their status doesn't change while
 * they wait, only a note says so.
 */
export async function enqueueGeminiChapters(chapterIds: string[], options: { mode?: "extraction" | "complementary" | "split"; untilComplete?: boolean } = {}): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  if (chapterIds.length === 0) return { error: "Aucun chapitre sélectionné." };
  const mode = options.mode ?? "extraction";
  const supabase = await createClient();

  const { data: chapters } = await supabase.from("el_profesor_chapters").select("id, status, source_kind, pdf_storage_path, source_text, pdf_page_count").in("id", chapterIds);
  const { data: alreadyQueued } = await supabase.from("el_profesor_gemini_queue").select("chapter_id").in("chapter_id", chapterIds).neq("status", "failed");
  const queued = new Set((alreadyQueued ?? []).map((q) => q.chapter_id));
  const eligible = (chapters ?? []).filter((c) => {
    if (queued.has(c.id) || c.status === "extracting" || c.status === "queued") return false;
    if (mode === "complementary") return c.source_kind === "pdf" && !!c.pdf_storage_path && (c.status === "draft_ready" || c.status === "published");
    // Splitting replaces the chapter: only chapters with no content yet, long enough to be worth it.
    if (mode === "split") return c.source_kind === "pdf" && !!c.pdf_storage_path && (c.status === "pending" || c.status === "failed") && (c.pdf_page_count ?? 0) >= MIN_PAGES_TO_SPLIT;
    return c.status !== "draft_ready" && c.status !== "published" && (c.source_kind === "pdf" ? !!c.pdf_storage_path : !!c.source_text);
  });
  if (eligible.length === 0)
    return {
      error:
        mode === "complementary"
          ? "Aucun chapitre à compléter dans la sélection (il faut un chapitre PDF déjà extrait, pas déjà en file)."
          : mode === "split"
            ? `Aucun chapitre à diviser dans la sélection (il faut un chapitre PDF pas encore extrait, d'au moins ${MIN_PAGES_TO_SPLIT} pages, pas déjà en file).`
            : "Aucun chapitre à extraire dans la sélection (déjà extraits, en cours ou en file).",
    };

  const { error } = await supabase.from("el_profesor_gemini_queue").upsert(
    eligible.map((c) => ({
      chapter_id: c.id,
      status: "waiting" as const,
      mode,
      until_complete: !!options.untilComplete,
      // « Compléter » = one pass ; « jusqu'à couverture » = as many as the page count calls for (null).
      target_passes: mode === "complementary" && !options.untilComplete ? 1 : null,
      passes_done: 0,
      original_status: mode === "complementary" ? c.status : null,
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      started_at: null,
      last_error: null,
      created_by: profile.id,
    }))
  );
  if (error) return { error: "Impossible de mettre ces chapitres en file (les migrations 092 à 094 sont-elles appliquées ?)." };
  const ids = eligible.map((c) => c.id);
  if (mode === "complementary") {
    await supabase
      .from("el_profesor_chapters")
      .update({ extraction_error: `${GEMINI_QUEUE_NOTE} : complément${options.untilComplete ? " jusqu'à couverture" : ""} en attente.` })
      .in("id", ids);
  } else {
    await supabase
      .from("el_profesor_chapters")
      .update({ status: "queued", extraction_error: mode === "split" ? `Division en file${options.untilComplete ? ", puis extraction des parties" : ""}.` : null })
      .in("id", ids);
  }

  revalidatePath("/apps/el-profesor");
  const skipped = chapterIds.length - eligible.length;
  const what = mode === "complementary" ? "à compléter" : mode === "split" ? `à diviser${options.untilComplete ? " puis extraire" : ""}` : "à extraire";
  return {
    success: `${eligible.length} chapitre(s) ${what} en file Gemini : traitement côté serveur, même fenêtre fermée ; si le quota gratuit est atteint, nouvel essai automatique plus tard.${skipped ? ` ${skipped} ignoré(s).` : ""}`,
  };
}

/** Starts working through the queue right away (the 5-minute scheduler takes over when the window is closed). */
export async function runGeminiQueueNow(): Promise<ActionState> {
  await requireElProfesorAdmin();
  const summary = await processGeminiQueue({ budgetMs: 240_000, startBeforeMs: 120_000 });
  revalidatePath("/apps/el-profesor");
  if (summary.processed === 0) return { success: summary.remaining ? `${summary.remaining} chapitre(s) en attente du prochain essai.` : "File vide." };
  return {
    success: `File Gemini : ${summary.succeeded} extrait(s)${summary.postponed ? `, ${summary.postponed} reporté(s)` : ""}${summary.failed ? `, ${summary.failed} en échec` : ""}${summary.remaining ? ` ; ${summary.remaining} encore en file (suite automatique)` : ""}.`,
  };
}

/** Takes a chapter out of the Gemini queue. */
export async function removeFromGeminiQueue(chapterId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { data: item } = await supabase.from("el_profesor_gemini_queue").select("status, mode").eq("chapter_id", chapterId).maybeSingle();
  if (!item) return { error: "Ce chapitre n'est pas dans la file Gemini." };
  if (item.status === "running") return { error: "Traitement en cours pour ce chapitre : attendez qu'il se termine." };
  await supabase.from("el_profesor_gemini_queue").delete().eq("chapter_id", chapterId);
  if (item.mode === "complementary") await supabase.from("el_profesor_chapters").update({ extraction_error: null }).eq("id", chapterId);
  else await supabase.from("el_profesor_chapters").update({ status: "pending", extraction_error: null }).eq("id", chapterId).eq("status", "queued");
  revalidatePath("/apps/el-profesor");
  return { success: "Retiré de la file." };
}

/**
 * « Relancer » from the AI tasks panel: a failed Gemini queue item goes back
 * in the queue with its own mode (extraction, complement, split) ; a chapter
 * in error outside the queue is extracted again with the current provider
 * (Gemini queue, or a Claude batch).
 */
export async function retryAiTasks(chapterIds: string[]): Promise<ActionState> {
  await requireElProfesorAdmin();
  if (chapterIds.length === 0) return { error: "Rien à relancer." };
  const supabase = await createClient();
  const { data: rows } = await supabase.from("el_profesor_gemini_queue").select("chapter_id, mode, until_complete").in("chapter_id", chapterIds).eq("status", "failed");

  const groups = new Map<string, { mode: "extraction" | "complementary" | "split"; untilComplete: boolean; ids: string[] }>();
  for (const row of rows ?? []) {
    const key = `${row.mode}:${row.until_complete}`;
    const group = groups.get(key) ?? { mode: row.mode, untilComplete: row.until_complete, ids: [] };
    group.ids.push(row.chapter_id);
    groups.set(key, group);
  }
  const inQueue = new Set((rows ?? []).map((r) => r.chapter_id));
  const others = chapterIds.filter((id) => !inQueue.has(id));

  const results: ActionState[] = [];
  for (const group of groups.values()) results.push(await enqueueGeminiChapters(group.ids, { mode: group.mode, untilComplete: group.untilComplete }));
  if (others.length) {
    results.push((await getElProfesorAiProvider()) === "claude" ? await submitExtractionBatch(others) : await enqueueGeminiChapters(others, { mode: "extraction" }));
  }

  const errors = results.filter((r) => r.error).map((r) => r.error);
  const successes = results.filter((r) => r.success).map((r) => r.success);
  if (successes.length === 0) return { error: errors.join(" ") || "Rien à relancer." };
  return { success: [...successes, ...errors].join(" ") };
}
