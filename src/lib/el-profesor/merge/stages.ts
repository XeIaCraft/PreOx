import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { GeminiError } from "@/lib/gemini-shared";
import type { Database, ElProfesorMergeJobRow, ElProfesorMergeTaskRow, ElProfesorMergeTaskStage, Json } from "@/lib/supabase/types";
import type { BlockContent, BlockType, Citation, SuggestedImage } from "../types";
import { stableUuid } from "./ids";
import {
  ASSIGN_CHUNK,
  cardOwners,
  chapterPath,
  chunk,
  flattenPlan,
  mergeCitations,
  numberPlan,
  resolveAssignments,
  resolveChapterPlan,
  uncovered,
  type FlatPlanChapter,
} from "./plan";
import { buildAssignPrompt, buildCatalogText, buildChapterPrompt, buildFichePrompt, buildPlanPrompt, buildRepairPrompt, type PromptSourceFiche } from "./prompts";
import {
  ASSIGN_SCHEMA,
  CHAPTER_SCHEMA,
  FICHE_SCHEMA,
  PLAN_SCHEMA,
  REPAIR_SCHEMA,
  normalizeAssignments,
  normalizeChapterPlan,
  normalizeContent,
  normalizeMergedFiche,
  normalizePlan,
  normalizeRepair,
} from "./schemas";
import { appendMergedCards, loadFicheBlocks, rewriteFicheBlocks, writeMergedFiche, type MergedBlockDraft, type MergedCardDraft } from "./persist";
import { loadSourceCatalog, loadSourceContent, type SourceBlock, type SourceCard } from "./source";
import { targetChapterCount } from "./estimate";
import type { MergePlan, MergeStats, SourceFicheRef } from "./types";

// What each fusion stage does, provider-agnostic: build its prompts
// (`prepare`), turn one answer into stored output or merged content
// (`apply`), and once every task of the stage is settled, place whatever is
// missing and create the next stage's tasks (`finalize*`). pipeline.ts only
// schedules these; it never looks inside a stage.

type Admin = SupabaseClient<Database>;
type Job = ElProfesorMergeJobRow;
type Task = ElProfesorMergeTaskRow;

export interface StageContext {
  supabase: Admin;
  job: Job;
  bookTitle: string;
}

export interface PreparedTask {
  prompt: string;
  /** Alias tables needed to read the answer back, stored with the task when the answer comes later (Claude batch). */
  prepared?: Json;
}

export interface StageHandler {
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  prepare(ctx: StageContext, tasks: Task[]): Promise<Map<string, PreparedTask>>;
  apply(ctx: StageContext, task: Task, prepared: Json | undefined, raw: unknown): Promise<Json>;
}

const alias = (prefix: string, i: number) => `${prefix}${i + 1}`;
const aliasIndex = (prefix: string, a: string): number => {
  const m = new RegExp(`^${prefix}(\\d+)$`, "i").exec(a.trim());
  return m ? Number(m[1]) - 1 : -1;
};

function planOf(job: Job): MergePlan {
  return (job.plan as unknown as MergePlan | null) ?? { parts: [] };
}

async function upsertTasks(supabase: Admin, jobId: string, stage: ElProfesorMergeTaskStage, tasks: { refKey: string; input: unknown }[]) {
  for (const part of chunk(tasks, 200)) {
    const { error } = await supabase
      .from("el_profesor_merge_tasks")
      .upsert(
        part.map((t) => ({ job_id: jobId, stage, ref_key: t.refKey, input: t.input as Json, status: "waiting" as const })),
        { onConflict: "job_id,ref_key", ignoreDuplicates: true }
      );
    if (error) throw new GeminiError(`Création des tâches de fusion impossible : ${error.message}`);
  }
}

export async function stageTasks(supabase: Admin, jobId: string, stage: ElProfesorMergeTaskStage): Promise<Task[]> {
  const out: Task[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("el_profesor_merge_tasks").select("*").eq("job_id", jobId).eq("stage", stage).order("ref_key").range(from, from + 999);
    out.push(...((data ?? []) as Task[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function mergeStats(job: Job, patch: MergeStats): Json {
  return { ...((job.stats as MergeStats | null) ?? {}), ...patch } as Json;
}

/** Moves the job on, only if no other run already did (two cron runs can overlap). Returns false when it lost the race. */
async function transition(supabase: Admin, job: Job, next: Job["stage"], patch: Partial<Job> = {}): Promise<boolean> {
  const { data } = await supabase
    .from("el_profesor_merge_jobs")
    .update({ ...patch, stage: next, ...(next === "done" || next === "failed" ? { finished_at: new Date().toISOString() } : {}) })
    .eq("id", job.id)
    .eq("stage", job.stage)
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

// -- 1. Plan ----------------------------------------------------------------

export async function createPlanTask(supabase: Admin, job: Job) {
  await upsertTasks(supabase, job.id, "plan", [{ refKey: "plan", input: {} }]);
}

const planHandler: StageHandler = {
  toolName: "enregistrer_table_des_matieres",
  toolDescription: "Enregistre la table des matières du livre fusionné.",
  schema: PLAN_SCHEMA,
  async prepare(ctx, tasks) {
    const catalog = await loadSourceCatalog(ctx.supabase, ctx.job.source_book_ids, ctx.job.include_drafts);
    if (catalog.fiches.length === 0) throw new GeminiError("Aucune fiche dans les livres choisis.");
    const prompt = buildPlanPrompt(ctx.bookTitle, { books: catalog.books, text: buildCatalogText(catalog.books, catalog.fiches), ficheCount: catalog.fiches.length }, targetChapterCount(catalog.fiches.length));
    return new Map(tasks.map((t) => [t.id, { prompt }]));
  },
  async apply(ctx, _task, _prepared, raw) {
    const plan = numberPlan(normalizePlan(raw), ctx.job.id);
    if (flattenPlan(plan).length === 0) throw new GeminiError("Table des matières vide.");
    return plan as unknown as Json;
  },
};

export async function finalizePlan(ctx: StageContext): Promise<void> {
  const { supabase, job } = ctx;
  const [task] = await stageTasks(supabase, job.id, "plan");
  if (!task || task.status !== "done" || !task.output) {
    await transition(supabase, job, "failed", { error: `Table des matières impossible à établir : ${task?.error ?? "pas de réponse"}` });
    return;
  }
  const plan = task.output as unknown as MergePlan;
  const chapters = flattenPlan(plan);
  const catalog = await loadSourceCatalog(supabase, job.source_book_ids, job.include_drafts);

  for (const part of chunk(chapters, 200)) {
    const { error } = await supabase.from("el_profesor_chapters").upsert(
      part.map((c) => ({
        id: c.chapterId!,
        book_id: job.book_id,
        title: c.title,
        order_index: c.orderIndex,
        status: "extracting" as const,
        source_kind: "merged" as const,
        part_title: c.partTitle,
        sub_part_title: c.subPartTitle,
        extraction_error: "Fusion en cours.",
      })),
      { onConflict: "id", ignoreDuplicates: true }
    );
    if (error) throw new GeminiError(`Création des chapitres impossible : ${error.message}`);
  }

  await upsertTasks(
    supabase,
    job.id,
    "assign",
    chunk(catalog.fiches, ASSIGN_CHUNK).map((fiches, i) => ({ refKey: `assign:${String(i).padStart(4, "0")}`, input: { fiches } }))
  );
  await transition(supabase, job, "assign", {
    plan: plan as unknown as Json,
    stats: mergeStats(job, {
      sourceFiches: catalog.fiches.length,
      sourceBlocks: catalog.fiches.reduce((s, f) => s + f.blockCount, 0),
      sourceCards: catalog.fiches.reduce((s, f) => s + f.cardCount, 0),
      chapters: chapters.length,
    }),
  });
}

// -- 2. Répartition ---------------------------------------------------------

function promptChapters(plan: MergePlan) {
  return flattenPlan(plan).map((c) => ({ key: c.key, path: chapterPath(c), title: c.title, scope: c.scope }));
}

const assignHandler: StageHandler = {
  toolName: "enregistrer_repartition",
  toolDescription: "Enregistre le chapitre de chaque fiche source.",
  schema: ASSIGN_SCHEMA,
  async prepare(ctx, tasks) {
    const chapters = promptChapters(planOf(ctx.job));
    return new Map(
      tasks.map((t) => {
        const fiches = ((t.input as { fiches?: SourceFicheRef[] }).fiches ?? []).map((ref, i) => ({ alias: alias("F", i), ref }));
        return [t.id, { prompt: buildAssignPrompt(ctx.bookTitle, chapters, fiches) }];
      })
    );
  },
  async apply(_ctx, task, _prepared, raw) {
    const assignments = normalizeAssignments(raw);
    if (assignments.length === 0) throw new GeminiError("Répartition vide.");
    const expected = ((task.input as { fiches?: SourceFicheRef[] }).fiches ?? []).length;
    // Less than half placed: the answer was cut short, ask again rather than guess most of it.
    if (assignments.length < expected / 2) throw new GeminiError(`Répartition incomplète (${assignments.length}/${expected}).`);
    return { assignments } as unknown as Json;
  },
};

export async function finalizeAssign(ctx: StageContext): Promise<void> {
  const { supabase, job } = ctx;
  const plan = planOf(job);
  const chapters = flattenPlan(plan);
  const tasks = await stageTasks(supabase, job.id, "assign");
  const allFiches: SourceFicheRef[] = [];
  const answers = tasks.map((t) => {
    const fiches = (t.input as { fiches?: SourceFicheRef[] }).fiches ?? [];
    allFiches.push(...fiches);
    return {
      aliasToFiche: Object.fromEntries(fiches.map((f, i) => [alias("F", i), f.ficheId])),
      assignments: t.status === "done" ? ((t.output as { assignments?: { fiche: string; chapter: string }[] } | null)?.assignments ?? []) : [],
    };
  });
  const { byChapter, fallbackCount } = resolveAssignments(
    chapters.map((c) => c.key),
    allFiches,
    answers
  );
  const refById = new Map(allFiches.map((f) => [f.ficheId, f]));

  // A chapter nobody went to is dropped from the book.
  const empty = chapters.filter((c) => (byChapter.get(c.key) ?? []).length === 0);
  if (empty.length) await supabase.from("el_profesor_chapters").delete().in("id", empty.map((c) => c.chapterId!));
  const emptyKeys = new Set(empty.map((c) => c.key));
  const trimmed: MergePlan = {
    parts: plan.parts
      .map((p) => ({ ...p, subParts: p.subParts.map((s) => ({ ...s, chapters: s.chapters.filter((c) => !emptyKeys.has(c.key)) })).filter((s) => s.chapters.length) }))
      .filter((p) => p.subParts.length),
  };

  await upsertTasks(
    supabase,
    job.id,
    "chapter",
    chapters
      .filter((c) => !emptyKeys.has(c.key))
      .map((c) => ({ refKey: `chapter:${String(c.orderIndex).padStart(4, "0")}`, input: { key: c.key, fiches: (byChapter.get(c.key) ?? []).map((id) => refById.get(id)!) } }))
  );
  await transition(supabase, job, "chapters", { plan: trimmed as unknown as Json, stats: mergeStats(job, { chapters: chapters.length - empty.length, assignFallback: fallbackCount }) });
}

// -- 3. Chapitres -----------------------------------------------------------

function chapterByKey(plan: MergePlan): Map<string, FlatPlanChapter> {
  return new Map(flattenPlan(plan).map((c) => [c.key, c]));
}

function neighbours(plan: MergePlan, key: string): string[] {
  for (const p of plan.parts) for (const s of p.subParts) if (s.chapters.some((c) => c.key === key)) return s.chapters.filter((c) => c.key !== key).map((c) => c.title);
  return [];
}

const chapterHandler: StageHandler = {
  toolName: "enregistrer_fiches_du_chapitre",
  toolDescription: "Enregistre la liste ordonnée des fiches du chapitre fusionné.",
  schema: CHAPTER_SCHEMA,
  async prepare(ctx, tasks) {
    const plan = planOf(ctx.job);
    const byKey = chapterByKey(plan);
    return new Map(
      tasks.map((t) => {
        const input = t.input as unknown as { key: string; fiches: SourceFicheRef[] };
        const c = byKey.get(input.key);
        const fiches = input.fiches.map((ref, i) => ({ alias: alias("F", i), ref }));
        const prompt = buildChapterPrompt(
          ctx.bookTitle,
          { path: c ? chapterPath(c) : "", title: c?.title ?? input.key, scope: c?.scope ?? "", neighbours: neighbours(plan, input.key) },
          fiches
        );
        return [t.id, { prompt }];
      })
    );
  },
  async apply(_ctx, _task, _prepared, raw) {
    const fiches = normalizeChapterPlan(raw);
    if (fiches.length === 0) throw new GeminiError("Aucune fiche proposée pour ce chapitre.");
    return { fiches } as unknown as Json;
  },
};

export interface FicheTaskInput {
  key: string;
  chapterId: string;
  subEntityId: string;
  ficheId: string;
  title: string;
  objective: string;
  siblings: string[];
  sources: { ficheId: string; bookTitle: string; chapterId: string; chapterTitle: string; title: string; withCards: boolean }[];
}

export async function finalizeChapters(ctx: StageContext): Promise<void> {
  const { supabase, job } = ctx;
  const byKey = chapterByKey(planOf(job));
  const tasks = await stageTasks(supabase, job.id, "chapter");
  const ficheTasks: { refKey: string; input: FicheTaskInput }[] = [];
  let fallback = 0;

  for (const t of tasks) {
    const input = t.input as unknown as { key: string; fiches: SourceFicheRef[] };
    const chapter = byKey.get(input.key);
    if (!chapter?.chapterId) continue;
    const planned = t.status === "done" ? ((t.output as { fiches?: { title: string; objective: string; sources: string[] }[] } | null)?.fiches ?? []) : [];
    const aliasToFiche = Object.fromEntries(input.fiches.map((f, i) => [alias("F", i), f.ficheId]));
    const { fiches, fallbackCount } = resolveChapterPlan(planned, aliasToFiche, input.fiches);
    fallback += fallbackCount;
    const refById = new Map(input.fiches.map((f) => [f.ficheId, f]));
    const keyed = fiches.map((f, i) => ({ ...f, key: `${input.key}.${i}` }));
    const owners = cardOwners(keyed);

    const rows = keyed.map((f, i) => ({
      ...f,
      subEntityId: stableUuid(job.id, "sub", f.key),
      ficheId: stableUuid(job.id, "fiche", f.key),
      orderIndex: i,
    }));
    if (rows.length) {
      await supabase.from("el_profesor_sub_entities").upsert(
        rows.map((r) => ({ id: r.subEntityId, chapter_id: chapter.chapterId!, name: r.title, order_index: r.orderIndex, summary: r.objective, source_fiche_ids: r.sourceFicheIds })),
        { onConflict: "id", ignoreDuplicates: true }
      );
      await supabase.from("el_profesor_fiches").upsert(
        rows.map((r) => ({ id: r.ficheId, sub_entity_id: r.subEntityId, title: r.title, status: "draft" as const })),
        { onConflict: "id", ignoreDuplicates: true }
      );
    }
    for (const r of rows)
      ficheTasks.push({
        refKey: `fiche:${String(chapter.orderIndex).padStart(4, "0")}:${String(r.orderIndex).padStart(3, "0")}`,
        input: {
          key: r.key,
          chapterId: chapter.chapterId,
          subEntityId: r.subEntityId,
          ficheId: r.ficheId,
          title: r.title,
          objective: r.objective,
          siblings: rows.filter((o) => o !== r).map((o) => o.title),
          sources: r.sourceFicheIds.map((id) => {
            const ref = refById.get(id)!;
            return { ficheId: id, bookTitle: ref.bookTitle, chapterId: ref.chapterId, chapterTitle: ref.chapterTitle, title: ref.title, withCards: owners.get(id) === r.key };
          }),
        },
      });
  }

  await upsertTasks(supabase, job.id, "fiche", ficheTasks);
  await transition(supabase, job, "fiches", { stats: mergeStats(job, { fichesPlanned: ficheTasks.length, chapterFallback: fallback }) });
}

// -- 4. Fiches --------------------------------------------------------------

interface FichePrepared {
  blockIds: string[];
  cardIds: string[];
}

function pagesOf(citations: Citation[]): number[] {
  return [...new Set(citations.map((c) => c.page).filter((p) => p > 0))].sort((a, b) => a - b);
}

function promptSources(input: FicheTaskInput, content: Awaited<ReturnType<typeof loadSourceContent>>): { sources: PromptSourceFiche[]; prepared: FichePrepared } {
  const prepared: FichePrepared = { blockIds: [], cardIds: [] };
  const sources = input.sources.map((s, fi) => {
    const blocks = (content.blocksByFiche.get(s.ficheId) ?? []).map((b) => {
      prepared.blockIds.push(b.id);
      return { alias: alias("B", prepared.blockIds.length - 1), blockType: b.blockType, content: b.content, pages: pagesOf(b.citations), image: b.imageUrl ? b.imageAlt || "figure" : null };
    });
    const cards = s.withCards
      ? (content.cardsByFiche.get(s.ficheId) ?? [])
          .filter((c) => !c.structural)
          .map((c) => {
            prepared.cardIds.push(c.id);
            return { alias: alias("K", prepared.cardIds.length - 1), front: c.front, back: c.back };
          })
      : [];
    return { alias: alias("F", fi), bookTitle: s.bookTitle, chapterTitle: s.chapterTitle, title: s.title, blocks, cards };
  });
  return { sources, prepared };
}

async function contentFor(ctx: StageContext, inputs: FicheTaskInput[]) {
  return loadSourceContent(ctx.supabase, [...new Set(inputs.flatMap((i) => i.sources.map((s) => s.ficheId)))], ctx.job.include_drafts);
}

const ficheHandler: StageHandler = {
  toolName: "enregistrer_fiche_fusionnee",
  toolDescription: "Enregistre la fiche fusionnée et ses flashcards.",
  schema: FICHE_SCHEMA,
  async prepare(ctx, tasks) {
    const inputs = tasks.map((t) => t.input as unknown as FicheTaskInput);
    const content = await contentFor(ctx, inputs);
    const byKey = chapterByKey(planOf(ctx.job));
    const out = new Map<string, PreparedTask>();
    tasks.forEach((t, i) => {
      const input = inputs[i];
      const chapter = byKey.get(input.key.split(".")[0]);
      const { sources, prepared } = promptSources(input, content);
      const prompt = buildFichePrompt(
        { bookTitle: ctx.bookTitle, path: chapter ? chapterPath(chapter) : "", chapterTitle: chapter?.title ?? "", title: input.title, objective: input.objective, siblings: input.siblings },
        sources
      );
      out.set(t.id, { prompt, prepared: prepared as unknown as Json });
    });
    return out;
  },
  async apply(ctx, task, preparedJson, raw) {
    const input = task.input as unknown as FicheTaskInput;
    const prepared = preparedJson as unknown as FichePrepared;
    const merged = normalizeMergedFiche(raw);
    if (merged.blocks.length === 0) throw new GeminiError("Fiche fusionnée vide.");
    const content = await contentFor(ctx, [input]);
    const meta = sourceMeta(input);
    const blockById = new Map([...content.blocksByFiche.values()].flat().map((b) => [b.id, b]));
    const cardById = new Map([...content.cardsByFiche.values()].flat().map((c) => [c.id, c]));
    const resolve = (prefix: string, table: string[], a: string) => table[aliasIndex(prefix, a)];

    const claimedBlocks = new Set<string>();
    const usedImages = new Set<string>();
    const blocks: MergedBlockDraft[] = merged.blocks.map((b) => {
      const srcIds = b.source_block_ids.map((a) => resolve("B", prepared.blockIds, a)).filter((id): id is string => Boolean(id && blockById.has(id)));
      srcIds.forEach((id) => claimedBlocks.add(id));
      const sources = srcIds.map((id) => blockById.get(id)!);
      const reuseId = b.reuse_image_from ? resolve("B", prepared.blockIds, b.reuse_image_from) : undefined;
      const reuse = reuseId ? blockById.get(reuseId) : undefined;
      const image = reuse?.imageUrl && !usedImages.has(reuse.id) ? reuse : undefined;
      if (image) usedImages.add(image.id);
      return {
        blockType: b.block_type,
        content: (b.heading ? { ...b.content, heading: b.heading } : b.content) as BlockContent,
        citations: mergeCitations(sources.map((s) => ({ id: s.id, ...meta(s.ficheId), citations: s.citations }))),
        imageUrl: image?.imageUrl ?? null,
        imageAlt: image?.imageAlt ?? null,
        suggestedImage: suggestion(b.suggested_image, prepared, blockById, meta),
        isEmergency: sources.some((s) => s.isEmergency),
        needsReview: false,
      };
    });
    // A source illustration the model didn't place goes on the first merged block built from that source block.
    for (const src of blockById.values()) {
      if (!src.imageUrl || usedImages.has(src.id)) continue;
      const target = blocks.find((b) => !b.imageUrl && b.citations.some((c) => c.sourceBlockId === src.id));
      if (target) {
        target.imageUrl = src.imageUrl;
        target.imageAlt = src.imageAlt;
        usedImages.add(src.id);
      }
    }

    const claimedCards = new Set<string>();
    const cards: MergedCardDraft[] = merged.flashcards.map((c) => {
      const srcIds = [...new Set(c.source_flashcard_ids.map((a) => resolve("K", prepared.cardIds, a)).filter((id): id is string => Boolean(id && cardById.has(id)) && !claimedCards.has(id!)))];
      srcIds.forEach((id) => claimedCards.add(id));
      const sources = srcIds.map((id) => cardById.get(id)!);
      const withImage = sources.find((s) => s.row.image_url);
      return {
        front: c.front,
        back: c.back,
        citations: cardCitations(sources, meta),
        imageUrl: withImage?.row.image_url ?? null,
        imageAlt: withImage?.row.image_alt ?? null,
        sourceFlashcardIds: srcIds,
        needsReview: false,
      };
    });
    // Image-occlusion and cloze cards were never sent: they come over as they are.
    for (const s of input.sources.filter((x) => x.withCards))
      for (const c of (content.cardsByFiche.get(s.ficheId) ?? []).filter((x) => x.structural)) {
        cards.push(copiedCard(c, meta));
        claimedCards.add(c.id);
      }

    await writeMergedFiche(ctx.supabase, input, merged.summary, blocks, cards);
    return {
      givenBlockIds: prepared.blockIds,
      givenCardIds: [...prepared.cardIds, ...[...claimedCards].filter((id) => !prepared.cardIds.includes(id))],
      claimedBlockIds: [...claimedBlocks],
      claimedCardIds: [...claimedCards],
      blocks: blocks.length,
      cards: cards.length,
      divergences: blocks.filter((b) => b.blockType === "divergence").length,
    } as unknown as Json;
  },
};

function sourceMeta(input: FicheTaskInput) {
  const byFiche = new Map(input.sources.map((s) => [s.ficheId, s]));
  return (ficheId: string) => {
    const s = byFiche.get(ficheId);
    return { chapterId: s?.chapterId ?? "", bookTitle: s?.bookTitle ?? "", chapterTitle: s?.chapterTitle ?? "" };
  };
}

function suggestion(
  raw: { what: string; source_block_id?: string } | null | undefined,
  prepared: FichePrepared,
  blockById: Map<string, SourceBlock>,
  meta: ReturnType<typeof sourceMeta>
): SuggestedImage | null {
  if (!raw?.what) return null;
  const id = raw.source_block_id ? prepared.blockIds[aliasIndex("B", raw.source_block_id)] : undefined;
  const src = id ? blockById.get(id) : undefined;
  const page = src ? (pagesOf(src.citations)[0] ?? null) : null;
  return { what: raw.what, chapterId: src && page ? meta(src.ficheId).chapterId || null : null, page };
}

function cardCitations(sources: SourceCard[], meta: ReturnType<typeof sourceMeta>): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();
  for (const s of sources)
    for (const c of s.citations) {
      const m = meta(s.ficheId);
      const key = `${m.chapterId}|${c.page}|${c.quote}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ page: c.page, quote: c.quote, ...m });
    }
  return out.slice(0, 8);
}

function copiedCard(c: SourceCard, meta: ReturnType<typeof sourceMeta>): MergedCardDraft {
  return {
    front: c.front,
    back: c.back,
    citations: cardCitations([c], meta),
    imageUrl: c.row.image_url,
    imageAlt: c.row.image_alt,
    sourceFlashcardIds: [c.id],
    needsReview: false,
    copyOf: c,
  };
}

function verbatimBlock(b: SourceBlock, meta: ReturnType<typeof sourceMeta>): MergedBlockDraft {
  return {
    blockType: b.blockType,
    content: b.content,
    citations: mergeCitations([{ id: b.id, ...meta(b.ficheId), citations: b.citations }]),
    imageUrl: b.imageUrl,
    imageAlt: b.imageAlt,
    suggestedImage: null,
    isEmergency: b.isEmergency,
    needsReview: true,
  };
}

interface FicheOutput {
  givenBlockIds: string[];
  givenCardIds: string[];
  claimedBlockIds: string[];
  claimedCardIds: string[];
  divergences: number;
}

export async function finalizeFiches(ctx: StageContext): Promise<void> {
  const { supabase, job } = ctx;
  const tasks = await stageTasks(supabase, job.id, "fiche");
  const outputs = new Map<string, FicheOutput>();
  let failed = 0;

  // A fiche the AI never managed to write keeps its sources as they are (to review), rather than disappearing.
  for (const t of tasks) {
    const input = t.input as unknown as FicheTaskInput;
    if (t.status === "done" && t.output) {
      outputs.set(t.id, t.output as unknown as FicheOutput);
      continue;
    }
    failed++;
    const content = await contentFor(ctx, [input]);
    const meta = sourceMeta(input);
    const blocks = input.sources.flatMap((s) => (content.blocksByFiche.get(s.ficheId) ?? []).map((b) => verbatimBlock(b, meta)));
    const cards = input.sources.filter((s) => s.withCards).flatMap((s) => (content.cardsByFiche.get(s.ficheId) ?? []).map((c) => copiedCard(c, meta)));
    await writeMergedFiche(supabase, input, "", blocks, cards);
    const ids = blocks.flatMap((b) => b.citations.map((c) => c.sourceBlockId!));
    outputs.set(t.id, { givenBlockIds: ids, givenCardIds: [], claimedBlockIds: ids, claimedCardIds: cards.flatMap((c) => c.sourceFlashcardIds), divergences: 0 });
  }

  const all = [...outputs.values()];
  const missingBlocks = new Set(uncovered(all.flatMap((o) => o.givenBlockIds), all.flatMap((o) => o.claimedBlockIds)));
  const missingCards = new Set(uncovered(all.flatMap((o) => o.givenCardIds), all.flatMap((o) => o.claimedCardIds)));

  // Cards no merged card took over come over as they are, in the fiche they were given to.
  let cardsKept = 0;
  const repairTasks: { refKey: string; input: unknown }[] = [];
  const assignedBlock = new Set<string>();
  for (const t of tasks) {
    const o = outputs.get(t.id);
    if (!o) continue;
    const input = t.input as unknown as FicheTaskInput;
    const cardIds = o.givenCardIds.filter((id) => missingCards.has(id));
    if (cardIds.length) {
      const content = await contentFor(ctx, [input]);
      const meta = sourceMeta(input);
      const cards = [...content.cardsByFiche.values()].flat().filter((c) => cardIds.includes(c.id));
      await appendMergedCards(supabase, input.ficheId, cards.map((c) => copiedCard(c, meta)));
      cardIds.forEach((id) => missingCards.delete(id));
      cardsKept += cards.length;
    }
    const blockIds = o.givenBlockIds.filter((id) => missingBlocks.has(id) && !assignedBlock.has(id));
    blockIds.forEach((id) => assignedBlock.add(id));
    if (blockIds.length) repairTasks.push({ refKey: t.ref_key.replace(/^fiche:/, "repair:"), input: { ...input, blockIds } });
  }

  await upsertTasks(supabase, job.id, "repair", repairTasks);
  await transition(supabase, job, "repair", {
    stats: mergeStats(job, {
      fichesDone: tasks.length - failed,
      fichesFailed: failed,
      cardsKeptVerbatim: cardsKept,
      divergences: all.reduce((s, o) => s + (o.divergences ?? 0), 0),
    }),
  });
}

// -- 5. Rattrapage ----------------------------------------------------------

type RepairInput = FicheTaskInput & { blockIds: string[] };

interface RepairPrepared {
  blockIds: string[];
  currentIds: string[];
}

async function missingBlocksFor(ctx: StageContext, input: RepairInput): Promise<SourceBlock[]> {
  const content = await contentFor(ctx, [input]);
  const wanted = new Set(input.blockIds);
  return [...content.blocksByFiche.values()].flat().filter((b) => wanted.has(b.id));
}

const repairHandler: StageHandler = {
  toolName: "enregistrer_rattrapage",
  toolDescription: "Enregistre l'intégration des informations manquantes dans la fiche.",
  schema: REPAIR_SCHEMA,
  async prepare(ctx, tasks) {
    const out = new Map<string, PreparedTask>();
    for (const t of tasks) {
      const input = t.input as unknown as RepairInput;
      const [current, missing] = await Promise.all([loadFicheBlocks(ctx.supabase, input.ficheId), missingBlocksFor(ctx, input)]);
      const meta = sourceMeta(input);
      const chapter = chapterByKey(planOf(ctx.job)).get(input.key.split(".")[0]);
      const prompt = buildRepairPrompt(
        { bookTitle: ctx.bookTitle, chapterTitle: chapter?.title ?? "", title: input.title },
        current.map((b, index) => ({ index, blockType: b.block_type, content: b.content as unknown as BlockContent })),
        missing.map((m, i) => ({ alias: alias("B", i), bookTitle: meta(m.ficheId).bookTitle, blockType: m.blockType, content: m.content }))
      );
      out.set(t.id, { prompt, prepared: { blockIds: missing.map((m) => m.id), currentIds: current.map((b) => b.id) } as unknown as Json });
    }
    return out;
  },
  async apply(ctx, task, preparedJson, raw) {
    const input = task.input as unknown as RepairInput;
    const prepared = preparedJson as unknown as RepairPrepared;
    const repair = normalizeRepair(raw);
    const [current, missing] = await Promise.all([loadFicheBlocks(ctx.supabase, input.ficheId), missingBlocksFor(ctx, input)]);
    // The fiche changed since the prompt was built (edited by hand): its numbering no longer holds.
    if (current.map((b) => b.id).join() !== prepared.currentIds.join()) throw new GeminiError("Fiche modifiée entre-temps.");
    const meta = sourceMeta(input);
    const byId = new Map(missing.map((m) => [m.id, m]));
    const claimed = new Set<string>();
    const sourcesOf = (aliases: string[]) =>
      aliases
        .map((a) => prepared.blockIds[aliasIndex("B", a)])
        .filter((id): id is string => Boolean(id && byId.has(id)))
        .map((id) => {
          claimed.add(id);
          const b = byId.get(id)!;
          return { id, ...meta(b.ficheId), citations: b.citations };
        });

    const entries = current.map((b) => ({
      id: b.id,
      type: b.block_type as BlockType,
      content: undefined as BlockContent | undefined,
      citations: (b.citations as unknown as Citation[]) ?? [],
      touched: false,
    }));
    for (const r of repair.replacements) {
      const e = entries[r.block_index];
      if (!e) continue;
      const content = normalizeContent(e.type, r.content);
      if (!content) continue;
      const keptHeading = r.heading ?? heading(current[r.block_index].content);
      e.content = (keptHeading ? { ...content, heading: keptHeading } : content) as BlockContent;
      e.citations = [...e.citations, ...mergeCitations(sourcesOf(r.source_block_ids))];
      e.touched = true;
    }
    for (const a of repair.alreadyCovered) {
      const e = entries[a.blockIndex];
      const sources = sourcesOf([a.sourceBlockId]);
      if (!e || !sources.length) continue;
      e.citations = [...e.citations, ...mergeCitations(sources)];
      e.touched = true;
    }
    const ordered: Parameters<typeof rewriteFicheBlocks>[2] = [];
    const insertsAfter = new Map<number, MergedBlockDraft[]>();
    // Never after the closing « À retenir ».
    let lastIndex = entries.length - 1;
    while (lastIndex >= 0 && entries[lastIndex].type === "a_retenir") lastIndex--;
    for (const ins of repair.insertions) {
      const sources = sourcesOf(ins.source_block_ids);
      const at = Math.min(Math.max(-1, ins.after_block_index), lastIndex);
      const list = insertsAfter.get(at) ?? [];
      list.push({
        blockType: ins.block_type,
        content: (ins.heading ? { ...ins.content, heading: ins.heading } : ins.content) as BlockContent,
        citations: mergeCitations(sources),
        imageUrl: null,
        imageAlt: null,
        suggestedImage: null,
        isEmergency: false,
        needsReview: false,
      });
      insertsAfter.set(at, list);
    }
    for (const d of insertsAfter.get(-1) ?? []) ordered.push({ draft: d });
    entries.forEach((e, i) => {
      ordered.push(e.touched ? { id: e.id, content: e.content, citations: e.citations.slice(0, 16) } : { id: e.id });
      for (const d of insertsAfter.get(i) ?? []) ordered.push({ draft: d });
    });
    await rewriteFicheBlocks(ctx.supabase, input.ficheId, ordered);
    return { claimed: [...claimed] } as unknown as Json;
  },
};

function heading(content: unknown): string | undefined {
  const h = (content as { heading?: unknown } | null)?.heading;
  return typeof h === "string" && h ? h : undefined;
}

export async function finalizeRepair(ctx: StageContext): Promise<void> {
  const { supabase, job } = ctx;
  const tasks = await stageTasks(supabase, job.id, "repair");
  let kept = 0;
  for (const t of tasks) {
    const input = t.input as unknown as RepairInput;
    const claimed = new Set(t.status === "done" ? ((t.output as { claimed?: string[] } | null)?.claimed ?? []) : []);
    const left = input.blockIds.filter((id) => !claimed.has(id));
    if (!left.length) continue;
    // Still not integrated: the source block itself goes in, before « À retenir », marked to review.
    const missing = (await missingBlocksFor(ctx, input)).filter((b) => left.includes(b.id));
    const meta = sourceMeta(input);
    const current = await loadFicheBlocks(supabase, input.ficheId);
    const cut = current.findIndex((b) => b.block_type === "a_retenir");
    const before = cut === -1 ? current : current.slice(0, cut);
    const after = cut === -1 ? [] : current.slice(cut);
    await rewriteFicheBlocks(supabase, input.ficheId, [...before.map((b) => ({ id: b.id })), ...missing.map((m) => ({ draft: verbatimBlock(m, meta) })), ...after.map((b) => ({ id: b.id }))]);
    kept += missing.length;
  }

  const plan = planOf(job);
  const chapterIds = flattenPlan(plan).map((c) => c.chapterId!).filter(Boolean);
  for (const part of chunk(chapterIds, 150))
    await supabase.from("el_profesor_chapters").update({ status: "draft_ready", extraction_error: null }).in("id", part).eq("status", "extracting");

  const usage = await jobUsage(supabase, job.id);
  await transition(supabase, job, "done", { stats: mergeStats(job, { blocksKeptVerbatim: kept, ...usage }) });
}

export async function jobUsage(supabase: Admin, jobId: string): Promise<{ inputTokens: number; outputTokens: number; tasksTotal: number; tasksDone: number }> {
  let inputTokens = 0;
  let outputTokens = 0;
  let tasksTotal = 0;
  let tasksDone = 0;
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("el_profesor_merge_tasks").select("input_tokens, output_tokens, status").eq("job_id", jobId).order("id").range(from, from + 999);
    for (const r of data ?? []) {
      inputTokens += r.input_tokens ?? 0;
      outputTokens += r.output_tokens ?? 0;
      tasksTotal++;
      if (r.status === "done") tasksDone++;
    }
    if (!data || data.length < 1000) break;
  }
  return { inputTokens, outputTokens, tasksTotal, tasksDone };
}

export const STAGE_HANDLERS: Record<ElProfesorMergeTaskStage, StageHandler> = {
  plan: planHandler,
  assign: assignHandler,
  chapter: chapterHandler,
  fiche: ficheHandler,
  repair: repairHandler,
};

export const FINALIZERS: Record<"plan" | "assign" | "chapters" | "fiches" | "repair", (ctx: StageContext) => Promise<void>> = {
  plan: finalizePlan,
  assign: finalizeAssign,
  chapters: finalizeChapters,
  fiches: finalizeFiches,
  repair: finalizeRepair,
};
