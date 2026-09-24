import { describe, expect, it } from "vitest";
import { matchLocalRoute } from "./local-nav-routes";

function params(query: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams(query);
}

describe("matchLocalRoute", () => {
  it("matches the dashboard root", () => {
    expect(matchLocalRoute("/apps/el-profesor", params())).toEqual({ kind: "dashboard" });
    expect(matchLocalRoute("/apps/el-profesor/", params())).toEqual({ kind: "dashboard" });
  });

  it("matches a book table of contents", () => {
    expect(matchLocalRoute("/apps/el-profesor/books/book-1", params())).toEqual({ kind: "book", bookId: "book-1" });
  });

  it("matches a chapter, with an optional entity query param", () => {
    expect(matchLocalRoute("/apps/el-profesor/chapters/chap-1", params())).toEqual({ kind: "chapter", chapterId: "chap-1", entityId: undefined });
    expect(matchLocalRoute("/apps/el-profesor/chapters/chap-1", params({ entity: "sub-1" }))).toEqual({
      kind: "chapter",
      chapterId: "chap-1",
      entityId: "sub-1",
    });
  });

  it("matches a review session and maps mode to a ReviewSource", () => {
    expect(matchLocalRoute("/apps/el-profesor/chapters/chap-1/review", params())).toEqual({
      kind: "review",
      chapterId: "chap-1",
      source: "scheduled",
      limit: undefined,
      all: undefined,
      duration: undefined,
    });
    expect(matchLocalRoute("/apps/el-profesor/chapters/chap-1/review", params({ mode: "free", limit: "10" }))).toEqual({
      kind: "review",
      chapterId: "chap-1",
      source: "free",
      limit: "10",
      all: undefined,
      duration: undefined,
    });
    expect(matchLocalRoute("/apps/el-profesor/chapters/chap-1/review", params({ mode: "exam", duration: "1200" }))).toMatchObject({
      source: "exam",
      duration: "1200",
    });
  });

  it("does not match the admin content-review route (a different screen, out of scope)", () => {
    expect(matchLocalRoute("/apps/el-profesor/chapters/chap-1/admin-review", params())).toBeNull();
  });

  it("does not match unrelated module routes", () => {
    for (const path of ["/apps/el-profesor/guide", "/apps/el-profesor/notions", "/apps/el-profesor/quality", "/apps/el-profesor/journal"]) {
      expect(matchLocalRoute(path, params())).toBeNull();
    }
  });

  it("does not match routes outside the module", () => {
    expect(matchLocalRoute("/apps/a-table", params())).toBeNull();
    expect(matchLocalRoute("/admin/apps", params())).toBeNull();
  });
});
