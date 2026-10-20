"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import {
  getElProfesorAiProvider,
  getElProfesorClaudeModel,
  getElProfesorGeminiFallbackModel,
  getElProfesorGeminiModel,
  hasElProfesorClaudeKey,
  hasElProfesorGeminiKey,
} from "@/lib/el-profesor/dal/ai-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { selectAllPages } from "@/lib/el-profesor/dal/shared";
import { estimateLot, estimateMerge, type MergeEstimate } from "@/lib/el-profesor/merge/estimate";
import { flattenChapters } from "@/lib/el-profesor/merge/plan";
import { loadSourceCatalog } from "@/lib/el-profesor/merge/source";
import { releaseChapters, type FicheTaskInput } from "@/lib/el-profesor/merge/stages";
import type { MergePlan, MergeProvider, MergeStats } from "@/lib/el-profesor/merge/types";
import type { ElProfesorMergeJobRow, ElProfesorMergeStage } from "@/lib/supabase/types";

export interface ActionState {
  error?: string;
  success?: string;
}

export interface MergeSourceBook {
  id: string;
  title: string;
  author: string | null;
  edition: string | null;
  fiches: number;
  publishedFiches: number;
}

export interface MergeSetupData {
  books: MergeSourceBook[];
  defaultProvider: MergeProvider;
  geminiModels: string[];
  claudeModel: string;
  hasGeminiKey: boolean;
  hasClaudeKey: boolean;
}

/** Books that can be fused (ordinary, not archived) with their fiche counts, and the AI choices. */
export async function getMergeSetupData(): Promise<MergeSetupData> {
  await requireElProfesorAdmin();
  const supabase = createAdminClient();
  const [{ data: bookRows }, provider, geminiModel, geminiFallback, claudeModel, hasGeminiKey, hasClaudeKey] = await Promise.all([
    supabase.from("el_profesor_books").select("id, title, author, edition, kind, order_index").is("archived_at", null).order("order_index"),
    getElProfesorAiProvider(),
    getElProfesorGeminiModel(),
    getElProfesorGeminiFallbackModel(),
    getElProfesorClaudeModel(),
    hasElProfesorGeminiKey(),
    hasElProfesorClaudeKey(),
  ]);
  const books = (bookRows ?? []).filter((b) => (b.kind ?? "book") === "book");
  // Counts only: three light lists (no content), whatever migration is applied — the full source list is read at launch.
  const [chapters, subs, fiches] = await Promise.all([
    selectAllPages<{ id: string; book_id: string }>((from, to) => supabase.from("el_profesor_chapters").select("id, book_id").order("id").range(from, to)),
    selectAllPages<{ id: string; chapter_id: string }>((from, to) => supabase.from("el_profesor_sub_entities").select("id, chapter_id").order("id").range(from, to)),
    selectAllPages<{ sub_entity_id: string; status: string }>((from, to) =>
      supabase.from("el_profesor_fiches").select("sub_entity_id, status").is("superseded_by_fiche_id", null).order("id").range(from, to)
    ),
  ]);
  const bookOfChapter = new Map(chapters.map((c) => [c.id, c.book_id]));
  const bookOfSub = new Map(subs.map((s) => [s.id, bookOfChapter.get(s.chapter_id)]));
  const counts = new Map<string, { fiches: number; published: number }>();
  for (const f of fiches) {
    const bookId = bookOfSub.get(f.sub_entity_id);
    if (!bookId) continue;
    const c = counts.get(bookId) ?? { fiches: 0, published: 0 };
    c.fiches++;
    if (f.status === "published") c.published++;
    counts.set(bookId, c);
  }
  return {
    books: books.map((b) => ({ id: b.id, title: b.title, author: b.author, edition: b.edition, fiches: counts.get(b.id)?.fiches ?? 0, publishedFiches: counts.get(b.id)?.published ?? 0 })),
    defaultProvider: provider,
    geminiModels: [...new Set([geminiModel, geminiFallback].filter((m): m is string => Boolean(m)))],
    claudeModel,
    hasGeminiKey,
    hasClaudeKey,
  };
}

export interface MergeEstimateResult extends MergeEstimate {
  sourceFiches: number;
  sourceBlocks: number;
  sourceCards: number;
}

export async function estimateMergeAction(input: { bookIds: string[]; includeDrafts: boolean; provider: MergeProvider; model: string }): Promise<MergeEstimateResult | { error: string }> {
  await requireElProfesorAdmin();
  if (input.bookIds.length === 0) return { error: "Choisissez au moins un livre." };
  const catalog = await loadSourceCatalog(createAdminClient(), input.bookIds, input.includeDrafts);
  const estimate = estimateMerge({ fiches: catalog.fiches, bookCount: catalog.books.length }, input.provider, input.model);
  return {
    ...estimate,
    sourceFiches: catalog.fiches.length,
    sourceBlocks: catalog.fiches.reduce((s, f) => s + f.blockCount, 0),
    sourceCards: catalog.fiches.reduce((s, f) => s + f.cardCount, 0),
  };
}

/** Starts the queue right away instead of waiting for the next pg_cron minute: the cron route runs on its own, with its own time limit. */
async function kickMergeQueue() {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  after(async () => {
    await Promise.race([
      fetch(`${proto}://${host}/api/cron/el-profesor-merge`, { headers: { Authorization: `Bearer ${secret}` } }).catch(() => null),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
  });
}

export async function startMerge(input: { title: string; bookIds: string[]; includeDrafts: boolean; provider: MergeProvider; model: string }): Promise<ActionState & { bookId?: string }> {
  const profile = await requireElProfesorAdmin();
  const title = input.title.trim();
  if (!title) return { error: "Donnez un titre à la notion." };
  if (input.bookIds.length === 0) return { error: "Choisissez au moins un livre." };
  const model = input.model.trim();
  if (!model) return { error: "Choisissez un modèle." };
  if (input.provider === "gemini" ? !(await hasElProfesorGeminiKey()) : !(await hasElProfesorClaudeKey()))
    return { error: `Clé API ${input.provider === "gemini" ? "Gemini" : "Claude"} non configurée (Réglages IA).` };

  const supabase = createAdminClient();
  // The queue needs migrations 099 (lock between stages) and 101 (lots): without them a fusion would stop half-way.
  const { error: schemaError } = await supabase.from("el_profesor_merge_jobs").select("locked_until, round").limit(1);
  if (schemaError) return { error: "Appliquez d'abord les migrations 099 et 101 (fusion par lots), puis relancez." };
  const { data: last } = await supabase.from("el_profesor_books").select("order_index").order("order_index", { ascending: false }).limit(1).maybeSingle();
  const { data: book, error: bookError } = await supabase
    .from("el_profesor_books")
    .insert({ title, kind: "merged", source_book_ids: input.bookIds, order_index: (last?.order_index ?? 0) + 1, created_by: profile.id })
    .select("id")
    .single();
  if (bookError || !book) return { error: "Création impossible (la migration 098 est-elle appliquée ?)." };

  const { error: jobError } = await supabase.from("el_profesor_merge_jobs").insert({
    book_id: book.id,
    source_book_ids: input.bookIds,
    include_drafts: input.includeDrafts,
    provider: input.provider,
    model,
    created_by: profile.id,
  });
  if (jobError) {
    await supabase.from("el_profesor_books").delete().eq("id", book.id);
    return { error: "Lancement de la fusion impossible." };
  }
  await kickMergeQueue();
  revalidatePath("/apps/el-profesor");
  revalidatePath("/apps/el-profesor/notions");
  return {
    success:
      input.provider === "claude"
        ? "Table des matières lancée en lots Claude (moitié prix) : comptez de quelques minutes à quelques heures par étape. Vous choisirez ensuite les chapitres à rédiger."
        : "Table des matières lancée côté serveur avec Gemini : vous choisirez ensuite les chapitres à rédiger. Vous pouvez fermer la fenêtre.",
    bookId: book.id,
  };
}

export interface MergeJobView {
  id: string;
  bookId: string;
  bookTitle: string;
  sourceBooks: string[];
  provider: MergeProvider;
  model: string;
  stage: ElProfesorMergeStage;
  /** Lot being written, or the last one written (0: none yet). */
  round: number;
  stats: MergeStats;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  /** Tasks of the current stage by status. */
  progress: { waiting: number; running: number; submitted: number; done: number; failed: number };
  lastTaskError: string | null;
  chapters: { total: number; published: number; draftIds: string[]; firstDraftId: string | null };
}

export async function getMergeJobs(): Promise<MergeJobView[]> {
  await requireElProfesorAdmin();
  const supabase = createAdminClient();
  const { data: jobs } = await supabase.from("el_profesor_merge_jobs").select("*").order("created_at", { ascending: false }).limit(50);
  if (!jobs?.length) return [];
  const bookIds = [...new Set(jobs.flatMap((j) => [j.book_id, ...j.source_book_ids]))];
  const { data: books } = await supabase.from("el_profesor_books").select("id, title").in("id", bookIds);
  const titleOf = new Map((books ?? []).map((b) => [b.id, b.title]));
  const { data: chapterRows } = await supabase
    .from("el_profesor_chapters")
    .select("id, book_id, status, order_index")
    .in("book_id", [...new Set(jobs.map((j) => j.book_id))])
    .order("order_index");
  const chaptersOf = (bookId: string) => {
    const own = (chapterRows ?? []).filter((c) => c.book_id === bookId);
    const drafts = own.filter((c) => c.status === "draft_ready");
    return { total: own.length, published: own.filter((c) => c.status === "published").length, draftIds: drafts.map((c) => c.id), firstDraftId: drafts[0]?.id ?? null };
  };
  const stageOfTasks: Partial<Record<ElProfesorMergeStage, string>> = { plan: "plan", assign: "assign", chapters: "chapter", fiches: "fiche", repair: "repair" };

  return Promise.all(
    jobs.map(async (j) => {
      const progress = { waiting: 0, running: 0, submitted: 0, done: 0, failed: 0 };
      let lastTaskError: string | null = null;
      const taskStage = stageOfTasks[j.stage];
      if (taskStage) {
        const statuses = ["waiting", "running", "submitted", "done", "failed"] as const;
        const counts = await Promise.all(
          statuses.map((status) =>
            supabase
              .from("el_profesor_merge_tasks")
              .select("id", { count: "exact", head: true })
              .eq("job_id", j.id)
              .eq("stage", taskStage as never)
              .eq("round", j.round ?? 0)
              .eq("status", status)
          )
        );
        statuses.forEach((s, i) => (progress[s] = counts[i].count ?? 0));
        const { data: errored } = await supabase
          .from("el_profesor_merge_tasks")
          .select("error")
          .eq("job_id", j.id)
          .not("error", "is", null)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        lastTaskError = errored?.error ?? null;
      }
      return {
        id: j.id,
        bookId: j.book_id,
        bookTitle: titleOf.get(j.book_id) ?? "(supprimé)",
        sourceBooks: j.source_book_ids.map((id) => titleOf.get(id) ?? "(livre supprimé)"),
        provider: j.provider,
        model: j.model,
        stage: j.stage,
        round: j.round ?? 0,
        stats: (j.stats as MergeStats | null) ?? {},
        error: j.error,
        createdAt: j.created_at,
        finishedAt: j.finished_at,
        progress,
        lastTaskError,
        chapters: chaptersOf(j.book_id),
      };
    })
  );
}

export async function runMergeNow(): Promise<ActionState> {
  await requireElProfesorAdmin();
  await kickMergeQueue();
  return { success: "Relancé : la suite se fait côté serveur." };
}

export async function cancelMerge(jobId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("el_profesor_merge_jobs")
    .update({ stage: "canceled", finished_at: new Date().toISOString() })
    .eq("id", jobId)
    .in("stage", ["plan", "assign", "chapters", "fiches", "repair"])
    .select("book_id")
    .maybeSingle();
  if (!data) return { error: "Cette fusion n'est plus en cours." };
  // What was already merged stays readable, as a draft to review.
  await supabase.from("el_profesor_chapters").update({ status: "draft_ready", extraction_error: "Fusion interrompue avant la fin." }).eq("book_id", data.book_id).eq("status", "extracting");
  revalidatePath("/apps/el-profesor/notions");
  return { success: "Fusion arrêtée. Ce qui était déjà fusionné reste en brouillon." };
}

/** A fusion stopped on an error (table des matières impossible…) starts again from its current stage. */
export async function retryMerge(jobId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = createAdminClient();
  const { data: job } = await supabase.from("el_profesor_merge_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) return { error: "Fusion introuvable." };
  if (job.stage === "failed") {
    await supabase.from("el_profesor_merge_tasks").delete().eq("job_id", jobId).eq("stage", "plan");
    await supabase.from("el_profesor_merge_jobs").update({ stage: "plan", error: null, finished_at: null }).eq("id", jobId);
  } else {
    // The current lot only: an earlier lot's failures were already kept as they were (verbatim, « à vérifier »).
    await supabase
      .from("el_profesor_merge_tasks")
      .update({ status: "waiting", attempts: 0, next_attempt_at: new Date().toISOString(), error: null })
      .eq("job_id", jobId)
      .eq("round", job.round ?? 0)
      .eq("status", "failed");
    await supabase.from("el_profesor_merge_jobs").update({ error: null }).eq("id", jobId);
  }
  await kickMergeQueue();
  revalidatePath("/apps/el-profesor/notions");
  return { success: "Relancé." };
}

/** Deletes a merged book: its cards go back to their books (trigger, migration 098), with their own history intact. */
export async function deleteMergedBook(bookId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = createAdminClient();
  const { data: book } = await supabase.from("el_profesor_books").select("id, kind").eq("id", bookId).maybeSingle();
  if (!book || book.kind !== "merged") return { error: "Ce n'est pas un livre fusionné." };
  await supabase.from("el_profesor_merge_jobs").update({ stage: "canceled" }).eq("book_id", bookId).in("stage", ["plan", "assign", "chapters", "fiches", "repair"]);
  const { error } = await supabase.from("el_profesor_books").delete().eq("id", bookId);
  if (error) return { error: "Suppression impossible." };
  revalidatePath("/apps/el-profesor");
  revalidatePath("/apps/el-profesor/notions");
  return { success: "Notion supprimée ; les cartes sources sont revenues dans leurs livres." };
}

// -- Lots : table des matières et chapitres à rédiger -----------------------

export interface MergeTocFiche {
  title: string;
  sources: { book: string; chapter: string; title: string }[];
}

export interface MergeTocChapter {
  chapterId: string;
  title: string;
  /** held: not chosen yet; writing: in the lot being written; written: done (draft or published). */
  state: "held" | "writing" | "written";
  lot: number;
  fiches: MergeTocFiche[];
  /** Estimated cost of writing it, at the fusion's model. */
  costUsd: number | null;
  sourceChars: number;
}

export interface MergeToc {
  parts: { title: string; subParts: { title: string; chapters: MergeTocChapter[] }[] }[];
  coverage: {
    /** Source fiches the books hold now. */
    sourceFiches: number;
    /** …of which some merged fiche uses. */
    used: number;
    /** Fiches added to the books since the table of contents: not in it (a few shown). */
    addedSince: { book: string; chapter: string; title: string }[];
    addedSinceCount: number;
    /** Source fiches of the table of contents deleted since: left out when their chapter is written. */
    goneSince: number;
  };
}

/** The whole planned book, chapter by chapter, with each merged fiche's sources — to check it and choose what to write. */
export async function getMergeToc(jobId: string): Promise<MergeToc | { error: string }> {
  await requireElProfesorAdmin();
  const supabase = createAdminClient();
  const { data: job } = await supabase.from("el_profesor_merge_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job?.plan) return { error: "La table des matières n'est pas encore établie." };
  const plan = job.plan as unknown as MergePlan;
  const tasks = await selectAllPages<{ status: string; round: number; input: unknown }>((from, to) =>
    supabase.from("el_profesor_merge_tasks").select("status, round, input").eq("job_id", jobId).eq("stage", "fiche").order("ref_key").range(from, to)
  );
  const byChapter = new Map<string, { status: string; round: number; input: FicheTaskInput }[]>();
  for (const t of tasks) {
    const input = t.input as FicheTaskInput;
    byChapter.set(input.chapterId, [...(byChapter.get(input.chapterId) ?? []), { ...t, input }]);
  }
  const writingLot = job.stage === "fiches" || job.stage === "repair" ? job.round : -1;
  const chapters = new Map(
    flattenChapters(plan).map((c) => {
      const own = (byChapter.get(c.chapterId) ?? []).sort((a, b) => a.input.orderIndex - b.input.orderIndex);
      const chars = own.map((t) => t.input.chars);
      const lot = Math.max(0, ...own.map((t) => t.round));
      const state: MergeTocChapter["state"] = own.some((t) => t.status === "held") ? "held" : lot === writingLot ? "writing" : "written";
      return [
        c.chapterId,
        {
          chapterId: c.chapterId,
          title: c.title,
          state,
          lot,
          fiches: own.map((t) => ({ title: t.input.title, sources: t.input.sources.map((src) => ({ book: src.bookTitle, chapter: src.chapterTitle, title: src.title })) })),
          costUsd: estimateLot(chars, job.provider, job.model).costUsd,
          sourceChars: chars.reduce((a, b) => a + b, 0),
        } satisfies MergeTocChapter,
      ];
    })
  );

  const catalog = await loadSourceCatalog(supabase, job.source_book_ids, job.include_drafts);
  const used = new Set(tasks.flatMap((t) => (t.input as FicheTaskInput).sources.map((src) => src.ficheId)));
  const now = new Set(catalog.fiches.map((f) => f.ficheId));
  const added = catalog.fiches.filter((f) => !used.has(f.ficheId));
  return {
    parts: plan.parts.map((p) => ({
      title: p.title,
      subParts: p.subParts.map((sp) => ({ title: sp.title, chapters: sp.chapters.map((c) => chapters.get(c.chapterId)).filter((c): c is MergeTocChapter => Boolean(c)) })),
    })),
    coverage: {
      sourceFiches: catalog.fiches.length,
      used: catalog.fiches.length - added.length,
      addedSince: added.slice(0, 30).map((f) => ({ book: f.bookTitle, chapter: f.chapterTitle, title: f.title })),
      addedSinceCount: added.length,
      goneSince: [...used].filter((id) => !now.has(id)).length,
    },
  };
}

/** Writes the chosen chapters now (one lot): the rest of the table of contents waits, at no cost. */
export async function generateMergeChapters(jobId: string, chapterIds: string[]): Promise<ActionState> {
  await requireElProfesorAdmin();
  if (chapterIds.length === 0) return { error: "Choisissez au moins un chapitre." };
  const supabase = createAdminClient();
  const { data: job } = await supabase.from("el_profesor_merge_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) return { error: "Fusion introuvable." };
  if (job.stage !== "ready") return { error: job.stage === "fiches" || job.stage === "repair" ? "Un lot est déjà en cours : attendez qu'il se termine." : "La table des matières n'est pas prête." };
  try {
    const lot = await releaseChapters(supabase, job as ElProfesorMergeJobRow, chapterIds);
    await kickMergeQueue();
    revalidatePath("/apps/el-profesor");
    revalidatePath("/apps/el-profesor/notions");
    return {
      success: `Lot ${(job.round ?? 0) + 1} lancé : ${lot.chapters} chapitre${lot.chapters > 1 ? "s" : ""}, ${lot.fiches} fiche${lot.fiches > 1 ? "s" : ""} à rédiger${
        lot.dropped ? ` (${lot.dropped} sans source restante, retirée${lot.dropped > 1 ? "s" : ""})` : ""
      }.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lancement du lot impossible." };
  }
}
