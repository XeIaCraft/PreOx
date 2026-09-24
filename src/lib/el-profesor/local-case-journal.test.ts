import { describe, expect, it } from "vitest";
import { addEntryToList, updateEntryInList, removeEntryFromList } from "./local-case-journal";
import type { CaseJournalEntryWithNotion } from "./dal";

function makeEntry(id: string): CaseJournalEntryWithNotion {
  return {
    id,
    notionId: null,
    notionName: null,
    title: `entry-${id}`,
    body: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("addEntryToList", () => {
  it("prepends the new entry (newest first)", () => {
    const entries = [makeEntry("a")];
    const result = addEntryToList(entries, makeEntry("b"));
    expect(result.map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("updateEntryInList", () => {
  it("patches only the matching entry", () => {
    const entries = [makeEntry("a"), makeEntry("b")];
    const result = updateEntryInList(entries, "a", { title: "updated" });
    expect(result.find((e) => e.id === "a")?.title).toBe("updated");
    expect(result.find((e) => e.id === "b")?.title).toBe("entry-b");
  });

  it("is a no-op when the id isn't found", () => {
    const entries = [makeEntry("a")];
    const result = updateEntryInList(entries, "missing", { title: "x" });
    expect(result).toEqual(entries);
  });
});

describe("removeEntryFromList", () => {
  it("removes only the matching entry", () => {
    const entries = [makeEntry("a"), makeEntry("b")];
    const result = removeEntryFromList(entries, "a");
    expect(result.map((e) => e.id)).toEqual(["b"]);
  });
});
