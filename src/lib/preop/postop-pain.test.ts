import { describe, expect, it } from "vitest";
import { expectedPostopPain } from "./postop-pain";

const p = (name: string) => {
  const x = expectedPostopPain(name);
  return x ? `${x.intensity}${x.long ? ">48" : "<48"}` : null;
};

describe("douleur postopératoire attendue (SFAR)", () => {
  it("classe selon le tableau", () => {
    expect(p("Cholécystectomie cœlioscopique")).toBe("low<48");
    expect(p("Cholécystectomie par laparotomie")).toBe("strong<48");
    expect(p("Césarienne")).toBe("strong<48");
    expect(p("Hystérectomie vaginale")).toBe("moderate<48");
    expect(p("Hystérectomie totale par laparotomie")).toBe("strong<48");
    expect(p("Colectomie gauche")).toBe("strong>48");
    expect(p("Thoracotomie, lobectomie")).toBe("strong>48");
    expect(p("Lobectomie par VATS")).toBe("moderate<48");
    expect(p("Prothèse totale du genou")).toBe("strong>48");
    expect(p("Prothèse totale de hanche")).toBe("moderate>48");
    expect(p("Amygdalectomie")).toBe("strong>48");
    expect(p("Cure de hernie inguinale (Lichtenstein)")).toBe("moderate<48");
    expect(p("Thyroïdectomie totale")).toBe("moderate<48");
    expect(p("Cataracte (phacoémulsification)")).toBe("low<48");
    expect(p("RTUP")).toBe("low<48");
    expect(p("Pontage coronarien")).toBe("moderate>48");
    expect(p("")).toBeNull();
  });
});
