// What the « Tâches IA » panel shows (ai-activity.ts on the server,
// ai-tasks-panel.tsx in the browser): chapters being processed, waiting in
// the Gemini queue, or in error and to be relaunched, plus the Claude
// batches not yet retrieved.

export type AiTaskKind = "extraction" | "complementary" | "split";

export interface AiTaskItem {
  chapterId: string;
  chapterTitle: string;
  bookTitle: string;
  kind: AiTaskKind;
  /** gemini: Gemini queue row; claude: chapter being extracted outside the queue (Claude, direct or batch). */
  provider: "gemini" | "claude";
  /** Progress of a complement sweep, e.g. « passe 2/8 ». */
  progress: string | null;
  attempts: number;
  /** Next automatic attempt (waiting items). */
  nextAttemptAt: string | null;
  /** When the processing started (running items). */
  startedAt: string | null;
  error: string | null;
  /** A failed Gemini queue row (can be taken out of the list); false for a chapter in error outside the queue. */
  inQueue: boolean;
}

export interface AiBatchItem {
  id: string;
  kind: string;
  requestCount: number;
  createdAt: string;
}

export interface AiActivity {
  running: AiTaskItem[];
  waiting: AiTaskItem[];
  failed: AiTaskItem[];
  claudeBatches: AiBatchItem[];
  checkedAt: string;
}
