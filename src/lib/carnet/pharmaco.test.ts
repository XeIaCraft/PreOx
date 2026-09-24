import { describe, expect, it } from "vitest";
import { defaultRoute, drugSuggestions } from "./pharmaco";

describe("drug suggestions", () => {
  it("finds drugs by name or Belgian brand, accent-insensitively, with their usual route", () => {
    expect(drugSuggestions("dipido", [])[0]).toMatchObject({ name: "Piritramide", route: "bolus_iv" });
    expect(drugSuggestions("cefaz", [])[0]).toMatchObject({ name: "Céfazoline", class: "antibiotique" });
    expect(drugSuggestions("remif", [])[0].route).toBe("aivoc");
    expect(defaultRoute("Noradrénaline")).toBe("pse");
    expect(defaultRoute("Produit inconnu")).toBe("bolus_iv");
  });

  it("puts the most used first, remembers the last route and free-typed drugs, and hides what's already added", () => {
    const history = [
      { name: "Propofol", route: "bolus_iv" },
      { name: "Sufentanil", route: "bolus_iv" },
      { name: "Sufentanil", route: "pse" },
      { name: "Mon mélange maison", route: "perfusion" },
    ];
    const top = drugSuggestions("", history);
    expect(top.map((s) => s.name)).toEqual(["Sufentanil", "Propofol", "Mon mélange maison"]);
    expect(top[0].route).toBe("pse");
    expect(drugSuggestions("", history, { exclude: ["propofol"] }).map((s) => s.name)).not.toContain("Propofol");
    expect(drugSuggestions("", [], { klass: "curare" }).map((s) => s.name)).toContain("Rocuronium");
  });
});
