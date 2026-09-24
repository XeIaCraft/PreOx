import { describe, expect, it } from "vitest";
import { swapBookOrder, swapChapterOrder, publishChaptersInBooks } from "./local-admin-actions";
import type { DashboardSnapshot } from "./dashboard-types";

type Books = DashboardSnapshot["books"];
type ChapterStatus = Books[number]["chapters"][number]["status"];

function makeBook(id: string, chapterIds: string[] = [], chapterStatus: ChapterStatus = "published"): Books[number] {
  return {
    id,
    title: `book-${id}`,
    author: null,
    edition: null,
    coverUrl: null,
    theme: null,
    orderIndex: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    previousEditionBookId: null,
    chapters: chapterIds.map((cid) => ({
      id: cid,
      bookId: id,
      title: `chapter-${cid}`,
      orderIndex: 0,
      pdfStoragePath: null,
      pdfPageCount: null,
      status: chapterStatus,
      extractionError: null,
      estimatedRemainingPasses: null,
      sourceKind: "pdf" as const,
      sourceText: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    })),
  };
}

describe("swapBookOrder", () => {
  it("swaps a book with the previous one when moving up", () => {
    const books = [makeBook("a"), makeBook("b"), makeBook("c")];
    const result = swapBookOrder(books, "b", "up");
    expect(result.map((b) => b.id)).toEqual(["b", "a", "c"]);
  });

  it("swaps a book with the next one when moving down", () => {
    const books = [makeBook("a"), makeBook("b"), makeBook("c")];
    const result = swapBookOrder(books, "b", "down");
    expect(result.map((b) => b.id)).toEqual(["a", "c", "b"]);
  });

  it("is a no-op at either boundary", () => {
    const books = [makeBook("a"), makeBook("b")];
    expect(swapBookOrder(books, "a", "up").map((b) => b.id)).toEqual(["a", "b"]);
    expect(swapBookOrder(books, "b", "down").map((b) => b.id)).toEqual(["a", "b"]);
  });
});

describe("swapChapterOrder", () => {
  it("swaps a chapter within its own book, leaving other books untouched", () => {
    const books = [makeBook("book-1", ["c1", "c2", "c3"]), makeBook("book-2", ["d1"])];
    const result = swapChapterOrder(books, "c2", "up");
    expect(result[0].chapters.map((c) => c.id)).toEqual(["c2", "c1", "c3"]);
    expect(result[1].chapters.map((c) => c.id)).toEqual(["d1"]);
  });

  it("is a no-op at either boundary", () => {
    const books = [makeBook("book-1", ["c1", "c2"])];
    expect(swapChapterOrder(books, "c1", "up")[0].chapters.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(swapChapterOrder(books, "c2", "down")[0].chapters.map((c) => c.id)).toEqual(["c1", "c2"]);
  });
});

describe("publishChaptersInBooks", () => {
  it("publishes only the requested chapters that are actually draft_ready", () => {
    const books = [makeBook("book-1", ["c1", "c2"], "draft_ready")];
    const result = publishChaptersInBooks(books, ["c1"]);
    expect(result[0].chapters.find((c) => c.id === "c1")?.status).toBe("published");
    expect(result[0].chapters.find((c) => c.id === "c2")?.status).toBe("draft_ready");
  });

  it("leaves chapters untouched when they aren't draft_ready, even if selected", () => {
    const books = [makeBook("book-1", ["c1"], "published")];
    const result = publishChaptersInBooks(books, ["c1"]);
    expect(result[0].chapters[0].status).toBe("published");
  });

  it("is a no-op when no chapter ids match", () => {
    const books = [makeBook("book-1", ["c1"], "draft_ready")];
    const result = publishChaptersInBooks(books, ["other-id"]);
    expect(result[0].chapters[0].status).toBe("draft_ready");
  });
});
