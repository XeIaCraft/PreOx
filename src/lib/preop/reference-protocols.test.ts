import { describe, expect, it } from "vitest";
import { drugReferenceFor } from "./drug-reference";
import { protocolSchema } from "./protocol-schema";
import { REFERENCE_PROTOCOLS } from "./reference-protocols";

describe("reference protocols", () => {
  it("are accepted by the server, with a stable unique id and their sources", () => {
    const ids = new Set<string>();
    for (const p of REFERENCE_PROTOCOLS) {
      const parsed = protocolSchema.safeParse(p);
      expect(parsed.success, `${p.name}: ${parsed.success ? "" : parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ")}`).toBe(true);
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(p.source.length, p.name).toBeGreaterThan(20);
      expect(p.content.drugs.length, p.name).toBeGreaterThan(0);
      expect(new Set(p.content.drugs.map((d) => d.id)).size).toBe(p.content.drugs.length);
    }
    expect(REFERENCE_PROTOCOLS.length).toBeGreaterThanOrEqual(12);
  });

  it("per-kilo doses sit inside the reference ranges of the textbook when it gives one", () => {
    const outside: string[] = [];
    for (const p of REFERENCE_PROTOCOLS)
      for (const d of p.content.drugs) {
        if (d.doseMode !== "per_kg" || d.amount === null) continue;
        const ref = drugReferenceFor(d.name);
        const ranges = ref?.doses.filter((r) => r.mode === "per_kg" && r.unit === d.unit && !/^Dose maximale/.test(r.label)) ?? [];
        if (ranges.length && !ranges.some((r) => d.amount! >= r.min && d.amount! <= r.max)) outside.push(`${p.name} — ${d.name} ${d.amount} ${d.unit}/kg`);
      }
    expect(outside).toEqual([]);
  });

  it("every protocol with a surgical incision plans an antibiotic, or says why not", () => {
    for (const p of REFERENCE_PROTOCOLS) {
      const abx = p.content.drugs.some((d) => d.phase === "antibio");
      const explained = /antibioprophylaxie/i.test(`${p.content.notes} ${p.content.postop.join(" ")}`);
      expect(abx || explained, p.name).toBe(true);
    }
  });
});

describe("reference protocols and the intervention catalogue", () => {
  it("each common intervention finds its protocol by name", async () => {
    const { matchProtocol } = await import("./protocols");
    const { SURGERY_CATALOG } = await import("./surgeries");
    const protocols = REFERENCE_PROTOCOLS.map((p) => ({ ...p, created_at: "", updated_at: "" }));
    const expected: Record<string, number> = {
      "Prothèse totale de hanche": 1,
      "Prothèse totale de genou": 2,
      "Fracture du col du fémur": 3,
      "Arthroscopie de l'épaule": 4,
      Césarienne: 5,
      "Cholécystectomie cœlioscopique": 6,
      Colectomie: 7,
      "Cure de hernie inguinale": 8,
      Amygdalectomie: 9,
      Thyroïdectomie: 10,
      "Résection transurétrale de prostate": 11,
      Hystérectomie: 12,
      Cataracte: 13,
      "Chirurgie bariatrique": 14,
    };
    for (const [name, n] of Object.entries(expected)) {
      const s = SURGERY_CATALOG.find((x) => x.name === name);
      expect(s, name).toBeDefined();
      const match = matchProtocol(protocols, { name: s!.name, category: s!.category }, "");
      expect(match?.id, name).toBe(`5f1c0a10-0004-4000-8000-${String(n).padStart(12, "0")}`);
    }
  });
});

describe("reference protocols pass the server validation (import)", () => {
  it("each one is accepted by protocolSchema", async () => {
    const { protocolSchema } = await import("./protocol-schema");
    const refused = REFERENCE_PROTOCOLS.map((p) => ({ p, r: protocolSchema.safeParse(p) }))
      .filter((x) => !x.r.success)
      .map((x) => `${x.p.name}: ${x.r.error!.issues.map((i) => i.path.join(".")).join(", ")}`);
    expect(refused).toEqual([]);
  });
});
