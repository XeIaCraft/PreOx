import { describe, expect, it } from "vitest";
import { shortBookTitle } from "./book-title";

describe("shortBookTitle", () => {
  it("keeps the authors' names", () => {
    expect(shortBookTitle("Miller's Anesthesia, 10th edition")).toBe("Miller");
    expect(shortBookTitle("Morgan & Mikhail's Clinical Anesthesiology")).toBe("Morgan & Mikhail");
    expect(shortBookTitle("Albrecht — Anesthésie de l'obèse")).toBe("Albrecht");
    expect(shortBookTitle("Barash")).toBe("Barash");
    expect(shortBookTitle("Manuel pratique d'anesthésie (Albrecht)")).toBe("Albrecht");
    expect(shortBookTitle("Stoelting’s pharmacology & physiology in anesthetic practice")).toBe("Stoelting");
    expect(shortBookTitle("Le livre de l'interne - Anesthésiologie")).toBe("Livre de l'interne");
    expect(shortBookTitle("Manuel de ventilation appliquée en anesthésie")).toBe("Manuel de ventilation");
    expect(shortBookTitle("Manuel d’hémodynamique appliquée en anesthésie")).toBe("Manuel d’hémodynamique");
    expect(shortBookTitle("Basic Physiology for Anaesthetists")).toBe("Basic Physiology");
    expect(shortBookTitle("MAPAR")).toBe("MAPAR");
  });
});
