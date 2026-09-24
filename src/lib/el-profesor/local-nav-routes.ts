// Pure route matching for the local navigation shell (piste 2026-09-24 —
// "module 100% local"): decides whether a given URL is one of the screens
// local-nav-shell.tsx knows how to render straight from IndexedDB, without
// ever importing Next.js's router types (kept framework-agnostic and
// trivially unit-testable). Anything that doesn't match falls through to a
// normal Next.js navigation, unchanged from today's behavior.
import type { ReviewSource } from "./types";

export type LocalView =
  | { kind: "dashboard" }
  | { kind: "book"; bookId: string }
  | { kind: "chapter"; chapterId: string; entityId?: string }
  | { kind: "review"; chapterId: string; source: ReviewSource; limit?: string; all?: string; duration?: string };

const BASE = "/apps/el-profesor";

function toReviewSource(mode: string | null): ReviewSource {
  return mode === "exam" ? "exam" : mode === "free" ? "free" : "scheduled";
}

/** `pathname` must already be the plain URL path (no origin, no query string) — pass `new URL(href, location.origin)`'s `.pathname`/`.searchParams` from the caller. */
export function matchLocalRoute(pathname: string, searchParams: URLSearchParams): LocalView | null {
  if (pathname === BASE || pathname === `${BASE}/`) return { kind: "dashboard" };

  if (!pathname.startsWith(`${BASE}/`)) return null;
  const rest = pathname.slice(BASE.length + 1).split("/").filter(Boolean);

  if (rest.length === 2 && rest[0] === "books") {
    return { kind: "book", bookId: rest[1] };
  }

  if (rest.length === 2 && rest[0] === "chapters") {
    const entityId = searchParams.get("entity");
    return { kind: "chapter", chapterId: rest[1], entityId: entityId ?? undefined };
  }

  if (rest.length === 3 && rest[0] === "chapters" && rest[2] === "review") {
    return {
      kind: "review",
      chapterId: rest[1],
      source: toReviewSource(searchParams.get("mode")),
      limit: searchParams.get("limit") ?? undefined,
      all: searchParams.get("all") ?? undefined,
      duration: searchParams.get("duration") ?? undefined,
    };
  }

  // Everything else — /guide, /journal, /suspended, /notions*, /quality,
  // /archived, /emergency, /chapters/:id/admin-review, settings dialogs,
  // etc. — is deliberately not covered yet (see the plan's staged rollout).
  return null;
}

/** Stable React key for a given view — distinct views must remount their component (FlashcardReviewer especially freezes its card list on mount). */
export function localViewKey(view: LocalView): string {
  switch (view.kind) {
    case "dashboard":
      return "dashboard";
    case "book":
      return `book:${view.bookId}`;
    case "chapter":
      return `chapter:${view.chapterId}:${view.entityId ?? ""}`;
    case "review":
      return `review:${view.chapterId}:${view.source}:${view.limit ?? ""}:${view.all ?? ""}:${view.duration ?? ""}`;
  }
}
