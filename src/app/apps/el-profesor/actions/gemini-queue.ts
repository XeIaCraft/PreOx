"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { processGeminiQueue } from "@/lib/el-profesor/gemini-queue";

export interface ActionState {
  error?: string;
  success?: string;
}

/** Queues chapters for a server-side Gemini extraction, one after the other — the window can be closed. */
export async function enqueueGeminiChapters(chapterIds: string[]): Promise<ActionState> {
  const profile = await requireElProfesorAdmin();
  if (chapterIds.length === 0) return { error: "Aucun chapitre sélectionné." };
  const supabase = await createClient();

  const { data: chapters } = await supabase.from("el_profesor_chapters").select("id, status, source_kind, pdf_storage_path, source_text").in("id", chapterIds);
  const eligible = (chapters ?? []).filter(
    (c) => c.status !== "extracting" && c.status !== "queued" && c.status !== "draft_ready" && c.status !== "published" && (c.source_kind === "pdf" ? !!c.pdf_storage_path : !!c.source_text)
  );
  if (eligible.length === 0) return { error: "Aucun chapitre à extraire dans la sélection (déjà extraits, en cours ou en file)." };

  const { error } = await supabase.from("el_profesor_gemini_queue").upsert(
    eligible.map((c) => ({ chapter_id: c.id, status: "waiting" as const, attempts: 0, next_attempt_at: new Date().toISOString(), started_at: null, last_error: null, created_by: profile.id }))
  );
  if (error) return { error: "Impossible de mettre ces chapitres en file (la migration 092 est-elle appliquée ?)." };
  await supabase
    .from("el_profesor_chapters")
    .update({ status: "queued", extraction_error: null })
    .in(
      "id",
      eligible.map((c) => c.id)
    );

  revalidatePath("/apps/el-profesor");
  const skipped = chapterIds.length - eligible.length;
  return {
    success: `${eligible.length} chapitre(s) en file Gemini : extraction l'un après l'autre, même fenêtre fermée ; en cas de quota gratuit atteint, nouvel essai automatique plus tard.${skipped ? ` ${skipped} ignoré(s) (déjà extraits, en cours ou en file).` : ""}`,
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
  const { data: item } = await supabase.from("el_profesor_gemini_queue").select("status").eq("chapter_id", chapterId).maybeSingle();
  if (!item) return { error: "Ce chapitre n'est pas dans la file Gemini." };
  if (item.status === "running") return { error: "Extraction en cours pour ce chapitre : attendez qu'elle se termine." };
  await supabase.from("el_profesor_gemini_queue").delete().eq("chapter_id", chapterId);
  await supabase.from("el_profesor_chapters").update({ status: "pending", extraction_error: null }).eq("id", chapterId).eq("status", "queued");
  revalidatePath("/apps/el-profesor");
  return { success: "Retiré de la file." };
}
