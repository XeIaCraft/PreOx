import { describe, expect, it } from "vitest";
import { shortBookTitle } from "./book-title";

describe("shortBookTitle", () => {
  it("keeps the authors' names", () => {
    expect(shortBookTitle("Miller's Anesthesia, 10th edition")).toBe("Miller");
    expect(shortBookTitle("Morgan & Mikhail's Clinical Anesthesiology")).toBe("Morgan & Mikhail");
    expect(shortBookTitle("Albrecht — Anesthésie de l'obèse")).toBe("Albrecht");
    expect(shortBookTitle("Barash")).toBe("Barash");
  });
});
