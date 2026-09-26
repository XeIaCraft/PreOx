import { describe, expect, it } from "vitest";
import { postopLines, postopHasOpioids } from "./postop";
import { crises, searchCrises } from "./crises";
import { RISK_LIBRARY, suggestedRisks } from "./plan-catalog";
import { protocolContentSchema } from "./protocol-schema";
import { emptyProtocolContent } from "./protocols";

describe("post-operative orders", () => {
  const plan = { analgesia: ["paracetamol", "pca_morphine", "pcea"] as const, thrombo: "lmwh" as const, watch: ["pain"] as const };
  it("adult: enoxaparin 40 mg, PCA morphine, PCEA settings and the catheter delay", () => {
    const lines = postopLines({ ...plan, analgesia: [...plan.analgesia], watch: [...plan.watch] }, { weightKg: 80, age: 60, crcl: 90 }).map((l) => l.text);
    expect(lines).toContain("Paracétamol 1 g 4 ×/j IV ou PO");
    expect(lines.some((l) => l.startsWith("PCA morphine : bolus 1–2 mg"))).toBe(true);
    expect(lines.some((l) => l.includes("PCEA : Bupivacaïne 0,1 %"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Énoxaparine 40 mg SC"))).toBe(true);
    expect(lines.some((l) => l.includes("12 h entre une injection d'HBPM et le retrait"))).toBe(true);
    expect(postopHasOpioids({ analgesia: ["pca_morphine"], watch: [] })).toBe(true);
  });
  it("adapts to the renal function and the child", () => {
    const low = postopLines({ analgesia: ["nsaid"], thrombo: "lmwh", watch: [] }, { weightKg: 70, crcl: 25 });
    expect(low[0].warning).toContain("contre-indiqués");
    expect(low[1].text).toContain("35 mg (0,5 mg/kg)");
    const none = postopLines({ analgesia: [], thrombo: "lmwh", watch: [] }, { weightKg: 70, crcl: 10 });
    expect(none[0].text).toContain("HNF 5 000 UI");
    const child = postopLines({ analgesia: ["paracetamol"], watch: [] }, { weightKg: 20, age: 6 });
    expect(child[0].text).toBe("Paracétamol 300 mg (15 mg/kg) 4 ×/j IV ou PO");
  });
});

describe("crisis procedures", () => {
  it("every crisis has recognition, steps and a source; doses computed with the weight", () => {
    const list = crises({ weightKg: 70, age: 40 });
    expect(list.length).toBeGreaterThanOrEqual(15);
    for (const c of list) {
      expect(c.recognise.length).toBeGreaterThan(0);
      expect(c.steps.length).toBeGreaterThan(2);
      expect(c.source).toBeTruthy();
    }
    const last = list.find((c) => c.id === "last")!;
    expect(last.steps.find((s) => s.dose?.drug === "Intralipide 20 %")!.dose!.dose).toBe("70–105 mL");
    const mh = list.find((c) => c.id === "mh")!;
    expect(mh.steps.find((s) => s.dose?.drug === "Dantrolène")!.dose!.dose).toBe("175 mg");
    expect(mh.steps.some((s) => s.text.includes("9 flacons"))).toBe(true);
    expect(searchCrises(list, "bronchospasme")[0].id).toBe("bronchospasm");
    expect(searchCrises(list, "intralipide")[0].id).toBe("last");
  });
  it("without weight, says so rather than inventing a dose; child arrest per kilo", () => {
    const noWeight = crises({});
    expect(noWeight.find((c) => c.id === "laryngospasm")!.steps.find((s) => s.dose?.drug === "Propofol")!.dose!.dose).toBeNull();
    const child = crises({ weightKg: 20, age: 6 }).find((c) => c.id === "arrest")!;
    expect(child.steps.find((s) => s.dose?.drug === "Adrénaline")!.dose!.dose).toBe("0,2 mg");
  });
  it("every risk of the library points to an existing crisis", () => {
    const ids = new Set(crises().map((c) => c.id));
    for (const r of RISK_LIBRARY) if (r.crisis) expect(ids.has(r.crisis)).toBe(true);
    expect(suggestedRisks("rachianesthesie asthme", []).map((r) => r.id)).toEqual(expect.arrayContaining(["spinal_hypotension", "bronchospasm"]));
  });
  it("a protocol with a structured post-op and enriched risks passes the server validation", () => {
    const content = { ...emptyProtocolContent(), risks: [{ ...RISK_LIBRARY[0] }].map(({ title, why, prevention, conduct, source, crisis }) => ({ title, why, prevention, conduct, source, crisis })), postopPlan: { analgesia: ["pca_morphine" as const], thrombo: "lmwh" as const, watch: [] } };
    expect(protocolContentSchema.safeParse(content).success).toBe(true);
  });
});
