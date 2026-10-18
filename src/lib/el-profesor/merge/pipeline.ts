import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { GeminiError } from "@/lib/gemini-shared";
import type { ElProfesorMergeJobRow, ElProfesorMergeTaskRow, ElProfesorMergeTaskStage, Json } from "@/lib/supabase/types";
import { getElProfesorClaudeConfig, getElProfesorGeminiConfig } from "../dal/ai-config";
import { callGeminiTextJson, isQuotaOrCapacityError } from "../gemini";
import { claudeTextContent, getClaudeBatchResults, retrieveClaudeBatch, submitClaudeToolBatch } from "../anthropic";
import { quotaBackoffMinutes } from "../gemini-queue";
import { toGeminiSchema } from "./schemas";
import { FINALIZERS, STAGE_HANDLERS, createPlanTask, jobUsage, type StageContext } from "./stages";
import type { MergeStats } from "./types";

// Drives every fusion in progress: pg_cron calls the route every minute
// while a job is active (migration 098), and launching a fusion kicks it
// once right away. Each run works within a time budget — Gemini calls run a
// few at a time and a new one only starts while there's room for it to
// finish; Claude tasks go out as Message Batches (half price) and are
// picked up on a later run once Anthropic has answered. When every task of
// a stage is settled, the stage is finalized and the next one starts.

type Job = ElProfesorMergeJobRow;
type Task = ElProfesorMergeTaskRow;
type ActiveStage = "plan" | "assign" | "chapters" | "fiches" | "repair";

const ACTIVE_STAGES: ActiveStage[] = ["plan", "assign", "chapters", "fiches", "repair"];
const TASK_STAGE: Record<ActiveStage, ElProfesorMergeTaskStage> = { plan: "plan", assign: "assign", chapters: "chapter", fiches: "fiche", repair: "repair" };

/** A running task older than this was killed with its function: back to waiting. */
const STUCK_RUNNING_MS = 12 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const MAX_QUOTA_ATTEMPTS = 20;
/** Gemini calls in flight at once within one run (several runs can overlap). */
const GEMINI_CONCURRENCY = 6;
/** Requests per Claude batch: keeps each submission's body a reasonable size. */
const CLAUDE_BATCH_SIZE = 300;

export interface MergeRunSummary {
  jobs: number;
  tasksDone: number;
  tasksFailed: number;
  submitted: number;
  pausedUntil?: string;
}

export async function processMergeJobs({ budgetMs = 240_000, startBeforeMs = 150_000 } = {}): Promise<MergeRunSummary> {
  const supabase = createAdminClient();
  const started = Date.now();
  const summary: MergeRunSummary = { jobs: 0, tasksDone: 0, tasksFailed: 0, submitted: 0 };

  await supabase
    .from("el_profesor_merge_tasks")
    .update({ status: "waiting", started_at: null })
    .eq("status", "running")
    .lt("started_at", new Date(Date.now() - STUCK_RUNNING_MS).toISOString());

  const { data: jobs } = await supabase.from("el_profesor_merge_jobs").select("*").in("stage", ACTIVE_STAGES).order("created_at");
  for (const job of (jobs ?? []) as Job[]) {
    if (Date.now() - started > budgetMs - 20_000) break;
    summary.jobs++;
    try {
      await advanceJob(job, { started, budgetMs, startBeforeMs }, summary);
    } catch (err) {
      // A stage that can't even be prepared (keys missing, books deleted…): the job stops with the reason.
      const message = err instanceof Error ? err.message : String(err);
      await supabase.from("el_profesor_merge_jobs").update({ error: message }).eq("id", job.id);
    }
  }
  return summary;
}

interface Clock {
  started: number;
  budgetMs: number;
  startBeforeMs: number;
}

async function advanceJob(initial: Job, clock: Clock, summary: MergeRunSummary): Promise<void> {
  const supabase = createAdminClient();
  const { data: book } = await supabase.from("el_profesor_books").select("title").eq("id", initial.book_id).maybeSingle();
  if (!book) {
    await supabase.from("el_profesor_merge_jobs").update({ stage: "canceled", error: "Livre fusionné supprimé." }).eq("id", initial.id);
    return;
  }

  // Several stages can follow each other in one run when they're quick (a finalize, an empty repair stage…).
  for (let step = 0; step < 6; step++) {
    const { data: fresh } = await supabase.from("el_profesor_merge_jobs").select("*").eq("id", initial.id).maybeSingle();
    const job = fresh as Job | null;
    if (!job || !ACTIVE_STAGES.includes(job.stage as ActiveStage)) return;
    const stage = job.stage as ActiveStage;
    const ctx: StageContext = { supabase, job, bookTitle: book.title };
    if (stage === "plan") await createPlanTask(supabase, job);

    if (job.provider === "claude") await runClaude(ctx, TASK_STAGE[stage], clock, summary);
    else await runGemini(ctx, TASK_STAGE[stage], clock, summary);

    // Tokens spent so far, for the cost shown while the fusion runs.
    job.stats = { ...((job.stats as MergeStats | null) ?? {}), ...(await jobUsage(supabase, job.id)) } as Json;
    await supabase.from("el_profesor_merge_jobs").update({ stats: job.stats }).eq("id", job.id);

    const { count } = await supabase
      .from("el_profesor_merge_tasks")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id)
      .eq("stage", TASK_STAGE[stage])
      .in("status", ["waiting", "running", "submitted"]);
    if ((count ?? 0) > 0) return;
    if (Date.now() - clock.started > clock.budgetMs - 30_000) return;
    await FINALIZERS[stage](ctx);
    await supabase.from("el_profesor_merge_jobs").update({ error: null }).eq("id", job.id).not("error", "is", null).neq("stage", "failed");
  }
}

async function dueTasks(ctx: StageContext, stage: ElProfesorMergeTaskStage, limit: number): Promise<Task[]> {
  const { data } = await ctx.supabase
    .from("el_profesor_merge_tasks")
    .select("*")
    .eq("job_id", ctx.job.id)
    .eq("stage", stage)
    .eq("status", "waiting")
    .lte("next_attempt_at", new Date().toISOString())
    .order("ref_key")
    .limit(limit);
  return (data ?? []) as Task[];
}

/** One due task for this worker: candidates are tried in random order, so parallel workers (and overlapping runs) don't all fight over the first one. */
async function claimOne(ctx: StageContext, stage: ElProfesorMergeTaskStage): Promise<Task | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const candidates = await dueTasks(ctx, stage, GEMINI_CONCURRENCY * 3);
    if (!candidates.length) return null;
    for (const candidate of [...candidates].sort(() => Math.random() - 0.5)) {
      const [task] = await claim(ctx, [candidate]);
      if (task) return task;
    }
  }
  return null;
}

/** Takes the tasks for this run; another overlapping run gets the others. */
async function claim(ctx: StageContext, tasks: Task[]): Promise<Task[]> {
  if (!tasks.length) return [];
  const { data } = await ctx.supabase
    .from("el_profesor_merge_tasks")
    .update({ status: "running", started_at: new Date().toISOString() })
    .in("id", tasks.map((t) => t.id))
    .eq("status", "waiting")
    .select("*");
  return (data ?? []) as Task[];
}

async function settleFailure(ctx: StageContext, task: Task, err: unknown, summary: MergeRunSummary): Promise<"retry" | "failed"> {
  const quota = isQuotaOrCapacityError(err);
  const attempts = task.attempts + 1;
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  const retry = quota ? attempts < MAX_QUOTA_ATTEMPTS : attempts < MAX_ATTEMPTS;
  const minutes = quota ? quotaBackoffMinutes(attempts) : 2 * attempts;
  await ctx.supabase
    .from("el_profesor_merge_tasks")
    .update(
      retry
        ? { status: "waiting", attempts, error: message, started_at: null, claude_batch_id: null, next_attempt_at: new Date(Date.now() + minutes * 60_000).toISOString() }
        : { status: "failed", attempts, error: message, started_at: null }
    )
    .eq("id", task.id);
  if (!retry) summary.tasksFailed++;
  return retry ? "retry" : "failed";
}

async function settleSuccess(ctx: StageContext, task: Task, prepared: Json | undefined, raw: unknown, usage: { inputTokens: number; outputTokens: number }, summary: MergeRunSummary) {
  try {
    const output = await STAGE_HANDLERS[task.stage].apply(ctx, task, prepared, raw);
    await ctx.supabase
      .from("el_profesor_merge_tasks")
      .update({ status: "done", output, error: null, input_tokens: (task.input_tokens ?? 0) + usage.inputTokens, output_tokens: (task.output_tokens ?? 0) + usage.outputTokens })
      .eq("id", task.id);
    summary.tasksDone++;
  } catch (err) {
    // Tokens were spent all the same: they count in the job's total.
    await ctx.supabase
      .from("el_profesor_merge_tasks")
      .update({ input_tokens: (task.input_tokens ?? 0) + usage.inputTokens, output_tokens: (task.output_tokens ?? 0) + usage.outputTokens })
      .eq("id", task.id);
    await settleFailure(ctx, { ...task, input_tokens: (task.input_tokens ?? 0) + usage.inputTokens, output_tokens: (task.output_tokens ?? 0) + usage.outputTokens }, err, summary);
  }
}

// -- Gemini: synchronous calls, a few at a time -----------------------------

async function runGemini(ctx: StageContext, stage: ElProfesorMergeTaskStage, clock: Clock, summary: MergeRunSummary) {
  const handler = STAGE_HANDLERS[stage];
  const base = await getElProfesorGeminiConfig();
  // The model chosen for this fusion first, the configured ones as fallbacks on quota.
  const config = { apiKeys: base.apiKeys, models: [ctx.job.model, ...base.models.filter((m) => m !== ctx.job.model)] };
  const schema = toGeminiSchema(handler.schema) as Record<string, unknown>;
  let quotaHit = false;

  const worker = async () => {
    while (!quotaHit && Date.now() - clock.started < clock.startBeforeMs) {
      const task = await claimOne(ctx, stage);
      if (!task) return;
      try {
        const prepared = (await handler.prepare(ctx, [task])).get(task.id);
        if (!prepared) throw new GeminiError("Préparation impossible.");
        const { result, inputTokens, outputTokens } = await callGeminiTextJson(config, prepared.prompt, schema);
        await settleSuccess(ctx, task, prepared.prepared, result, { inputTokens, outputTokens }, summary);
      } catch (err) {
        if (isQuotaOrCapacityError(err)) quotaHit = true;
        await settleFailure(ctx, task, err, summary);
      }
    }
  };
  await Promise.all(Array.from({ length: GEMINI_CONCURRENCY }, worker));
  if (quotaHit) summary.pausedUntil = new Date(Date.now() + 15 * 60_000).toISOString();
}

// -- Claude: Message Batches ------------------------------------------------

async function runClaude(ctx: StageContext, stage: ElProfesorMergeTaskStage, clock: Clock, summary: MergeRunSummary) {
  const handler = STAGE_HANDLERS[stage];
  const config = { ...(await getElProfesorClaudeConfig()), model: ctx.job.model };

  // 1. Collect the answers of batches Anthropic has finished.
  const { data: submitted } = await ctx.supabase
    .from("el_profesor_merge_tasks")
    .select("*")
    .eq("job_id", ctx.job.id)
    .eq("stage", stage)
    .eq("status", "submitted");
  const byBatch = new Map<string, Task[]>();
  for (const t of (submitted ?? []) as Task[]) if (t.claude_batch_id) byBatch.set(t.claude_batch_id, [...(byBatch.get(t.claude_batch_id) ?? []), t]);
  for (const [batchId, tasks] of byBatch) {
    if (Date.now() - clock.started > clock.startBeforeMs) return;
    const status = await retrieveClaudeBatch(config.apiKey, batchId).catch(() => null);
    if (!status?.ended) continue;
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const results = await getClaudeBatchResults(config.apiKey, batchId, config.model, undefined, new Set(byId.keys()));
    for (const r of results) {
      const task = byId.get(r.customId);
      if (!task) continue;
      byId.delete(r.customId);
      const prepared = (task.input as { prepared?: Json } | null)?.prepared;
      if (r.outcome === "succeeded") await settleSuccess(ctx, task, prepared, r.output, r.usage, summary);
      else await settleFailure(ctx, task, new GeminiError(r.outcome === "errored" ? r.message : `Requête ${r.outcome === "expired" ? "expirée" : "annulée"} par Anthropic.`), summary);
    }
    // Tasks the batch didn't answer for at all go back in the queue.
    for (const task of byId.values()) await settleFailure(ctx, task, new GeminiError("Absente des résultats du lot."), summary);
  }

  // 2. Send what's waiting, a batch at a time.
  while (Date.now() - clock.started < clock.startBeforeMs) {
    const tasks = await claim(ctx, await dueTasks(ctx, stage, CLAUDE_BATCH_SIZE));
    if (!tasks.length) return;
    try {
      const prepared = await handler.prepare(ctx, tasks);
      const tool = { name: handler.toolName, description: handler.toolDescription, input_schema: handler.schema as { type: "object" } };
      const batchId = await submitClaudeToolBatch(
        config,
        tasks.map((t) => ({ customId: t.id, content: claudeTextContent(prepared.get(t.id)!.prompt), tool }))
      );
      await Promise.all(
        tasks.map((t) =>
          ctx.supabase
            .from("el_profesor_merge_tasks")
            .update({ status: "submitted", claude_batch_id: batchId, input: { ...((t.input as Record<string, Json>) ?? {}), prepared: prepared.get(t.id)!.prepared ?? null } })
            .eq("id", t.id)
        )
      );
      summary.submitted += tasks.length;
    } catch (err) {
      for (const t of tasks) await settleFailure(ctx, t, err, summary);
      return;
    }
  }
}
