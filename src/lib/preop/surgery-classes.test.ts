// The classes of the catalogue checked against their references:
// ESC 2022 table of surgical risk (PMID 36017553) for the cardiac risk,
// KCE Report 280 (2016), table 2, for the grade, and RCRI for the flag.
import { describe, expect, it } from "vitest";
import { SURGERY_CATALOG } from "./surgeries";
import { fold } from "./catalog";

const byName = (re: RegExp) => SURGERY_CATALOG.filter((s) => re.test(fold(s.name)));
const wrong = (re: RegExp, ok: (s: (typeof SURGERY_CATALOG)[number]) => boolean) => byName(re).filter((s) => !ok(s)).map((s) => s.name);

describe("classes of the interventions", () => {
  it("ESC 2022: high-risk surgery is high", () => {
    const HIGH = /duodenopancreatectomie|pancreatectomie|hepatectomie|resection hepatique|voies biliaires|bilio-digestive|oesophagectomie|surrenalectomie|(^|\s)cystectomie|pneumonectomie|transplantation (hepatique|pulmonaire)|aortique ouverte|pontage aorto|anevrisme aortique rompu|perfore|perforation|embolectomie|amputation (au-dessus|de membre inferieur)/;
    // ESC 2022 is an adult guideline: children's entries are rated on their own terms.
    expect(wrong(HIGH, (s) => s.cardiacRisk === "high" || s.population !== undefined)).toEqual([]);
  });
  it("ESC 2022: low-risk surgery is low", () => {
    const LOW = /^(cataracte|vitrectomie|chirurgie du sein|tumorectomie mammaire|mastectomie|thyroidectomie|lobo-isthmectomie|parathyroidectomie|extraction des dents|extractions dentaires|soins dentaires|resection transuretrale|arthroscopie|exerese cutanee|greffe de peau|segmentectomie ou wedge par thoracoscopie)/;
    expect(wrong(LOW, (s) => s.cardiacRisk === "low" || s.population !== undefined)).toEqual([]);
  });
  it("ESC 2022: intermediate examples are intermediate", () => {
    const MID = /^(splenectomie|fundoplicature|cholecystectomie coelioscopique|endarteriectomie carotidienne|endoprothese aortique$|angioplastie peripherique|transplantation renale|prothese totale de (hanche|genou)|arthrodese rachidienne|lobectomie pulmonaire)/;
    expect(wrong(MID, (s) => s.cardiacRisk === "intermediate")).toEqual([]);
  });
  it("KCE 280 table 2: grade of the examples", () => {
    const g = (re: RegExp, grade: string) => wrong(re, (s) => s.grade === grade || s.population !== undefined);
    expect(g(/^(exerese cutanee|decompression du nerf ulnaire ou carpien|circoncision|cure d'hydrocele|cataracte$)/, "minor")).toEqual([]);
    expect(g(/^(cure de hernie inguinale$|chirurgie des varices|amygdalectomie$|arthroscopie du genou|conisation|tympanoplastie|chirurgie de la glande sous-maxillaire)/, "intermediate")).toEqual([]);
    expect(g(/^(cesarienne|cholecystectomie|hysterectomie par laparotomie|mastectomie|resection transuretrale de prostate|cure de hernie discale|thyroidectomie|prothese totale|colectomie|curage ganglionnaire cervical|nephrectomie|craniotomie)/, "major")).toEqual([]);
  });
  it("RCRI: intraperitoneal, intrathoracic and suprainguinal vascular surgery is flagged", () => {
    const flagged = (s: (typeof SURGERY_CATALOG)[number]) => s.rcriHighRisk;
    expect(SURGERY_CATALOG.filter((s) => (s.approach === "laparoscopic" || s.approach === "robotic") && /^[AJ]/.test(s.category) && !/pyeloplastie de l'enfant/.test(fold(s.name)) && !s.rcriHighRisk && s.incision !== "peripheral").map((s) => s.name)).toEqual([]);
    expect(wrong(/pontage aorto|aortique ouverte|anevrisme aortique rompu|lobectomie|pneumonectomie|oesophagectomie/, flagged)).toEqual([]);
  });
  it("variants of the same operation agree on the bleeding risk when the resection is the same", () => {
    const fam = (f: string) => new Set(SURGERY_CATALOG.filter((s) => s.family === f && /colectomie|sigmoidectomie|hemicolectomie|resection du rectum/.test(fold(s.name))).map((s) => s.bleedingRisk));
    expect([...fam("colectomie")]).toEqual(["high"]);
  });
});
