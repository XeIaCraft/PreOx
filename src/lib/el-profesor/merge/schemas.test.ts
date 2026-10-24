import { describe, expect, it } from "vitest";
import { isFillerText, normalizeContent } from "./schemas";

describe("isFillerText", () => {
  it("drops what says nothing", () => {
    for (const t of ["•", " • ", "À retenir", "placeholder", "étapes", "—", ""]) expect(isFillerText(t), t).toBe(true);
  });
  it("keeps real content, even short", () => {
    for (const t of ["PAM ≥ 65 mmHg", "• Sugammadex 2 mg/kg", "Non."]) expect(isFillerText(t), t).toBe(false);
  });
  it("leaves no empty « À retenir » or placeholder block", () => {
    expect(normalizeContent("a_retenir", { text: "•" })).toBeNull();
    expect(normalizeContent("texte_libre", { text: "placeholder" })).toBeNull();
    expect(normalizeContent("protocole_paliers", { text: "étapes" })).toBeNull();
    expect(normalizeContent("a_retenir", { text: "• Point clé." })).toEqual({ text: "• Point clé." });
    // Announced but not listed (Haiku, lots 5-6): missing, the repair pass writes it.
    expect(normalizeContent("a_retenir", { text: "Points clés à mémoriser." })).toBeNull();
  });
  it("takes points listed apart from the text", () => {
    expect(normalizeContent("a_retenir", { text: "Points clés à mémoriser.", items: ["PAM ≥ 65 mmHg", "• Diurèse ≥ 0,5 mL/kg/h"] })).toEqual({
      text: "Points clés à mémoriser.\n• PAM ≥ 65 mmHg\n• Diurèse ≥ 0,5 mL/kg/h",
    });
  });
});
