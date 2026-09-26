import { describe, expect, it } from "vitest";
import { applyServicePrefs, DEFAULT_SERVICE_PREFS, servicePrefsSchema } from "./service-prefs";
import { REFERENCE_PROTOCOLS } from "./reference-protocols";

const adultVolatile = REFERENCE_PROTOCOLS.find((p) => p.content.gases && p.content.gases.agent === "sevoflurane" && p.content.drugs.some((d) => d.name === "Ondansétron") && p.content.drugs.some((d) => d.name === "Dexaméthasone"))!;
const tiva = REFERENCE_PROTOCOLS.find((p) => p.content.gases?.agent === "tiva")!;

describe("service habits applied to a protocol", () => {
  it("the defaults change nothing", () => {
    const r = applyServicePrefs(adultVolatile.content, DEFAULT_SERVICE_PREFS, 50);
    expect(r.changed).toEqual([]);
    expect(r.plan).toEqual(adultVolatile.content);
  });

  it("agent, FiO₂, flow, setron and dexamethasone for an adult; the protocol itself untouched", () => {
    const before = structuredClone(adultVolatile.content);
    const prefs = { agent: "isoflurane" as const, fio2: [0.3, 0.4] as [number, number], freshGasLMin: 0.5, setron: "granisetron" as const, dexamethasoneMg: 4 as const };
    const r = applyServicePrefs(adultVolatile.content, prefs, 50);
    expect(r.plan.gases).toMatchObject({ agent: "isoflurane", fio2: [0.3, 0.4], freshGasLMin: 0.5 });
    expect(r.plan.drugs.find((d) => d.name === "Granisétron")).toMatchObject({ amount: 1, unit: "mg", doseMode: "fixed" });
    expect(r.plan.drugs.some((d) => d.name === "Ondansétron")).toBe(false);
    const dexa = r.plan.drugs.find((d) => d.name === "Dexaméthasone");
    if (dexa?.doseMode === "fixed") expect(dexa.amount).toBe(4);
    expect(r.changed).toEqual(expect.arrayContaining(["halogéné", "FiO₂", "débit de gaz frais", "granisétron"]));
    expect(adultVolatile.content).toEqual(before);
    expect(servicePrefsSchema.safeParse(prefs).success).toBe(true);
  });

  it("TIVA stays TIVA; a child keeps the paediatric plan", () => {
    const prefs = { ...DEFAULT_SERVICE_PREFS, agent: "desflurane" as const, setron: "granisetron" as const };
    expect(applyServicePrefs(tiva.content, prefs, 50).plan.gases?.agent).toBe("tiva");
    const child = applyServicePrefs(adultVolatile.content, prefs, 6);
    expect(child.plan.gases?.agent).toBe("sevoflurane");
    expect(child.plan.drugs.some((d) => d.name === "Granisétron")).toBe(false);
    expect(child.changed).toEqual([]);
  });
});
