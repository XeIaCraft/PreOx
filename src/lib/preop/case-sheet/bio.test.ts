import { describe, expect, it } from "vitest";
import { extractBio, formatGroup, resultsByGroup } from "./bio";

const lines = [
  "Biologie du 12/11 : Hb 13,2 g/dL, Ht 40 %, GB 7,1 G/L, Plaq 245 G/L, Créatinine 0,9 mg/dL, DFG 85 mL/min, Na 140 mmol/L, K 4,1 mmol/L",
  "INR 1,0 ; TCA 30 s ; CRP < 5 mg/L ; glycémie 1,02 g/L ; TSH 2,1 mUI/L",
  "ASAT 25 UI/L, ALAT 30 UI/L, Vitamine D : 20 ng/mL, LDH : 180 U/L, Lipase : 40 U/L",
];

describe("the biology of a pasted result", () => {
  const r = extractBio(lines);
  const get = (k: string) => r.find((x) => x.key === k);

  it("reads every known test with its unit", () => {
    expect(get("hb")).toMatchObject({ value: "13,2", unit: "g/dL" });
    expect(get("ht")).toMatchObject({ value: "40", unit: "%" });
    expect(get("gb")).toMatchObject({ value: "7,1", unit: "G/L" });
    expect(get("plt")).toMatchObject({ value: "245" });
    expect(get("creat")).toMatchObject({ value: "0,9", unit: "mg/dL" });
    expect(get("dfg")).toMatchObject({ value: "85", unit: "mL/min" });
    expect(get("k")).toMatchObject({ value: "4,1" });
    expect(get("inr")).toMatchObject({ value: "1,0" });
    expect(get("tca")).toMatchObject({ value: "30", unit: "s" });
    expect(get("crp")).toMatchObject({ value: "<5", unit: "mg/L" });
    expect(get("tsh")).toMatchObject({ value: "2,1" });
    expect(get("asat")).toMatchObject({ value: "25" });
    expect(get("vitd")).toMatchObject({ value: "20" });
  });

  it("keeps a result it does not know by name, when the unit says it is one", () => {
    expect(get("x:lipase")).toMatchObject({ label: "Lipase", value: "40", unit: "U/L", group: "other" });
  });

  it("groups them, in the order of a biology report", () => {
    const g = resultsByGroup(r);
    expect([...g.keys()].slice(0, 4)).toEqual(["fbc", "renal", "haemostasis", "hepatic"]);
    expect(formatGroup(g.get("fbc")!)).toBe("Hb 13,2 g/dL, Ht 40 %, GB 7,1 G/L, Plaq. 245 G/L");
  });

  it("is not fooled by a dose or a vital sign", () => {
    expect(extractBio(["Paracétamol 500 mg 4/j", "Poids : 70 kg", "TA : 120 mmHg", "K+ 3,6"]).map((x) => x.key)).toEqual(["k"]);
  });

  it("keeps the last value of a test given twice", () => {
    expect(extractBio(["Hb 11,0", "Hb 12,5 g/dL"]).find((x) => x.key === "hb")?.value).toBe("12,5");
  });
});
