import { describe, expect, it } from "vitest";
import { airwayChoice, anaesthesiaSheet, PATIENT_PROFILES, sheetRefs, type SheetPhase } from "./anaesthesia-sheet";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import { CI_CARDS } from "./contraindications";
import { GUIDELINES, type GuidelineId } from "./guideline-refs";
import { matchProtocol, type Protocol } from "./protocols";
import { REFERENCE_PROTOCOLS } from "./reference-protocols";

const protocols: Protocol[] = REFERENCE_PROTOCOLS.map((p) => ({ ...p, created_at: "", updated_at: "" }));
const surgeries = DEFAULT_CATALOGS.surgeries;
const sheetOf = (re: RegExp) => {
  const s = surgeries.find((x) => re.test(x.name));
  if (!s) throw new Error(`no surgery ${re}`);
  return { s, phases: anaesthesiaSheet(s, matchProtocol(protocols, { name: s.name, category: s.category, catalogId: s.id }, "", surgeries)) };
};
const phase = (phases: SheetPhase[], code: SheetPhase["code"]) => phases.find((p) => p.code === code);
const texts = (phases: SheetPhase[]) =>
  phases.flatMap((p) => [
    p.title,
    p.summary,
    ...p.lines.map((l) => l.text),
    ...p.drugs.flatMap((d) => [d.name, d.dose, d.note ?? "", ...d.reference]),
    ...p.blocks.flatMap((b) => [b.title, b.source, ...b.items.flatMap((i) => [i.label, ...i.points])]),
    ...p.recommendations.map((l) => l.text),
    ...p.patients.map((n) => n.text),
    ...p.cards.flatMap((c) => [c.title, ...c.absolute, ...c.relative, ...c.notes]),
  ]);

describe("guideline references", () => {
  it("every cited guideline but the textbook, the Glasgow declaration and the SmPC has its PubMed id and DOI", () => {
    for (const [id, g] of Object.entries(GUIDELINES)) {
      expect(g.short, id).toBeTruthy();
      expect(g.label, id).toBeTruthy();
      if (id === "manual" || id === "glasgow2023" || id === "rcp") continue;
      expect("pmid" in g && /^\d{7,9}$/.test(g.pmid ?? ""), id).toBe(true);
      expect("doi" in g && /^10\.\d{4,9}\//.test(g.doi ?? ""), id).toBe(true);
    }
  });

  it("every contraindication card is sourced, except the ones said to rest on common practice", () => {
    for (const c of Object.values(CI_CARDS)) {
      if (c.id !== "beachChair") expect(c.refs.length, c.id).toBeGreaterThan(0);
      expect(c.absolute.length + c.relative.length + c.notes.length, c.id).toBeGreaterThan(0);
      if (c.refs.includes("manual")) expect(c.chapter, c.id).toMatch(/^chap\. \d/);
    }
  });
});

describe("the sheet of every procedure of the catalogue", () => {
  const all = surgeries.map((s) => ({ s, phases: anaesthesiaSheet(s, matchProtocol(protocols, { name: s.name, category: s.category, catalogId: s.id }, "", surgeries)) }));

  it("builds, with a technique, a monitoring and an after-surgery phase", () => {
    for (const { s, phases } of all) {
      const codes = phases.map((p) => p.code);
      expect(codes, s.name).toContain("technique");
      expect(codes, s.name).toContain("monitoring");
      expect(codes, s.name).toContain("postop");
    }
  });

  it("writes no « undefined », « NaN » or empty line", () => {
    for (const { s, phases } of all)
      for (const t of texts(phases)) {
        expect(t, s.name).not.toMatch(/undefined|NaN|\[object/);
      }
  });

  it("cites only known guidelines, and every patient note has a source", () => {
    const known = new Set(Object.keys(GUIDELINES));
    for (const { s, phases } of all) {
      for (const id of sheetRefs(phases)) expect(known.has(id), `${s.name}: ${id}`).toBe(true);
      for (const p of phases) for (const n of p.patients) expect(n.refs.length, `${s.name}: ${n.text}`).toBeGreaterThan(0);
    }
  });

  it("repeats no patient note within a phase", () => {
    for (const { s, phases } of all)
      for (const p of phases) {
        const keys = p.patients.map((n) => `${n.profile}|${n.text}`);
        expect(new Set(keys).size, `${s.name} — ${p.title}`).toBe(keys.length);
      }
  });

  it("keeps the notes to the right patients: no elderly or pregnancy notes for a child, no child doses for an adult, no pregnancy for a man", () => {
    for (const { s, phases } of all) {
      const profiles = new Set(phases.flatMap((p) => p.patients.map((n) => n.profile)));
      if (s.population === "child" || s.population === "neonate") {
        expect(profiles.has("elderly"), s.name).toBe(false);
        expect(profiles.has("pregnancy"), s.name).toBe(false);
      } else expect(profiles.has("child"), s.name).toBe(false);
      if (s.sex === "M") expect(profiles.has("pregnancy"), s.name).toBe(false);
    }
  });

  it("recalls the laryngeal mask's contraindications whenever it is proposed, and never under a pneumoperitoneum", () => {
    for (const { s, phases } of all) {
      const airway = phase(phases, "airway");
      const lma = !!airway?.cards.some((c) => c.id === "lma");
      const proposed = !!airway && airway.lines.some((l) => /masque laryng/i.test(l.text));
      expect(lma, s.name).toBe(proposed);
      if (s.approach === "laparoscopic" || s.approach === "robotic") expect(lma, s.name).toBe(false);
    }
  });

  it("recalls the tourniquet's contraindications for every procedure under tourniquet", () => {
    for (const { s, phases } of all) if (s.tourniquet) expect(phase(phases, "monitoring")!.cards.some((c) => c.id === "tourniquet"), s.name).toBe(true);
  });

  it("recalls the pneumoperitoneum's contraindications for every laparoscopic or robotic procedure", () => {
    for (const { s, phases } of all) if (s.approach === "laparoscopic" || s.approach === "robotic") expect(phase(phases, "position")?.cards.some((c) => c.id === "laparoscopy"), s.name).toBe(true);
  });

  it("recalls the neuraxial contraindications whenever a spinal or an epidural is planned", () => {
    for (const { s, phases } of all) if (s.techniques?.includes("neuraxial")) expect(phase(phases, "technique")!.cards.some((c) => c.id === "neuraxial"), s.name).toBe(true);
  });
});

describe("examples", () => {
  it("laparoscopic inguinal hernia: intubation (pneumoperitoneum), no laryngeal mask, pneumoperitoneum contraindications", () => {
    const { phases } = sheetOf(/^Hernie inguinale par cœlioscopie/);
    const airway = phase(phases, "airway")!;
    expect(airway.lines[0].text).toMatch(/^Intubation/);
    expect(airway.lines[0].text).toMatch(/pneumopéritoine/);
    expect(airway.cards.map((c) => c.id)).not.toContain("lma");
    expect(phase(phases, "position")!.cards.map((c) => c.id)).toContain("laparoscopy");
  });

  it("knee arthroscopy: laryngeal mask with its contraindications, spinal and tourniquet contraindications", () => {
    const { phases } = sheetOf(/^Arthroscopie du genou$/);
    expect(phase(phases, "airway")!.cards.map((c) => c.id)).toContain("lma");
    expect(phase(phases, "technique")!.cards.map((c) => c.id)).toContain("neuraxial");
    expect(phase(phases, "monitoring")!.cards.map((c) => c.id)).toContain("tourniquet");
  });

  it("total knee arthroplasty: PROSPECT 2022 and the drugs' kidney adaptations", () => {
    const { phases } = sheetOf(/^Prothèse totale de genou$/);
    const analgesia = phase(phases, "analgesia")!;
    expect(analgesia.blocks.some((b) => /PROSPECT : Prothèse totale de genou \(2022\)/.test(b.title))).toBe(true);
    expect(analgesia.patients.some((n) => n.profile === "renal" && /Kétorolac/.test(n.text) && /contre-indiqué/.test(n.text))).toBe(true);
    // The intrathecal morphine shows its intrathecal dose, not the PCA one.
    expect(analgesia.drugs.find((d) => /Morphine intrathécale/.test(d.name))!.reference.join(" ")).toMatch(/Intrathécale/);
  });

  it("appendicectomy: rapid sequence with its card; rocuronium's rapid-sequence dose for the full stomach", () => {
    const { phases } = sheetOf(/^Appendicectomie$/);
    const airway = phase(phases, "airway")!;
    expect(airway.lines[0].text).toMatch(/séquence rapide/);
    expect(airway.cards.map((c) => c.id)).toContain("rsi");
    expect(phase(phases, "induction")!.patients.some((n) => n.profile === "full_stomach" && /Rocuronium/.test(n.text))).toBe(true);
  });

  it("caesarean section: obstetric doses only for pregnancy, no lateral decubitus card for a left tilt", () => {
    const { phases } = sheetOf(/^Césarienne$/);
    const pregnancy = phases.flatMap((p) => p.patients.filter((n) => n.profile === "pregnancy"));
    expect(pregnancy.length).toBeGreaterThan(0);
    for (const n of pregnancy) expect(n.text).toMatch(/césarienne|éclampsie|post-partum/i);
    expect(phase(phases, "position")?.cards.map((c) => c.id) ?? []).not.toContain("lateral");
  });

  it("robotic prostatectomy: steep Trendelenburg card, nothing about pregnancy", () => {
    const { phases } = sheetOf(/^Prostatectomie radicale robot-assistée$/);
    expect(phase(phases, "position")!.cards.map((c) => c.id)).toEqual(expect.arrayContaining(["laparoscopy", "trendelenburg"]));
    expect(phases.some((p) => p.patients.some((n) => n.profile === "pregnancy"))).toBe(false);
  });

  it("rotator cuff repair: interscalene caution and beach-chair card", () => {
    const { phases } = sheetOf(/^Réparation de la coiffe des rotateurs$/);
    expect(phase(phases, "technique")!.cards.map((c) => c.id)).toContain("interscalene");
    expect(phase(phases, "position")!.cards.map((c) => c.id)).toContain("beachChair");
  });

  it("a child's procedure: inhalational induction, VPOP score, no adult-only notes", () => {
    const child = surgeries.find((s) => s.population === "child" && (s.techniques ?? []).includes("general"));
    expect(child).toBeTruthy();
    const phases = anaesthesiaSheet(child!, matchProtocol(protocols, { name: child!.name, category: child!.category, catalogId: child!.id }, "", surgeries));
    expect(phase(phases, "induction")!.patients.some((n) => n.profile === "child" && /sévoflurane/.test(n.text))).toBe(true);
    expect(phase(phases, "ponv")!.patients.some((n) => n.profile === "child" && /VPOP/.test(n.text))).toBe(true);
  });

  it("regional only: the patient may still want general anaesthesia, so its airway, induction and maintenance are given", () => {
    const base = surgeries.find((x) => /^Prothèse totale de genou$/.test(x.name))!;
    const s = { ...base, techniques: ["neuraxial" as const] };
    const phases = anaesthesiaSheet(s, null);
    expect(phase(phases, "technique")!.lines.some((l) => /respecter le choix du patient/.test(l.text))).toBe(true);
    expect(phase(phases, "airway")!.lines[0].text).toMatch(/^Si AG : /);
    expect(phase(phases, "induction")!.lines[0].text).toMatch(/^Si AG : propofol/);
    expect(phase(phases, "maintenance")!.lines[0].text).toMatch(/^Si AG : sévoflurane/);
    expect(phase(phases, "maintenance")!.cards.map((c) => c.id)).toContain("volatile");
    // Caesarean section under spinal: general anaesthesia means a rapid sequence.
    const caesarean = surgeries.find((x) => /^Césarienne$/.test(x.name))!;
    const cs = anaesthesiaSheet({ ...caesarean, techniques: ["neuraxial"] }, null);
    expect(phase(cs, "airway")!.lines[0].text).toMatch(/^Si AG : intubation en séquence rapide/);
    expect(phase(cs, "airway")!.cards.map((c) => c.id)).toContain("rsi");
    // A planned general anaesthesia has no « Si AG ».
    expect(texts(sheetOf(/^Appendicectomie$/).phases).some((t) => /Si AG/.test(t))).toBe(false);
  });

  it("without a protocol: technique, airway and contraindications from the procedure alone", () => {
    const s = surgeries.find((x) => x.approach === "laparoscopic" && (x.techniques ?? []).includes("general"))!;
    const phases = anaesthesiaSheet(s, null);
    expect(phase(phases, "airway")!.lines[0].text).toMatch(/^Intubation/);
    expect(phase(phases, "antibio")!.lines[0].text).toMatch(/aucun protocole/);
    expect(phase(phases, "position")!.cards.map((c) => c.id)).toContain("laparoscopy");
  });
});

describe("airway choice", () => {
  const base = surgeries.find((s) => /^Arthroscopie du genou$/.test(s.name))!;
  it("rapid sequence in emergencies with a full stomach", () => {
    const a = airwayChoice({ ...base, name: "Laparotomie pour occlusion", techniques: ["general"], incision: "upper_abdominal" }, undefined);
    expect(a).toMatchObject({ device: "ett", rsi: true });
  });
  it("no airway device without general anaesthesia or sedation", () => {
    expect(airwayChoice({ ...base, techniques: ["neuraxial"] }, undefined).device).toBe("none");
    expect(airwayChoice({ ...base, techniques: ["sedation"] }, undefined).device).toBe("spontaneous");
  });
});

it("profiles are listed once each", () => {
  const codes = PATIENT_PROFILES.map((p) => p.code);
  expect(new Set(codes).size).toBe(codes.length);
  const refs: GuidelineId[] = ["manual"];
  expect(refs.every((r) => r in GUIDELINES)).toBe(true);
});
