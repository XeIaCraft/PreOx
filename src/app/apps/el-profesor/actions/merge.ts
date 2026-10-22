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
import { estimateMerge, type MergeEstimate } from "@/lib/el-profesor/merge/estimate";
import { mergeCosts, type MergeCosts } from "@/lib/el-profesor/merge/costs";
import { flattenChapters } from "@/lib/el-profesor/merge/plan";
import { loadSourceCatalog } from "@/lib/el-profesor/merge/source";
import { jobUsage, redoFailedRepairs, redoableRepairs, releaseChapters, type FicheTaskInput, type LotModel } from "@/lib/el-profesor/merge/stages";
import { estimateCostUsd } from "@/lib/el-profesor/ai-pricing";
import type { MergePlan, MergeProvider, MergeStats } from "@/lib/el-profesor/merge/types";
import type { ElProfesorMergeJobRow, ElProfesorMergeStage, Json } from "@/lib/supabase/types";

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
  /** Repairs the AI couldn't do (credit exhausted…), in chapters not yet published: they can be done again. */
  repairRedo: { fiches: number; costUsd: number | null } | null;
  /** Spent so far: the table of contents and each lot, each at the model it used. */
  costs: MergeCosts;
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
        stats: viewStats(j.stats),
        error: j.error,
        createdAt: j.created_at,
        finishedAt: j.finished_at,
        progress,
        lastTaskError,
        chapters: chaptersOf(j.book_id),
        repairRedo: j.stage === "ready" || j.stage === "done" ? await repairRedoOf(j as ElProfesorMergeJobRow) : null,
        costs: await costsOf(j as ElProfesorMergeJobRow),
      };
    })
  );
}

/** The job's stats without what's only kept for the server (the table of contents' summary). */
function viewStats(stats: Json | null): MergeStats {
  const rest = { ...((stats as (MergeStats & { tocSummary?: unknown }) | null) ?? {}) };
  delete rest.tocSummary;
  return rest;
}

async function costsOf(job: ElProfesorMergeJobRow): Promise<MergeCosts> {
  const stats = viewStats(job.stats);
  const tocUsage = stats.toc ?? (stats.inputTokens ? await jobUsage(createAdminClient(), job.id, undefined, ["plan", "assign", "chapter"]) : { inputTokens: 0, outputTokens: 0 });
  return mergeCosts({ provider: job.provider, model: job.model, stage: job.stage, round: job.round ?? 0, stats }, tocUsage);
}

/** How many failed repairs can be done again, and roughly what that costs (from the repairs already done). */
async function repairRedoOf(job: ElProfesorMergeJobRow): Promise<MergeJobView["repairRedo"]> {
  const supabase = createAdminClient();
  const tasks = await redoableRepairs(supabase, job);
  if (!tasks.length) return null;
  const done = await selectAllPages<{ input_tokens: number | null; output_tokens: number | null }>((from, to) =>
    supabase.from("el_profesor_merge_tasks").select("input_tokens, output_tokens").eq("job_id", job.id).eq("stage", "repair").eq("status", "done").order("id").range(from, to)
  );
  const avg = (key: "input_tokens" | "output_tokens") => (done.length ? done.reduce((s, t) => s + (t[key] ?? 0), 0) / done.length : 0);
  const priced = job.provider === "claude" ? `claude:${job.model}` : job.model;
  return { fiches: tasks.length, costUsd: done.length ? estimateCostUsd(priced, avg("input_tokens") * tasks.length, avg("output_tokens") * tasks.length) : null };
}

/** « Refaire le rattrapage » : the copies left by failed repairs come out and the AI integrates the missing items again. */
export async function redoMergeRepair(jobId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = createAdminClient();
  const { data: job } = await supabase.from("el_profesor_merge_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) return { error: "Fusion introuvable." };
  if (job.stage !== "ready" && job.stage !== "done") return { error: "Attendez la fin du lot en cours." };
  try {
    const result = await redoFailedRepairs(supabase, job as ElProfesorMergeJobRow);
    await kickMergeQueue();
    revalidatePath("/apps/el-profesor");
    revalidatePath("/apps/el-profesor/notions");
    return {
      success: `Rattrapage relancé pour ${result.fiches} fiche${result.fiches > 1 ? "s" : ""} (${result.blocksRemoved} bloc${result.blocksRemoved > 1 ? "s" : ""} et ${result.cardsRemoved} carte${result.cardsRemoved > 1 ? "s" : ""} copiés tels quels retirés, l'IA les réintègre).`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Relance impossible." };
  }
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
  ficheCount: number;
  sourceCount: number;
  /** Characters of its source fiches: what writing it costs (estimateLot), at whichever model the lot uses. */
  sourceChars: number;
}

export interface MergeToc {
  parts: { title: string; subParts: { title: string; chapters: MergeTocChapter[] }[] }[];
}

export interface MergeTocCoverage {
  /** Source fiches the books hold now. */
  sourceFiches: number;
  /** …of which some merged fiche uses. */
  used: number;
  /** Fiches added to the books since the table of contents: not in it (a few shown). */
  addedSince: { book: string; chapter: string; title: string }[];
  addedSinceCount: number;
  /** Source fiches of the table of contents deleted since: left out when their chapter is written. */
  goneSince: number;
}

/** Per chapter (plan order): source fiches and their characters. Only changes when a lot starts (sources re-read), hence kept per lot. */
interface TocSummary {
  round: number;
  chapters: [sources: number, chars: number][];
}

/** Fiche tasks by chapter, read from their ref_key ("fiche:<chapter order>:<fiche order>"): no task input to load. */
function chapterIndexOf(refKey: string): number {
  return Number(refKey.split(":")[1]);
}

export async function getMergeToc(jobId: string): Promise<MergeToc | { error: string }> {
  await requireElProfesorAdmin();
  const supabase = createAdminClient();
  const { data: job } = await supabase.from("el_profesor_merge_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job?.plan) return { error: "La table des matières n'est pas encore établie." };
  const plan = flattenChapters(job.plan as unknown as MergePlan);
  const stats = (job.stats as (MergeStats & { tocSummary?: TocSummary }) | null) ?? {};

  type LightTask = { status: string; round: number; ref_key: string };
  const [tasks, summary] = await Promise.all([
    selectAllPages<LightTask>((from, to) =>
      supabase.from("el_profesor_merge_tasks").select("status, round, ref_key").eq("job_id", jobId).eq("stage", "fiche").order("ref_key").range(from, to)
    ),
    stats.tocSummary?.round === job.round ? stats.tocSummary : buildTocSummary(job as ElProfesorMergeJobRow, plan.length),
  ]);
  const byChapter = new Map<number, LightTask[]>();
  for (const t of tasks) {
    const i = chapterIndexOf(t.ref_key);
    byChapter.set(i, [...(byChapter.get(i) ?? []), t]);
  }
  const writingLot = job.stage === "fiches" || job.stage === "repair" ? job.round : -1;
  const chapters = new Map(
    plan.map((c) => {
      const own = byChapter.get(c.orderIndex) ?? [];
      const lot = Math.max(0, ...own.map((t) => t.round));
      const [sourceCount, sourceChars] = summary.chapters[c.orderIndex] ?? [0, 0];
      const state: MergeTocChapter["state"] = own.some((t) => t.status === "held") ? "held" : lot === writingLot ? "writing" : "written";
      return [c.chapterId, { chapterId: c.chapterId, title: c.title, state, lot, ficheCount: own.length, sourceCount, sourceChars } satisfies MergeTocChapter];
    })
  );
  const toc = job.plan as unknown as MergePlan;
  return {
    parts: toc.parts.map((p) => ({
      title: p.title,
      subParts: p.subParts.map((sp) => ({ title: sp.title, chapters: sp.chapters.map((c) => chapters.get(c.chapterId)).filter((c): c is MergeTocChapter => Boolean(c)) })),
    })),
  };
}

/** The sources and characters of every chapter, from the fiche tasks' inputs (several MB on a big fusion): read once per lot, then kept on the job. */
async function buildTocSummary(job: ElProfesorMergeJobRow, chapterCount: number): Promise<TocSummary> {
  const supabase = createAdminClient();
  type Row = { ref_key: string; chars: number; sources: unknown[] | null };
  const rows = await selectAllPages<Row>(
    (from, to) =>
      supabase
        .from("el_profesor_merge_tasks")
        .select("ref_key, chars:input->chars, sources:input->sources")
        .eq("job_id", job.id)
        .eq("stage", "fiche")
        .order("ref_key")
        .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>
  );
  const chapters: TocSummary["chapters"] = Array.from({ length: chapterCount }, () => [0, 0]);
  for (const r of rows) {
    const c = chapters[chapterIndexOf(r.ref_key)];
    if (!c) continue;
    c[0] += r.sources?.length ?? 0;
    c[1] += Number(r.chars) || 0;
  }
  const summary = { round: job.round, chapters };
  // Kept only if the job hasn't moved on meanwhile (a lot starting re-reads the sources).
  await supabase
    .from("el_profesor_merge_jobs")
    .update({ stats: { ...((job.stats as object | null) ?? {}), tocSummary: summary } as unknown as Json })
    .eq("id", job.id)
    .eq("stage", job.stage)
    .eq("round", job.round);
  return summary;
}

/** Whether every fiche of the books is in the table of contents — loaded after it, the books' catalog being long to read. */
export async function getMergeTocCoverage(jobId: string): Promise<MergeTocCoverage | { error: string }> {
  await requireElProfesorAdmin();
  const supabase = createAdminClient();
  const { data: job } = await supabase.from("el_profesor_merge_jobs").select("id, source_book_ids, include_drafts").eq("id", jobId).maybeSingle();
  if (!job) return { error: "Fusion introuvable." };
  type Row = { sources: { ficheId: string }[] | null };
  const [rows, catalog] = await Promise.all([
    selectAllPages<Row>(
      (from, to) =>
        supabase
          .from("el_profesor_merge_tasks")
          .select("sources:input->sources")
          .eq("job_id", jobId)
          .eq("stage", "fiche")
          .order("ref_key")
          .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>
    ),
    loadSourceCatalog(supabase, job.source_book_ids, job.include_drafts),
  ]);
  const used = new Set(rows.flatMap((t) => (t.sources ?? []).map((src) => src.ficheId)));
  const now = new Set(catalog.fiches.map((f) => f.ficheId));
  const added = catalog.fiches.filter((f) => !used.has(f.ficheId));
  return {
    sourceFiches: catalog.fiches.length,
    used: catalog.fiches.length - added.length,
    addedSince: added.slice(0, 30).map((f) => ({ book: f.bookTitle, chapter: f.chapterTitle, title: f.title })),
    addedSinceCount: added.length,
    goneSince: [...used].filter((id) => !now.has(id)).length,
  };
}

/** One chapter's merged fiches and the source fiches each one fuses, in order — loaded when the chapter is opened. */
export async function getMergeTocChapter(jobId: string, chapterId: string): Promise<MergeTocFiche[] | { error: string }> {
  await requireElProfesorAdmin();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("el_profesor_merge_tasks")
    .select("input")
    .eq("job_id", jobId)
    .eq("stage", "fiche")
    .eq("input->>chapterId", chapterId);
  if (error) return { error: "Chapitre introuvable." };
  return (data ?? [])
    .map((t) => t.input as unknown as FicheTaskInput)
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((f) => ({ title: f.title, sources: f.sources.map((src) => ({ book: src.bookTitle, chapter: src.chapterTitle, title: src.title })) }));
}

/** Writes the chosen chapters now (one lot): the rest of the table of contents waits, at no cost. */
export async function generateMergeChapters(jobId: string, chapterIds: string[], lotModel?: LotModel): Promise<ActionState> {
  await requireElProfesorAdmin();
  if (chapterIds.length === 0) return { error: "Choisissez au moins un chapitre." };
  const model = lotModel ? { provider: lotModel.provider, model: lotModel.model.trim() } : undefined;
  if (model && !model.model) return { error: "Choisissez un modèle." };
  if (model && (model.provider === "gemini" ? !(await hasElProfesorGeminiKey()) : !(await hasElProfesorClaudeKey())))
    return { error: `Clé API ${model.provider === "gemini" ? "Gemini" : "Claude"} non configurée (Réglages IA).` };
  const supabase = createAdminClient();
  const { data: job } = await supabase.from("el_profesor_merge_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) return { error: "Fusion introuvable." };
  if (job.stage !== "ready") return { error: job.stage === "fiches" || job.stage === "repair" ? "Un lot est déjà en cours : attendez qu'il se termine." : "La table des matières n'est pas prête." };
  try {
    const lot = await releaseChapters(supabase, job as ElProfesorMergeJobRow, chapterIds, model);
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
