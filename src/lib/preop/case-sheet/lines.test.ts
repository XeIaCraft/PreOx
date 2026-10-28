import { describe, expect, it } from "vitest";
import { addedSection, splitDictation } from "./lines";
import { DEFAULT_CATALOGS } from "../catalog-defaults";

const where = (t: string) => addedSection(t, DEFAULT_CATALOGS);

describe("a line typed on the sheet", () => {
  it("goes where what it says belongs", () => {
    expect(where("Eliquis 5 mg 2x/j").section).toBe("ttt");
    expect(where("Diabète de type 2").section).toBe("atcd");
    expect(where("allergie latex").section).toBe("allergy");
    expect(where("Tabagisme très ancien").section).toBe("habit");
    expect(where("Vit seul, retour accompagné à organiser").section).toBe("note");
  });

  it("follows the section said first", () => {
    expect(where("! Sang compatible à prévoir")).toEqual({ section: "alert", text: "Sang compatible à prévoir" });
    expect(where("alerte : IOT difficile connue")).toEqual({ section: "alert", text: "IOT difficile connue" });
    expect(where("note : famille joignable")).toEqual({ section: "note", text: "famille joignable" });
    expect(where("ttt: Coversyl")).toEqual({ section: "ttt", text: "Coversyl" });
  });

  it("is cut into its sentences when dictated in one go", () => {
    expect(splitDictation("HTA. Sous metformine ; allergie latex\nVit seul.")).toEqual(["HTA", "Sous metformine", "allergie latex", "Vit seul"]);
  });
});
