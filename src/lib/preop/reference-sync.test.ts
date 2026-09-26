import { describe, expect, it } from "vitest";
import { canonical, keepMarker, protocolSignature, protocolUpdates, ruleUpdates, signedReference, sourceWithoutMarker } from "./reference-sync";
import { REFERENCE_PROTOCOLS } from "./reference-protocols";
import type { Protocol } from "./protocols";
import { PROPOSED_GROUPS } from "./rules/proposed";
import { activateUnchecked, isUnchecked } from "./rules/activation";
import { ruleSchema } from "./rules/schema";
import type { Rule } from "./rules/types";

const ref = REFERENCE_PROTOCOLS[0];
const stored = (p: Omit<Protocol, "created_at" | "updated_at">, editedLater = false): Protocol => ({
  ...structuredClone(p),
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: editedLater ? "2026-09-10T10:00:00.000Z" : "2026-09-01T10:00:00.000Z",
});
const olderVersion = { ...ref, content: { ...ref.content, notes: "ancienne version" } };

describe("reference protocols follow their new version", () => {
  it("the signature ignores the key order (jsonb)", () => {
    expect(canonical({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe(canonical({ a: [1, { d: 2 }], b: 1 }));
  });
  it("an up-to-date copy needs nothing", () => {
    expect(protocolUpdates([stored(signedReference(ref))], [ref])).toEqual([]);
  });
  it("a copy you did not change is updated by itself", () => {
    const u = protocolUpdates([stored(signedReference(olderVersion))], [ref]);
    expect(u).toHaveLength(1);
    expect(u[0].modified).toBe(false);
  });
  it("a copy you changed is only proposed", () => {
    const mine = signedReference(olderVersion);
    const edited = { ...mine, content: { ...mine.content, notes: "mon service" } };
    expect(protocolUpdates([stored(edited, true)], [ref])[0].modified).toBe(true);
  });
  it("copies imported before the signature: never edited → updated, edited → proposed", () => {
    expect(protocolUpdates([stored(olderVersion)], [ref])[0].modified).toBe(false);
    expect(protocolUpdates([stored(olderVersion, true)], [ref])[0].modified).toBe(true);
    // Same content, only the signature to add.
    expect(protocolUpdates([stored(ref, true)], [ref])[0].modified).toBe(false);
  });
  it("the signature is hidden in the editor and kept on save", () => {
    const signed = signedReference(ref);
    expect(sourceWithoutMarker(signed.source)).toBe(ref.source);
    expect(keepMarker(signed.source, "Mon protocole")).toMatch(/^Mon protocole \[PreOx réf\. [a-z0-9]+\]$/);
    expect(protocolSignature(signed)).toBe(protocolSignature(ref));
  });
});

describe("proposed rules follow their new version", () => {
  const group = PROPOSED_GROUPS.find((g) => g.id === "treatments-spaqi")!;
  const r = group.rules[0];
  const asStored = (x: Omit<Rule, "created_at" | "updated_at">): Rule => ({ ...x, created_at: "", updated_at: "" });
  const NOW = "2026-09-27T10:00:00.000Z";
  it("an unchecked rule you did not touch is updated and stays active « à relire »", () => {
    const old = activateUnchecked({ ...r, statement: "ancienne phrase" }, "2026-09-20T10:00:00.000Z");
    const u = ruleUpdates([asStored(old)], NOW).find((x) => x.current.id === r.id)!;
    expect(u.modified).toBe(false);
    expect(u.next.statement).toBe(r.statement);
    expect(isUnchecked(u.next)).toBe(true);
    expect(ruleSchema.safeParse(u.next).success).toBe(true);
  });
  it("a rule you checked or edited is left alone", () => {
    const mine = { ...r, statement: "ma version", status: "active" as const, version: 2, verified_at: NOW, tool: "Moi" };
    expect(ruleUpdates([asStored(mine)], NOW).find((x) => x.current.id === r.id)!.modified).toBe(true);
  });
});

describe("what the server keeps", () => {
  it("each signed reference passes the server schema unchanged (otherwise it would look modified at every visit)", async () => {
    const { protocolSchema } = await import("./protocol-schema");
    for (const r of REFERENCE_PROTOCOLS) {
      const parsed = protocolSchema.parse(JSON.parse(JSON.stringify(signedReference(r))));
      expect(protocolSignature({ ...parsed, operation_category: parsed.operation_category } as never), r.name).toBe(protocolSignature(r));
    }
  });
});

describe("rules the server keeps", () => {
  it("a proposed rule saved as it is counts as up to date (no update at every visit)", () => {
    const NOW = "2026-09-27T10:00:00.000Z";
    const stored = PROPOSED_GROUPS.flatMap((g) => g.rules).map((r) => ({ ...(ruleSchema.parse(JSON.parse(JSON.stringify(r))) as typeof r), created_at: "", updated_at: "" }));
    expect(ruleUpdates(stored, NOW).map((u) => u.reference.title)).toEqual([]);
  });
});
