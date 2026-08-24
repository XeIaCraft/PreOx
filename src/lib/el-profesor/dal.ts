import "server-only";

// This file used to hold every El Profesor data-access function directly
// (~2570 lines / ~105 exports by the time of the "découper dal.ts" audit
// item). It's now a thin barrel re-exporting the split-out submodules under
// ./dal/ — every call site imports from "@/lib/el-profesor/dal" exactly as
// before, so no import path elsewhere in the app needed to change.
//
// Module boundaries:
// - dal/shared.ts: access guards, row-mapper helpers, and the cached
//   getChapterContent — shared by every other submodule below. Only its own
//   genuinely public members are re-exported here; the row mappers and
//   other internal helpers stay importable submodule-to-submodule without
//   ever becoming part of this file's public surface (they weren't part of
//   it before the split either).
// - dal/library.ts: books/chapters, bookmarks, reading position, table of
//   contents, fiche questions.
// - dal/review.ts: FSRS/review-queue logic (due queues, suspensions,
//   mastery/difficulty stats, forecasts, block spaced-repetition).
// - dal/notions.ts: notion CRUD, glossary, contradictions, case journal,
//   dose calculators, notion-update proposals.
// - dal/ai-config.ts: Gemini/Claude provider config + usage stats.
// - dal/admin-quality.ts: admin content-quality dashboards.
export { requireElProfesorAccess, requireElProfesorAdmin, getChapterContent } from "./dal/shared";
export type { SubEntityWithFiche } from "./dal/shared";
export * from "./dal/library";
export * from "./dal/review";
export * from "./dal/notions";
export * from "./dal/ai-config";
export * from "./dal/admin-quality";
