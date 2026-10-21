import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { GeminiError } from "@/lib/gemini-shared";
import type { Database, ElProfesorMergeJobRow, ElProfesorMergeTaskRow, ElProfesorMergeTaskStage, Json } from "@/lib/supabase/types";
import type { BlockContent, BlockType, Citation, SuggestedImage } from "../types";
import { stableUuid } from "./ids";
import {
  ASSIGN_CHUNK,
  chapterPath,
  chunk,
  flattenChapters,
  flattenSubParts,
  mergeCitations,
  missingFacts,
  numberPlan,
  numericFacts,
  resolveAssignments,
  resolveOutline,
  routeItems,
  subPartPath,
  targetSubPartCount,
  uncovered,
  withChapters,
  type FlatPlanChapter,
} from "./plan";
import {
  blockPromptText,
  buildAssignPrompt,
  buildCatalogText,
  buildFichePrompt,
  buildOutlinePrompt,
  buildPlanPrompt,
  buildRepairPrompt,
  type PromptSourceFiche,
} from "./prompts";
import {
  ASSIGN_SCHEMA,
  FICHE_SCHEMA,
  OUTLINE_SCHEMA,
  PLAN_SCHEMA,
  REPAIR_SCHEMA,
  normalizeAssignments,
  normalizeContent,
  normalizeMergedFiche,
  normalizeOutline,
  normalizePlan,
  normalizeRepair,
} from "./schemas";
import { appendMergedCards, loadFicheBlocks, rewriteFicheBlocks, writeMergedFiche, type MergedBlockDraft, type MergedCardDraft } from "./persist";
import { loadSourceCatalog, loadSourceContent, type SourceBlock, type SourceCard } from "./source";
import type { MergePlan, MergeStats, SourceFicheRef } from "./types";

// What each fusion stage does, provider-agnostic: build its prompts
// (`prepare`), turn one answer into stored output or merged content
// (`apply`), and once every task of the stage is settled, place whatever is
// missing and create the next stage's tasks (`finalize*`). pipeline.ts only
// schedules these; it never looks inside a stage.
//
//   plan      parties et sous-parties (1 requête)
//   assign    chaque fiche source → une sous-partie (par paquets de 200)
//   chapter   une sous-partie → ses chapitres et ses fiches fusionnées
//   fiche     une fiche fusionnée, rédigée à partir de ses sources
//   repair    ce que le contrôle de couverture a trouvé manquant
//
// Par lots (migration 101) : plan → assign → chapter établissent la table
// des matières complète, puis la fusion s'arrête en 'ready' avec une tâche
// « fiche » en réserve ('held') par fiche fusionnée. releaseChapters lance
// les chapitres choisis (un lot = un round) : fiche → repair pour ce lot
// seulement, puis retour en 'ready', ou 'done' quand tout est rédigé.

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
const pad = (n: number, width = 4) => String(n).padStart(width, "0");

function planOf(job: Job): MergePlan {
  return (job.plan as unknown as MergePlan | null) ?? { parts: [] };
}

async function upsertTasks(
  supabase: Admin,
  jobId: string,
  stage: ElProfesorMergeTaskStage,
  tasks: { refKey: string; input: unknown }[],
  { status = "waiting", round = 0 }: { status?: "waiting" | "held"; round?: number } = {}
) {
  for (const part of chunk(tasks, 200)) {
    const { error } = await supabase
      .from("el_profesor_merge_tasks")
      .upsert(
        part.map((t) => ({ job_id: jobId, stage, ref_key: t.refKey, input: t.input as Json, status, round })),
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

async function saveOutput(supabase: Admin, task: Task, output: unknown) {
  await supabase.from("el_profesor_merge_tasks").update({ output: output as Json }).eq("id", task.id);
}

function mergeStats(job: Job, patch: MergeStats): Json {
  return { ...((job.stats as MergeStats | null) ?? {}), ...patch } as Json;
}

/** Moves the job on, only if no other run already did (two runs can overlap). Releases the finalize lock. */
async function transition(supabase: Admin, job: Job, next: Job["stage"], patch: Partial<Job> = {}): Promise<boolean> {
  const { data } = await supabase
    .from("el_profesor_merge_jobs")
    .update({ ...patch, stage: next, locked_until: null, ...(next === "done" || next === "failed" ? { finished_at: new Date().toISOString() } : {}) })
    .eq("id", job.id)
    .eq("stage", job.stage)
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

// -- 1. Plan : parties et sous-parties --------------------------------------

export async function createPlanTask(supabase: Admin, job: Job) {
  await upsertTasks(supabase, job.id, "plan", [{ refKey: "plan", input: {} }]);
}

const planHandler: StageHandler = {
  toolName: "enregistrer_table_des_matieres",
  toolDescription: "Enregistre les parties et sous-parties du livre fusionné.",
  schema: PLAN_SCHEMA,
  async prepare(ctx, tasks) {
    const catalog = await loadSourceCatalog(ctx.supabase, ctx.job.source_book_ids, ctx.job.include_drafts);
    if (catalog.fiches.length === 0) throw new GeminiError("Aucune fiche dans les livres choisis.");
    const prompt = buildPlanPrompt(ctx.bookTitle, { books: catalog.books, text: buildCatalogText(catalog.books, catalog.fiches), ficheCount: catalog.fiches.length }, targetSubPartCount(catalog.fiches.length));
    return new Map(tasks.map((t) => [t.id, { prompt }]));
  },
  async apply(_ctx, _task, _prepared, raw) {
    const plan = numberPlan(normalizePlan(raw));
    if (flattenSubParts(plan).length === 0) throw new GeminiError("Table des matières vide.");
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
  const catalog = await loadSourceCatalog(supabase, job.source_book_ids, job.include_drafts);
  await upsertTasks(
    supabase,
    job.id,
    "assign",
    chunk(catalog.fiches, ASSIGN_CHUNK).map((fiches, i) => ({ refKey: `assign:${pad(i)}`, input: { fiches } }))
  );
  await transition(supabase, job, "assign", {
    plan: plan as unknown as Json,
    stats: mergeStats(job, {
      sourceFiches: catalog.fiches.length,
      sourceBlocks: catalog.fiches.reduce((s, f) => s + f.blockCount, 0),
      sourceCards: catalog.fiches.reduce((s, f) => s + f.cardCount, 0),
      subParts: flattenSubParts(plan).length,
    }),
  });
}

// -- 2. Répartition : chaque fiche source → une sous-partie -----------------

const assignHandler: StageHandler = {
  toolName: "enregistrer_repartition",
  toolDescription: "Enregistre la sous-partie de chaque fiche source.",
  schema: ASSIGN_SCHEMA,
  async prepare(ctx, tasks) {
    const subParts = flattenSubParts(planOf(ctx.job)).map((s) => ({ key: s.key, path: subPartPath(s), scope: s.scope }));
    return new Map(
      tasks.map((t) => {
        const fiches = ((t.input as { fiches?: SourceFicheRef[] }).fiches ?? []).map((ref, i) => ({ alias: alias("F", i), ref }));
        return [t.id, { prompt: buildAssignPrompt(ctx.bookTitle, subParts, fiches) }];
      })
    );
  },
  async apply(_ctx, task, _prepared, raw) {
    const assignments = normalizeAssignments(raw);
    const expected = ((task.input as { fiches?: SourceFicheRef[] }).fiches ?? []).length;
    // Less than half placed: the answer was cut short — ask again rather than guess most of it.
    if (assignments.length < expected / 2) throw new GeminiError(`Répartition incomplète (${assignments.length}/${expected}).`);
    return { assignments } as unknown as Json;
  },
};

export async function finalizeAssign(ctx: StageContext): Promise<void> {
  const { supabase, job } = ctx;
  const plan = planOf(job);
  const subParts = flattenSubParts(plan);
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
  const { byKey, fallbackCount } = resolveAssignments(
    subParts.map((s) => s.key),
    allFiches,
    answers
  );
  const refById = new Map(allFiches.map((f) => [f.ficheId, f]));

  // A sub-part nothing went to is dropped from the book.
  const kept = subParts.filter((s) => (byKey.get(s.key) ?? []).length > 0);
  const keptKeys = new Set(kept.map((s) => s.key));
  const trimmed: MergePlan = {
    parts: plan.parts.map((p) => ({ ...p, subParts: p.subParts.filter((s) => keptKeys.has(s.key)) })).filter((p) => p.subParts.length),
  };

  await upsertTasks(
    supabase,
    job.id,
    "chapter",
    kept.map((s) => ({ refKey: `chapter:${pad(s.orderIndex)}`, input: { key: s.key, fiches: (byKey.get(s.key) ?? []).map((id) => refById.get(id)!) } }))
  );
  await transition(supabase, job, "chapters", { plan: trimmed as unknown as Json, stats: mergeStats(job, { subParts: kept.length, assignFallback: fallbackCount }) });
}

// -- 3. Chapitres et fiches d'une sous-partie -------------------------------

const outlineHandler: StageHandler = {
  toolName: "enregistrer_chapitres",
  toolDescription: "Enregistre les chapitres de la sous-partie et les fiches fusionnées de chacun, dans l'ordre d'apprentissage.",
  schema: OUTLINE_SCHEMA,
  async prepare(ctx, tasks) {
    const plan = planOf(ctx.job);
    const subParts = flattenSubParts(plan);
    return new Map(
      tasks.map((t) => {
        const input = t.input as unknown as { key: string; fiches: SourceFicheRef[] };
        const sub = subParts.find((s) => s.key === input.key);
        const neighbours = subParts.filter((s) => s.partTitle === sub?.partTitle && s.key !== input.key).map((s) => s.title || s.partTitle);
        const prompt = buildOutlinePrompt(
          ctx.bookTitle,
          { partTitle: sub?.partTitle ?? "", title: sub?.title ?? "", scope: sub?.scope ?? "", neighbours },
          input.fiches.map((ref, i) => ({ alias: alias("F", i), ref }))
        );
        return [t.id, { prompt }];
      })
    );
  },
  async apply(_ctx, task, _prepared, raw) {
    const chapters = normalizeOutline(raw);
    if (chapters.length === 0) throw new GeminiError("Aucun chapitre proposé pour cette sous-partie.");
    const expected = (task.input as unknown as { fiches: SourceFicheRef[] }).fiches.length;
    const placed = new Set(chapters.flatMap((c) => c.fiches.flatMap((f) => f.sources.map((s) => s.toUpperCase()))));
    // Fewer than half the fiches placed: the answer was cut short.
    if (placed.size < expected / 2) throw new GeminiError(`Plan de sous-partie incomplet (${placed.size}/${expected} fiches).`);
    return { chapters } as unknown as Json;
  },
};

/** What a fiche task needs: which source fiches, and — for a source shared with other merged fiches — which of its blocks and cards. */
export interface FicheTaskInput {
  key: string;
  chapterId: string;
  subEntityId: string;
  ficheId: string;
  title: string;
  objective: string;
  /** Position of the fiche in its chapter. */
  orderIndex: number;
  siblings: string[];
  /** Characters of source content sent: sizes the call (a Gemini call must fit in one run of the queue). */
  chars: number;
  sources: {
    ficheId: string;
    bookTitle: string;
    chapterId: string;
    chapterTitle: string;
    title: string;
    /** Set when the source fiche is shared: only these of its blocks / cards come to this fiche. */
    blockIds?: string[];
    cardIds?: string[];
    sharedWith?: string[];
  }[];
}

const blockText = (b: SourceBlock) => blockPromptText(b.blockType, b.content);
const cardText = (c: SourceCard) => `${c.front}\n${c.back}`;

export async function finalizeChapters(ctx: StageContext): Promise<void> {
  const { supabase, job } = ctx;
  const plan = planOf(job);
  const subParts = flattenSubParts(plan);
  const tasks = await stageTasks(supabase, job.id, "chapter");

  // 1. Each sub-part's chapters and merged fiches, made safe.
  const outlines = tasks.map((t) => {
    const input = t.input as unknown as { key: string; fiches: SourceFicheRef[] };
    const sub = subParts.find((s) => s.key === input.key);
    const planned = t.status === "done" ? ((t.output as { chapters?: { title: string; fiches: { title: string; objective: string; sources: string[] }[] }[] } | null)?.chapters ?? []) : [];
    const aliasToFiche = Object.fromEntries(input.fiches.map((f, i) => [alias("F", i), f.ficheId]));
    return { key: input.key, refs: input.fiches, ...resolveOutline(planned, aliasToFiche, input.fiches, sub?.title || sub?.partTitle || "Compléments") };
  });
  const titlesBySubPart = new Map(outlines.map((o) => [o.key, o.chapters.map((c) => c.title)]));
  const fullPlan = withChapters(plan, job.id, titlesBySubPart);
  const chapters = flattenChapters(fullPlan);
  const chapterByKey = new Map(chapters.map((c) => [c.key, c]));

  // 2. Merged fiches, with stable ids.
  type Merged = { key: string; chapter: FlatPlanChapter; title: string; objective: string; sourceIds: string[]; orderIndex: number; siblings: string[] };
  const merged: Merged[] = [];
  const refById = new Map<string, SourceFicheRef>();
  for (const o of outlines) {
    o.refs.forEach((r) => refById.set(r.ficheId, r));
    o.chapters.forEach((c, ci) => {
      const chapter = chapterByKey.get(`${o.key}.C${ci + 1}`)!;
      c.fiches.forEach((f, fi) =>
        merged.push({ key: `${chapter.key}.F${fi + 1}`, chapter, title: f.title, objective: f.objective, sourceIds: f.sourceFicheIds, orderIndex: fi, siblings: c.fiches.filter((x) => x !== f).map((x) => x.title) })
      );
    });
  }

  // 3. A source fiche feeding several merged fiches shares out its blocks and cards.
  const users = new Map<string, Merged[]>();
  for (const m of merged) for (const id of m.sourceIds) users.set(id, [...(users.get(id) ?? []), m]);
  const shared = [...users.entries()].filter(([, ms]) => ms.length > 1);
  const route = new Map<string, Map<string, string>>(); // source fiche → item id → merged key
  const itemChars = new Map<string, number>();
  if (shared.length) {
    // The content of every source of the merged fiches involved: a fiche's own sources say best what it is about.
    const involved = new Set(shared.flatMap(([, ms]) => ms.flatMap((m) => m.sourceIds)));
    const content = await loadSourceContent(supabase, [...involved], job.include_drafts);
    const sharedIds = new Set(shared.map(([id]) => id));
    const textOf = (id: string) => [
      refById.get(id)?.title ?? "",
      refById.get(id)?.summary ?? "",
      ...(content.blocksByFiche.get(id) ?? []).map(blockText),
      ...(content.cardsByFiche.get(id) ?? []).map(cardText),
    ];
    for (const [ficheId, ms] of shared) {
      const targets = ms.map((m) => ({
        key: m.key,
        profile: [m.title, m.title, m.objective, ...m.sourceIds.filter((id) => id !== ficheId && !sharedIds.has(id)).flatMap(textOf)].join(" "),
      }));
      const blocks = (content.blocksByFiche.get(ficheId) ?? []).map((b) => ({ id: b.id, text: blockText(b) }));
      const cards = (content.cardsByFiche.get(ficheId) ?? []).map((c) => ({ id: c.id, text: cardText(c) }));
      [...blocks, ...cards].forEach((x) => itemChars.set(x.id, x.text.length + 40));
      route.set(ficheId, routeItems([...blocks, ...cards], targets));
    }
  }

  // 4. One fiche task per merged fiche, held until its chapter is chosen (releaseChapters writes the rows then).
  const rows = merged.map((m) => ({ ...m, subEntityId: stableUuid(job.id, "sub", m.key), ficheId: stableUuid(job.id, "fiche", m.key) }));

  const ficheTasks = rows.map((r) => {
    let chars = 0;
    const sources = r.sourceIds.map((id) => {
      const ref = refById.get(id)!;
      const base = { ficheId: id, bookTitle: ref.bookTitle, chapterId: ref.chapterId, chapterTitle: ref.chapterTitle, title: ref.title };
      const routed = route.get(id);
      if (!routed) {
        chars += ref.chars;
        return base;
      }
      const mine = [...routed.entries()].filter(([, key]) => key === r.key).map(([itemId]) => itemId);
      chars += mine.reduce((s, itemId) => s + (itemChars.get(itemId) ?? 0), 0);
      const sharedWith = (users.get(id) ?? []).filter((m) => m.key !== r.key).map((m) => m.title);
      return { ...base, blockIds: mine, cardIds: mine, sharedWith };
    });
    const input: FicheTaskInput = {
      key: r.key,
      chapterId: r.chapter.chapterId,
      subEntityId: r.subEntityId,
      ficheId: r.ficheId,
      title: r.title,
      objective: r.objective,
      orderIndex: r.orderIndex,
      siblings: r.siblings,
      chars,
      sources,
    };
    return { refKey: `fiche:${pad(r.chapter.orderIndex)}:${pad(r.orderIndex, 3)}`, input };
  });

  // Every fiche of the books must be used somewhere in the table of contents.
  const catalog = await loadSourceCatalog(supabase, job.source_book_ids, job.include_drafts);
  const used = new Set(merged.flatMap((m) => m.sourceIds));

  await upsertTasks(supabase, job.id, "fiche", ficheTasks, { status: "held" });
  await transition(supabase, job, "ready", {
    plan: fullPlan as unknown as Json,
    stats: mergeStats(job, {
      chapters: chapters.length,
      fichesPlanned: ficheTasks.length,
      unusedFiches: catalog.fiches.filter((f) => !used.has(f.ficheId)).length,
      fichesSplit: outlines.reduce((s, o) => s + o.splitCount, 0),
      chapterFallback: outlines.reduce((s, o) => s + o.fallbackCount, 0),
    }),
  });
}

// -- Lots : les chapitres choisis passent à la rédaction ----------------------

/**
 * Starts writing the chosen chapters: their merged fiches get their rows
 * (chapter in « extraction », sub-entity, empty draft fiche) and their held
 * tasks go into the queue as lot `round + 1`. Done months after the table of
 * contents, so the sources are taken as they are now: a source fiche deleted
 * since is left out, a merged fiche left with no source at all is dropped,
 * and a block or card added since to a source shared between several merged
 * fiches goes to the first of this lot that uses it — nothing new is lost.
 */
export async function releaseChapters(supabase: Admin, job: Job, chapterIds: string[]): Promise<{ chapters: number; fiches: number; dropped: number }> {
  const wanted = new Set(chapterIds);
  const all = await stageTasks(supabase, job.id, "fiche");
  const held = all.filter((t) => t.status === "held" && wanted.has((t.input as unknown as FicheTaskInput).chapterId));
  if (!held.length) throw new GeminiError("Aucun de ces chapitres n'attend d'être rédigé.");

  // The job moves on first, locked: the queue can't close this lot while its tasks are being written.
  const round = (job.round ?? 0) + 1;
  const { data: moved } = await supabase
    .from("el_profesor_merge_jobs")
    .update({ stage: "fiches", round, error: null, locked_until: new Date(Date.now() + 4 * 60_000).toISOString() })
    .eq("id", job.id)
    .eq("stage", "ready")
    .select("id")
    .maybeSingle();
  if (!moved) throw new GeminiError("Un lot est déjà en cours pour cette fusion.");

  try {
    const sourceIds = [...new Set(held.flatMap((t) => (t.input as unknown as FicheTaskInput).sources.map((s) => s.ficheId)))];
    const content = await loadSourceContent(supabase, sourceIds, job.include_drafts);
    const itemIds = (ficheId: string) => [...(content.blocksByFiche.get(ficheId) ?? []), ...(content.cardsByFiche.get(ficheId) ?? [])].map((x) => x.id);

    // Every fiche task's input, editable: released ones are written below, held ones too when they receive items.
    const inputs = new Map(all.map((t) => [t.id, JSON.parse(JSON.stringify(t.input)) as FicheTaskInput]));
    const heldIds = new Set(held.map((t) => t.id));
    const touchedHeld = new Set<string>();

    // A shared source's blocks and cards that no merged fiche has (added since the table of contents, or not
    // read when it was made): shared out by subject among every merged fiche using that source. A share that
    // falls to a fiche already written goes to one of this lot instead — nothing is left without a fiche.
    const users = new Map<string, Task[]>();
    for (const t of all) for (const s of inputs.get(t.id)!.sources) if (s.blockIds) users.set(s.ficheId, [...(users.get(s.ficheId) ?? []), t]);
    for (const sourceId of sourceIds) {
      const tasksOfSource = users.get(sourceId);
      if (!tasksOfSource?.length) continue;
      const known = new Set(tasksOfSource.flatMap((t) => inputs.get(t.id)!.sources.filter((s) => s.ficheId === sourceId).flatMap((s) => [...(s.blockIds ?? []), ...(s.cardIds ?? [])])));
      const fresh = [
        ...(content.blocksByFiche.get(sourceId) ?? []).map((b) => ({ id: b.id, text: blockText(b) })),
        ...(content.cardsByFiche.get(sourceId) ?? []).map((c) => ({ id: c.id, text: cardText(c) })),
      ].filter((x) => !known.has(x.id));
      if (!fresh.length) continue;
      const open = tasksOfSource.filter((t) => t.status === "held");
      const inLot = open.filter((t) => heldIds.has(t.id));
      if (!inLot.length) continue; // only chapters of later lots use it: they'll take it when they're written
      const targets = open.map((t) => ({ key: t.id, profile: [inputs.get(t.id)!.title, inputs.get(t.id)!.title, inputs.get(t.id)!.objective].join(" ") }));
      const routed = routeItems(fresh, targets);
      for (const item of fresh) {
        const taskId = routed.get(item.id) ?? inLot[0].id;
        const source = inputs.get(taskId)!.sources.find((s) => s.ficheId === sourceId)!;
        source.blockIds = [...(source.blockIds ?? []), item.id];
        source.cardIds = [...(source.cardIds ?? []), item.id];
        if (!heldIds.has(taskId)) touchedHeld.add(taskId);
      }
    }

    const released: { task: Task; input: FicheTaskInput }[] = [];
    const dropped: Task[] = [];
    for (const t of held) {
      const input = inputs.get(t.id)!;
      input.sources = input.sources.filter((s) => itemIds(s.ficheId).length > 0);
      if (input.sources.length) released.push({ task: t, input });
      else dropped.push(t);
    }
    // Held fiches of later lots that received a share: their input is saved, they stay held.
    const byId = new Map(all.map((t) => [t.id, t]));
    for (const part of chunk([...touchedHeld], 200)) {
      const { error } = await supabase.from("el_profesor_merge_tasks").upsert(
        part.map((id) => ({ id, job_id: job.id, stage: "fiche" as const, ref_key: byId.get(id)!.ref_key, input: inputs.get(id) as unknown as Json, status: "held" as const, round: 0 })),
        { onConflict: "id" }
      );
      if (error) throw new GeminiError(`Répartition impossible : ${error.message}`);
    }

    const plannedChapters = new Map(flattenChapters(planOf(job)).map((c) => [c.chapterId, c]));
    const chapters = [...new Set(released.map((r) => r.input.chapterId))].map((id) => plannedChapters.get(id)).filter((c): c is FlatPlanChapter => Boolean(c));
    for (const part of chunk(chapters, 200)) {
      const { error } = await supabase.from("el_profesor_chapters").upsert(
        part.map((c) => ({
          id: c.chapterId,
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
    for (const part of chunk(released, 300)) {
      await supabase.from("el_profesor_sub_entities").upsert(
        part.map(({ input }) => ({ id: input.subEntityId, chapter_id: input.chapterId, name: input.title, order_index: input.orderIndex, summary: input.objective, source_fiche_ids: input.sources.map((s) => s.ficheId) })),
        { onConflict: "id", ignoreDuplicates: true }
      );
      await supabase.from("el_profesor_fiches").upsert(
        part.map(({ input }) => ({ id: input.ficheId, sub_entity_id: input.subEntityId, title: input.title, status: "draft" as const })),
        { onConflict: "id", ignoreDuplicates: true }
      );
    }
    const now = new Date().toISOString();
    for (const part of chunk(released, 200)) {
      const { error } = await supabase.from("el_profesor_merge_tasks").upsert(
        part.map(({ task, input }) => ({
          id: task.id,
          job_id: job.id,
          stage: "fiche" as const,
          ref_key: task.ref_key,
          input: input as unknown as Json,
          status: "waiting" as const,
          round,
          attempts: 0,
          error: null,
          next_attempt_at: now,
        })),
        { onConflict: "id" }
      );
      if (error) throw new GeminiError(`Lancement du lot impossible : ${error.message}`);
    }
    for (const part of chunk(dropped, 200))
      await supabase.from("el_profesor_merge_tasks").delete().in("id", part.map((t) => t.id));
    return { chapters: chapters.length, fiches: released.length, dropped: dropped.length };
  } catch (err) {
    // Nothing was queued: the fusion waits again for a lot to be chosen.
    await supabase.from("el_profesor_merge_tasks").update({ status: "held", round: 0 }).eq("job_id", job.id).eq("stage", "fiche").eq("round", round).eq("status", "waiting");
    await supabase.from("el_profesor_merge_jobs").update({ stage: "ready", round: job.round ?? 0, locked_until: null }).eq("id", job.id);
    throw err;
  } finally {
    await supabase.from("el_profesor_merge_jobs").update({ locked_until: null }).eq("id", job.id).eq("stage", "fiches");
  }
}

// -- 4. Fiches --------------------------------------------------------------

interface FichePrepared {
  blockIds: string[];
  cardIds: string[];
}

function pagesOf(citations: Citation[]): number[] {
  return [...new Set(citations.map((c) => c.page).filter((p) => p > 0))].sort((a, b) => a - b);
}

type SourceContent = Awaited<ReturnType<typeof loadSourceContent>>;

/** The blocks and cards of each source that belong to this merged fiche (all of them, unless the source is shared). */
function sourceItems(input: FicheTaskInput, content: SourceContent) {
  return input.sources.map((s) => {
    const keepBlock = s.blockIds ? new Set(s.blockIds) : null;
    const keepCard = s.cardIds ? new Set(s.cardIds) : null;
    return {
      source: s,
      blocks: (content.blocksByFiche.get(s.ficheId) ?? []).filter((b) => !keepBlock || keepBlock.has(b.id)),
      cards: (content.cardsByFiche.get(s.ficheId) ?? []).filter((c) => !keepCard || keepCard.has(c.id)),
    };
  });
}

function promptSources(input: FicheTaskInput, content: SourceContent): { sources: PromptSourceFiche[]; prepared: FichePrepared } {
  const prepared: FichePrepared = { blockIds: [], cardIds: [] };
  const sources = sourceItems(input, content).map(({ source, blocks, cards }, fi) => ({
    alias: alias("F", fi),
    bookTitle: source.bookTitle,
    chapterTitle: source.chapterTitle,
    title: source.title,
    sharedWith: source.sharedWith ?? [],
    blocks: blocks.map((b) => {
      prepared.blockIds.push(b.id);
      return { alias: alias("B", prepared.blockIds.length - 1), blockType: b.blockType, content: b.content, pages: pagesOf(b.citations), image: b.imageUrl ? b.imageAlt || "figure" : null };
    }),
    // Image-occlusion and cloze cards aren't sent: they come over as they are.
    cards: cards
      .filter((c) => !c.structural)
      .map((c) => {
        prepared.cardIds.push(c.id);
        return { alias: alias("K", prepared.cardIds.length - 1), front: c.front, back: c.back };
      }),
  }));
  return { sources, prepared };
}

async function contentFor(ctx: StageContext, inputs: FicheTaskInput[]) {
  return loadSourceContent(ctx.supabase, [...new Set(inputs.flatMap((i) => i.sources.map((s) => s.ficheId)))], ctx.job.include_drafts);
}

function sourceMeta(input: FicheTaskInput) {
  const byFiche = new Map(input.sources.map((s) => [s.ficheId, s]));
  return (ficheId: string) => {
    const s = byFiche.get(ficheId);
    return { chapterId: s?.chapterId ?? "", bookTitle: s?.bookTitle ?? "", chapterTitle: s?.chapterTitle ?? "" };
  };
}

const ficheHandler: StageHandler = {
  toolName: "enregistrer_fiche_fusionnee",
  toolDescription: "Enregistre la fiche fusionnée et ses flashcards.",
  schema: FICHE_SCHEMA,
  async prepare(ctx, tasks) {
    const inputs = tasks.map((t) => t.input as unknown as FicheTaskInput);
    const content = await contentFor(ctx, inputs);
    const chapters = new Map(flattenChapters(planOf(ctx.job)).map((c) => [c.chapterId, c]));
    const out = new Map<string, PreparedTask>();
    tasks.forEach((t, i) => {
      const input = inputs[i];
      const chapter = chapters.get(input.chapterId);
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
    const items = sourceItems(input, content);
    const meta = sourceMeta(input);
    const blockById = new Map(items.flatMap((x) => x.blocks).map((b) => [b.id, b]));
    const cardById = new Map(items.flatMap((x) => x.cards).map((c) => [c.id, c]));
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
      const srcIds = [...new Set(c.source_flashcard_ids.map((a) => resolve("K", prepared.cardIds, a)).filter((id): id is string => Boolean(id && cardById.has(id) && !claimedCards.has(id))))];
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
    for (const c of cardById.values())
      if (c.structural) {
        cards.push(copiedCard(c, meta));
        claimedCards.add(c.id);
      }

    // Values check: every number of a source block must still be stated somewhere in the fiche, every number of a source card on a card.
    const ficheFacts = numericFacts(blocks.map((b) => blockPromptText(b.blockType, b.content)).join("\n"));
    const cardFacts = numericFacts(cards.map((c) => `${c.front}\n${c.back}`).join("\n"));
    const lostBlocks: Record<string, string[]> = {};
    for (const id of claimedBlocks) {
      const lost = missingFacts(blockText(blockById.get(id)!), ficheFacts);
      if (lost.length) lostBlocks[id] = lost;
    }
    const lostCards: Record<string, string[]> = {};
    for (const id of claimedCards) {
      const card = cardById.get(id)!;
      if (card.structural) continue;
      const lost = missingFacts(cardText(card), cardFacts);
      if (lost.length) lostCards[id] = lost;
    }

    await writeMergedFiche(ctx.supabase, input, merged.summary, blocks, cards);
    return {
      givenBlockIds: [...blockById.keys()],
      givenCardIds: [...cardById.keys()],
      claimedBlockIds: [...claimedBlocks],
      claimedCardIds: [...claimedCards],
      lostBlocks,
      lostCards,
      hasKeyPoints: blocks.some((b) => b.blockType === "a_retenir"),
      blocks: blocks.length,
      cards: cards.length,
      divergences: blocks.filter((b) => b.blockType === "divergence").length,
    } as unknown as Json;
  },
};

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

function copiedCard(c: SourceCard, meta: ReturnType<typeof sourceMeta>, needsReview = false): MergedCardDraft {
  return {
    front: c.front,
    back: c.back,
    citations: cardCitations([c], meta),
    imageUrl: c.row.image_url,
    imageAlt: c.row.image_alt,
    sourceFlashcardIds: [c.id],
    needsReview,
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
  lostBlocks?: Record<string, string[]>;
  lostCards?: Record<string, string[]>;
  hasKeyPoints?: boolean;
  divergences: number;
}

export type RepairInput = FicheTaskInput & {
  blockIds: string[];
  cardIds: string[];
  lostValues: Record<string, string[]>;
  needsKeyPoints: boolean;
};

export async function finalizeFiches(ctx: StageContext): Promise<void> {
  const { supabase, job } = ctx;
  // This lot only: earlier lots are closed, later ones still held.
  const tasks = (await stageTasks(supabase, job.id, "fiche")).filter((t) => t.round === job.round && t.status !== "held");
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
    const items = sourceItems(input, content);
    const blocks = items.flatMap((x) => x.blocks.map((b) => verbatimBlock(b, meta)));
    const cards = items.flatMap((x) => x.cards.map((c) => copiedCard(c, meta, true)));
    await writeMergedFiche(supabase, input, "", blocks, cards);
    const blockIds = items.flatMap((x) => x.blocks.map((b) => b.id));
    const cardIds = items.flatMap((x) => x.cards.map((c) => c.id));
    outputs.set(t.id, { givenBlockIds: blockIds, givenCardIds: cardIds, claimedBlockIds: blockIds, claimedCardIds: cardIds, hasKeyPoints: false, divergences: 0 });
  }

  // Coverage over the whole book: a block given to two fiches is covered once either took it.
  const all = [...outputs.values()];
  const missingBlocks = new Set(uncovered(all.flatMap((o) => o.givenBlockIds), all.flatMap((o) => o.claimedBlockIds)));
  const missingCards = new Set(uncovered(all.flatMap((o) => o.givenCardIds), all.flatMap((o) => o.claimedCardIds)));
  const assigned = new Set<string>();
  const repairTasks: { refKey: string; input: RepairInput }[] = [];
  for (const t of tasks) {
    const o = outputs.get(t.id)!;
    const input = t.input as unknown as FicheTaskInput;
    const take = (ids: string[], missing: Set<string>, lost: Record<string, string[]> = {}) =>
      [...new Set([...ids.filter((id) => missing.has(id)), ...Object.keys(lost)])].filter((id) => {
        if (assigned.has(id)) return false;
        assigned.add(id);
        return true;
      });
    const blockIds = take(o.givenBlockIds, missingBlocks, o.lostBlocks);
    const cardIds = take(o.givenCardIds, missingCards, o.lostCards);
    const needsKeyPoints = o.hasKeyPoints === false && o.claimedBlockIds.length > 0;
    if (!blockIds.length && !cardIds.length && !needsKeyPoints) continue;
    repairTasks.push({
      refKey: t.ref_key.replace(/^fiche:/, "repair:"),
      input: { ...input, blockIds, cardIds, lostValues: { ...(o.lostBlocks ?? {}), ...(o.lostCards ?? {}) }, needsKeyPoints },
    });
  }

  await upsertTasks(supabase, job.id, "repair", repairTasks, { round: job.round });
  const previous = (job.stats as MergeStats | null) ?? {};
  await transition(supabase, job, "repair", {
    stats: mergeStats(job, {
      fichesDone: (previous.fichesDone ?? 0) + tasks.length - failed,
      fichesFailed: (previous.fichesFailed ?? 0) + failed,
      fichesRepaired: (previous.fichesRepaired ?? 0) + repairTasks.length,
      divergences: (previous.divergences ?? 0) + all.reduce((s, o) => s + (o.divergences ?? 0), 0),
    }),
  });
}

// -- 5. Rattrapage ----------------------------------------------------------

interface RepairPrepared {
  blockIds: string[];
  cardIds: string[];
  currentIds: string[];
}

async function repairMaterial(ctx: StageContext, input: RepairInput) {
  const content = await contentFor(ctx, [input]);
  const wantedBlocks = new Set(input.blockIds);
  const wantedCards = new Set(input.cardIds);
  return {
    blocks: [...content.blocksByFiche.values()].flat().filter((b) => wantedBlocks.has(b.id)),
    cards: [...content.cardsByFiche.values()].flat().filter((c) => wantedCards.has(c.id)),
  };
}

const repairHandler: StageHandler = {
  toolName: "enregistrer_rattrapage",
  toolDescription: "Enregistre l'intégration des informations manquantes dans la fiche.",
  schema: REPAIR_SCHEMA,
  async prepare(ctx, tasks) {
    const chapters = new Map(flattenChapters(planOf(ctx.job)).map((c) => [c.chapterId, c]));
    const out = new Map<string, PreparedTask>();
    for (const t of tasks) {
      const input = t.input as unknown as RepairInput;
      const [current, material] = await Promise.all([loadFicheBlocks(ctx.supabase, input.ficheId), repairMaterial(ctx, input)]);
      const meta = sourceMeta(input);
      const prompt = buildRepairPrompt(
        { bookTitle: ctx.bookTitle, chapterTitle: chapters.get(input.chapterId)?.title ?? "", title: input.title },
        current.map((b, index) => ({ index, blockType: b.block_type, content: b.content as unknown as BlockContent })),
        material.blocks.map((m, i) => ({ alias: alias("B", i), bookTitle: meta(m.ficheId).bookTitle, blockType: m.blockType, content: m.content, lostValues: input.lostValues[m.id] ?? [] })),
        material.cards.map((c, i) => ({ alias: alias("K", i), bookTitle: meta(c.ficheId).bookTitle, front: c.front, back: c.back, lostValues: input.lostValues[c.id] ?? [] })),
        input.needsKeyPoints
      );
      out.set(t.id, {
        prompt,
        prepared: { blockIds: material.blocks.map((m) => m.id), cardIds: material.cards.map((c) => c.id), currentIds: current.map((b) => b.id) } as unknown as Json,
      });
    }
    return out;
  },
  async apply(ctx, task, preparedJson, raw) {
    const input = task.input as unknown as RepairInput;
    const prepared = preparedJson as unknown as RepairPrepared;
    const repair = normalizeRepair(raw);
    const [current, material] = await Promise.all([loadFicheBlocks(ctx.supabase, input.ficheId), repairMaterial(ctx, input)]);
    // The fiche changed since the prompt was built (edited by hand): its numbering no longer holds.
    if (current.map((b) => b.id).join() !== prepared.currentIds.join()) throw new GeminiError("Fiche modifiée entre-temps.");
    const meta = sourceMeta(input);
    const blockById = new Map(material.blocks.map((m) => [m.id, m]));
    const cardById = new Map(material.cards.map((c) => [c.id, c]));
    const referenced = new Set<string>();
    const sourcesOf = (aliases: string[]) =>
      aliases
        .map((a) => prepared.blockIds[aliasIndex("B", a)])
        .filter((id): id is string => Boolean(id && blockById.has(id)))
        .map((id) => {
          referenced.add(id);
          const b = blockById.get(id)!;
          return { id, ...meta(b.ficheId), citations: b.citations };
        });

    const entries = current.map((b) => ({
      id: b.id,
      type: b.block_type as BlockType,
      content: b.content as unknown as BlockContent,
      citations: (b.citations as unknown as Citation[]) ?? [],
      touched: false,
    }));
    for (const r of repair.replacements) {
      const e = entries[r.block_index];
      if (!e) continue;
      const content = normalizeContent(e.type, r.content);
      if (!content) continue;
      const keptHeading = r.heading ?? heading(e.content);
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
    // Never after the closing « À retenir ».
    let lastIndex = entries.length - 1;
    while (lastIndex >= 0 && entries[lastIndex].type === "a_retenir") lastIndex--;
    const insertsAfter = new Map<number, MergedBlockDraft[]>();
    for (const ins of repair.insertions) {
      const at = ins.block_type === "a_retenir" ? entries.length - 1 : Math.min(Math.max(-1, ins.after_block_index), lastIndex);
      const list = insertsAfter.get(at) ?? [];
      list.push({
        blockType: ins.block_type,
        content: (ins.heading ? { ...ins.content, heading: ins.heading } : ins.content) as BlockContent,
        citations: mergeCitations(sourcesOf(ins.source_block_ids)),
        imageUrl: null,
        imageAlt: null,
        suggestedImage: null,
        isEmergency: false,
        needsReview: false,
      });
      insertsAfter.set(at, list);
    }
    const ordered: Parameters<typeof rewriteFicheBlocks>[2] = [];
    for (const d of insertsAfter.get(-1) ?? []) ordered.push({ draft: d });
    entries.forEach((e, i) => {
      ordered.push(e.touched ? { id: e.id, content: e.content, citations: e.citations.slice(0, 16) } : { id: e.id });
      for (const d of insertsAfter.get(i) ?? []) ordered.push({ draft: d });
    });
    await rewriteFicheBlocks(ctx.supabase, input.ficheId, ordered);

    // A block counts as taken up once referenced — and, when it was here for lost values, once those values are in the fiche.
    const finalText = [
      ...entries.map((e) => blockPromptText(e.type, e.content)),
      ...[...insertsAfter.values()].flat().map((d) => blockPromptText(d.blockType, d.content)),
    ].join("\n");
    const facts = numericFacts(finalText);
    const claimedBlocks = [...referenced].filter((id) => !(input.lostValues[id]?.length && missingFacts(blockPromptText(blockById.get(id)!.blockType, blockById.get(id)!.content), facts).length));

    const claimedCards = new Set<string>();
    const newCards: MergedCardDraft[] = repair.flashcards.map((c) => {
      const srcIds = c.source_flashcard_ids.map((a) => prepared.cardIds[aliasIndex("K", a)]).filter((id): id is string => Boolean(id && cardById.has(id)));
      srcIds.forEach((id) => claimedCards.add(id));
      return { front: c.front, back: c.back, citations: cardCitations(srcIds.map((id) => cardById.get(id)!), meta), imageUrl: null, imageAlt: null, sourceFlashcardIds: srcIds, needsReview: false };
    });
    await appendMergedCards(ctx.supabase, input.ficheId, newCards);
    return { claimedBlocks, claimedCards: [...claimedCards], cardsAdded: newCards.length } as unknown as Json;
  },
};

function heading(content: unknown): string | undefined {
  const h = (content as { heading?: unknown } | null)?.heading;
  return typeof h === "string" && h ? h : undefined;
}

export async function finalizeRepair(ctx: StageContext): Promise<void> {
  const { supabase, job } = ctx;
  const tasks = (await stageTasks(supabase, job.id, "repair")).filter((t) => t.round === job.round);
  let blocksKept = 0;
  let cardsKept = 0;
  for (const t of tasks) {
    const input = t.input as unknown as RepairInput;
    const output = (t.output as { claimedBlocks?: string[]; claimedCards?: string[]; keptVerbatim?: boolean } | null) ?? {};
    // Done on an earlier, interrupted run of this step: nothing to add again.
    if (output.keptVerbatim) continue;
    const claimedBlocks = new Set(t.status === "done" ? (output.claimedBlocks ?? []) : []);
    const claimedCards = new Set(t.status === "done" ? (output.claimedCards ?? []) : []);
    const leftBlocks = input.blockIds.filter((id) => !claimedBlocks.has(id));
    const leftCards = input.cardIds.filter((id) => !claimedCards.has(id));
    if (leftBlocks.length || leftCards.length) {
      // Still not taken up after two passes: the source itself goes in, marked « à vérifier » — before « À retenir » for a block.
      const material = await repairMaterial(ctx, input);
      const meta = sourceMeta(input);
      const blocks = material.blocks.filter((b) => leftBlocks.includes(b.id));
      if (blocks.length) {
        const current = await loadFicheBlocks(supabase, input.ficheId);
        const cut = current.findIndex((b) => b.block_type === "a_retenir");
        const before = cut === -1 ? current : current.slice(0, cut);
        const after = cut === -1 ? [] : current.slice(cut);
        await rewriteFicheBlocks(supabase, input.ficheId, [...before.map((b) => ({ id: b.id })), ...blocks.map((m) => ({ draft: verbatimBlock(m, meta) })), ...after.map((b) => ({ id: b.id }))]);
      }
      const cards = material.cards.filter((c) => leftCards.includes(c.id));
      await appendMergedCards(supabase, input.ficheId, cards.map((c) => copiedCard(c, meta, true)));
      blocksKept += blocks.length;
      cardsKept += cards.length;
    }
    await saveOutput(supabase, t, { ...output, keptVerbatim: true });
  }

  const ficheTasks = await stageTasks(supabase, job.id, "fiche");
  const lot = ficheTasks.filter((t) => t.round === job.round);
  const chapterIds = [...new Set(lot.map((t) => (t.input as unknown as FicheTaskInput).chapterId))];
  for (const part of chunk(chapterIds, 150))
    await supabase.from("el_profesor_chapters").update({ status: "draft_ready", extraction_error: null }).in("id", part).eq("status", "extracting");

  const usage = await jobUsage(supabase, job.id);
  const lotUsage = await jobUsage(supabase, job.id, job.round);
  const previous = (job.stats as MergeStats | null) ?? {};
  const left = ficheTasks.some((t) => t.status === "held");
  await transition(supabase, job, left ? "ready" : "done", {
    stats: mergeStats(job, {
      blocksKeptVerbatim: (previous.blocksKeptVerbatim ?? 0) + blocksKept,
      cardsKeptVerbatim: (previous.cardsKeptVerbatim ?? 0) + cardsKept,
      ...usage,
      rounds: [
        ...(previous.rounds ?? []).filter((r) => r.round !== job.round),
        lot.length
          ? { round: job.round, chapters: chapterIds.length, fiches: lot.length, inputTokens: lotUsage.inputTokens, outputTokens: lotUsage.outputTokens, finishedAt: new Date().toISOString() }
          : { round: job.round, chapters: 0, fiches: tasks.length, kind: "repair" as const, inputTokens: lotUsage.inputTokens, outputTokens: lotUsage.outputTokens, finishedAt: new Date().toISOString() },
      ],
    }),
  });
}

// -- Refaire un rattrapage ---------------------------------------------------

/** Failed repairs that can be done again: not a fiche edited by hand meanwhile, and in a chapter not yet published. */
export async function redoableRepairs(supabase: Admin, job: Job): Promise<Task[]> {
  const failed = (await stageTasks(supabase, job.id, "repair")).filter((t) => t.status === "failed" && !(t.error ?? "").includes("modifiée"));
  if (!failed.length) return [];
  const chapterIds = [...new Set(failed.map((t) => (t.input as unknown as RepairInput).chapterId))];
  const draft = new Set<string>();
  for (const part of chunk(chapterIds, 150)) {
    const { data } = await supabase.from("el_profesor_chapters").select("id").in("id", part).eq("status", "draft_ready");
    (data ?? []).forEach((c) => draft.add(c.id));
  }
  return failed.filter((t) => draft.has((t.input as unknown as RepairInput).chapterId));
}

/**
 * A repair the AI couldn't do (credit exhausted…) left the missing source
 * blocks and cards copied as they are, « à vérifier ». Once the AI is
 * available again: those copies are taken out — only exact copies of the
 * missing items, still marked « à vérifier », never what the AI wrote — and
 * the repair runs again as a small lot of its own.
 */
export async function redoFailedRepairs(supabase: Admin, job: Job): Promise<{ fiches: number; blocksRemoved: number; cardsRemoved: number }> {
  const tasks = await redoableRepairs(supabase, job);
  if (!tasks.length) throw new GeminiError("Aucun rattrapage à refaire.");
  const round = (job.round ?? 0) + 1;
  const { data: moved } = await supabase
    .from("el_profesor_merge_jobs")
    .update({ stage: "repair", round, error: null, finished_at: null, locked_until: new Date(Date.now() + 4 * 60_000).toISOString() })
    .eq("id", job.id)
    .in("stage", ["ready", "done"])
    .select("id")
    .maybeSingle();
  if (!moved) throw new GeminiError("Un lot est déjà en cours pour cette fusion.");

  // Queued first (starting in two minutes, once the copies are out): whatever happens next, the repair runs
  // again and puts back what's still missing — nothing can end up removed and not repaired.
  const startAt = new Date(Date.now() + 2 * 60_000).toISOString();
  for (const part of chunk(tasks, 200)) {
    const { error } = await supabase.from("el_profesor_merge_tasks").upsert(
      part.map((t) => ({
        id: t.id,
        job_id: job.id,
        stage: "repair" as const,
        ref_key: t.ref_key,
        input: t.input,
        output: null,
        status: "waiting" as const,
        round,
        attempts: 0,
        error: null,
        claude_batch_id: null,
        next_attempt_at: startAt,
      })),
      { onConflict: "id" }
    );
    if (error) {
      await supabase.from("el_profesor_merge_jobs").update({ stage: job.stage, round: job.round ?? 0, locked_until: null }).eq("id", job.id);
      throw new GeminiError(`Relance du rattrapage impossible : ${error.message}`);
    }
  }

  let blocksRemoved = 0;
  let cardsRemoved = 0;
  try {
    const inputs = tasks.map((t) => t.input as unknown as RepairInput);
    const content = await loadSourceContent(supabase, [...new Set(inputs.flatMap((i) => i.sources.map((s) => s.ficheId)))], job.include_drafts);
    const sourceBlocks = new Map([...content.blocksByFiche.values()].flat().map((b) => [b.id, b]));
    const sourceCards = new Map([...content.cardsByFiche.values()].flat().map((c) => [c.id, c]));
    for (const input of inputs) {
      const missingBlocks = new Set(input.blockIds);
      const blocks = await loadFicheBlocks(supabase, input.ficheId);
      const copies = blocks.filter((b) => {
        if (!b.needs_review) return false;
        // A copy cites its one source block, possibly on several pages (the same id repeated).
        const cited = [...new Set(((b.citations as unknown as { sourceBlockId?: string }[]) ?? []).map((c) => c.sourceBlockId).filter((id): id is string => Boolean(id)))];
        const source = cited.length === 1 && missingBlocks.has(cited[0]) ? sourceBlocks.get(cited[0]) : undefined;
        return Boolean(source) && JSON.stringify(b.content) === JSON.stringify(source!.content);
      });
      if (copies.length) {
        const gone = new Set(copies.map((b) => b.id));
        await supabase.from("el_profesor_fiche_blocks").delete().in("id", [...gone]);
        await rewriteFicheBlocks(supabase, input.ficheId, blocks.filter((b) => !gone.has(b.id)).map((b) => ({ id: b.id })));
        blocksRemoved += gone.size;
      }
      const missingCards = new Set(input.cardIds);
      const { data: cards } = await supabase.from("el_profesor_flashcards").select("id, front, back, needs_review, source_flashcard_ids, status").eq("fiche_id", input.ficheId);
      const cardCopies = (cards ?? []).filter((c) => {
        const ids = c.source_flashcard_ids ?? [];
        const source = c.needs_review && c.status === "draft" && ids.length === 1 && missingCards.has(ids[0]) ? sourceCards.get(ids[0]) : undefined;
        return Boolean(source) && (c.front as { text?: string } | null)?.text === source!.front && (c.back as { text?: string } | null)?.text === source!.back;
      });
      if (cardCopies.length) {
        await supabase.from("el_profesor_flashcards").delete().in("id", cardCopies.map((c) => c.id));
        cardsRemoved += cardCopies.length;
      }
    }
    return { fiches: tasks.length, blocksRemoved, cardsRemoved };
  } finally {
    await supabase.from("el_profesor_merge_jobs").update({ locked_until: null }).eq("id", job.id);
  }
}

/** Tokens spent by the whole fusion, or by one lot (round 0 = the table of contents). */
export async function jobUsage(supabase: Admin, jobId: string, round?: number): Promise<{ inputTokens: number; outputTokens: number; tasksTotal: number; tasksDone: number }> {
  let inputTokens = 0;
  let outputTokens = 0;
  let tasksTotal = 0;
  let tasksDone = 0;
  for (let from = 0; ; from += 1000) {
    let query = supabase.from("el_profesor_merge_tasks").select("input_tokens, output_tokens, status").eq("job_id", jobId);
    if (round !== undefined) query = query.eq("round", round);
    const { data } = await query.order("id").range(from, from + 999);
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

/** Rough seconds a Gemini call of this task takes: a call must end within the run that starts it. */
export function estimatedSeconds(task: Task): number {
  const input = task.input as { chars?: number; fiches?: unknown[]; blockIds?: unknown[] } | null;
  switch (task.stage) {
    case "plan":
      return 170;
    case "assign":
      return 70;
    case "chapter":
      return 40 + (input?.fiches?.length ?? 0) * 0.6;
    case "fiche":
      // Written about as long as read (≈ 3,2 characters per token), ≈ 110 tokens a second, thinking included.
      return 25 + ((input?.chars ?? 20_000) / 3.2) * 0.9 / 110;
    case "repair":
      return 40 + (input?.blockIds?.length ?? 0) * 4;
  }
}

export const STAGE_HANDLERS: Record<ElProfesorMergeTaskStage, StageHandler> = {
  plan: planHandler,
  assign: assignHandler,
  chapter: outlineHandler,
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
