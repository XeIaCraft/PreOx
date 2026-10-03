import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getGeminiPassSettings } from "@/lib/el-profesor/dal";
import { complementWindows } from "@/lib/el-profesor/gemini-passes";
import type { ElProfesorChapterRow, ElProfesorGeminiQueueRow } from "@/lib/supabase/types";
import type { AiActivity, AiTaskItem } from "@/lib/el-profesor/ai-activity-types";

// Live state of the AI work, read straight from the database (not the local
// cache, which only moves on « Synchroniser »): the Gemini queue, chapters
// being extracted or waiting outside it (Claude), chapters in error, and the
// Claude batches not yet retrieved. Admin only — the queue and batch tables
// are admin-only under RLS anyway.

type ChapterInfo = Pick<ElProfesorChapterRow, "id" | "book_id" | "title" | "status" | "extraction_error" | "pdf_page_count" | "updated_at">;

export async function loadAiActivity(): Promise<AiActivity> {
  const supabase = await createClient();
  const [{ data: queue }, { data: busyChapters }, { data: batches }, passSettings] = await Promise.all([
    supabase.from("el_profesor_gemini_queue").select("*"),
    supabase.from("el_profesor_chapters").select("id, book_id, title, status, extraction_error, pdf_page_count, updated_at").in("status", ["queued", "extracting", "failed"]),
    supabase.from("el_profesor_batch_jobs").select("id, kind, request_count, created_at").eq("status", "submitted").order("created_at"),
    getGeminiPassSettings(),
  ]);

  const rows: ElProfesorGeminiQueueRow[] = queue ?? [];
  const chapters = new Map<string, ChapterInfo>((busyChapters ?? []).map((c) => [c.id, c]));
  // Queued complements keep the chapter's own status (draft_ready/published): fetch those too.
  const missing = rows.map((r) => r.chapter_id).filter((id) => !chapters.has(id));
  if (missing.length) {
    const { data } = await supabase.from("el_profesor_chapters").select("id, book_id, title, status, extraction_error, pdf_page_count, updated_at").in("id", missing);
    for (const c of data ?? []) chapters.set(c.id, c);
  }
  const bookIds = [...new Set([...chapters.values()].map((c) => c.book_id))];
  const { data: books } = bookIds.length ? await supabase.from("el_profesor_books").select("id, title").in("id", bookIds) : { data: [] };
  const bookTitle = new Map((books ?? []).map((b) => [b.id, b.title]));

  const base = (c: ChapterInfo) => ({ chapterId: c.id, chapterTitle: c.title, bookTitle: bookTitle.get(c.book_id) ?? "" });
  const running: AiTaskItem[] = [];
  const waiting: AiTaskItem[] = [];
  const failed: AiTaskItem[] = [];
  const queued = new Set<string>();

  for (const row of rows) {
    const c = chapters.get(row.chapter_id);
    if (!c) continue;
    queued.add(c.id);
    let progress: string | null = null;
    if (row.mode === "complementary") {
      const total = row.target_passes === 1 ? 1 : Math.max(1, complementWindows(c.pdf_page_count, passSettings).length);
      progress = `passe ${Math.min(row.passes_done + 1, total)}/${total}`;
    }
    const item: AiTaskItem = {
      ...base(c),
      kind: row.mode,
      provider: "gemini",
      progress,
      attempts: row.attempts,
      nextAttemptAt: row.status === "waiting" ? row.next_attempt_at : null,
      startedAt: row.started_at,
      error: row.last_error,
      inQueue: true,
    };
    if (row.status === "running") running.push(item);
    else if (row.status === "waiting") waiting.push(item);
    // A failed extraction/split whose chapter was since extracted another way is no longer an error.
    else if (row.mode === "complementary" || c.status === "failed") failed.push({ ...item, error: row.last_error ?? c.extraction_error });
  }

  for (const c of chapters.values()) {
    if (queued.has(c.id)) continue;
    const item: AiTaskItem = { ...base(c), kind: "extraction", provider: "claude", progress: null, attempts: 0, nextAttemptAt: null, startedAt: null, error: null, inQueue: false };
    if (c.status === "extracting") running.push({ ...item, startedAt: c.updated_at });
    else if (c.status === "queued") waiting.push(item);
    else if (c.status === "failed") failed.push({ ...item, error: c.extraction_error });
  }

  const byTitle = (a: AiTaskItem, b: AiTaskItem) => a.bookTitle.localeCompare(b.bookTitle, "fr") || a.chapterTitle.localeCompare(b.chapterTitle, "fr", { numeric: true });
  waiting.sort((a, b) => (a.nextAttemptAt ?? "").localeCompare(b.nextAttemptAt ?? "") || byTitle(a, b));
  failed.sort(byTitle);
  running.sort(byTitle);

  return {
    running,
    waiting,
    failed,
    claudeBatches: (batches ?? []).map((b) => ({ id: b.id, kind: b.kind, requestCount: b.request_count, createdAt: b.created_at })),
    checkedAt: new Date().toISOString(),
  };
}
