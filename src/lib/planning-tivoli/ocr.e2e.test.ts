import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { PlanningOcr } from "./ocr";
import { cleanCell } from "./initials";

// End to end on a real planning (week of 09/11/2026), image not kept in the
// repository (it holds the staff's names): PLANNING_OCR_FIXTURE=<path to the
// capture> npx vitest run ocr.e2e — prints the share of « Anesth » cells read right.
const FIXTURE = process.env.PLANNING_OCR_FIXTURE;

const COLUMNS = ["SALLE 1", "SALLE 2", "SALLE 3", "SALLE 4", "SALLE 5", "SALLE 6", "SALLE 7", "SALLE 8", "SALLE 9", "SALLE 10", "D+", "END", "CON", "H.B.", "Garde", "E40"];
const EXPECTED: string[][] = [
  ["Sad", "Mig", "To", "Is-He", "Ze-He", "Le-He", "Ab", "La", "Fatt", "Ha", "At", "Ch+Fr", "Cha", "", "He", "Je"],
  ["", "Le-Fr", "Ch", "At", "Cha-Ha", "Is-Ha", "Hav", "La", "To", "Ze-Fr", "Sad", "Fatt+Je", "Ab", "Ab", "Ze/Fr", "Mig"],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "Is/Sad", ""],
  ["Ha", "Ch", "Lm-To", "He", "?", "La", "Ze-Fatt", "Le-Fatt", "Mig", "Ab", "Fr", "Hav", "Is", "At", "Fatt", ""],
  ["Mig", "La", "", "Fr", "Ch", "Ha", "LM-To", "Le-To", "Is-To", "Hav", "", "Sad", "Ze", "", "LM/To", ""],
];

describe.skipIf(!FIXTURE)("OCR of a real planning", () => {
  it("reads the week, the rooms and the « Anesth » cells", async () => {
    const ocr = await PlanningOcr.start();
    const r = await ocr.read(fs.readFileSync(FIXTURE!));
    await ocr.stop();
    expect(r.period).toEqual({ from: "2026-11-09", to: "2026-11-13" });
    expect(r.columns).toEqual(COLUMNS);
    let right = 0;
    let rooms = 0;
    const wrong: string[] = [];
    r.days.forEach((d, i) =>
      d.cells.forEach((c, j) => {
        const ok = cleanCell(c.text) === EXPECTED[i][j];
        if (ok) right++;
        else wrong.push(`${d.label} ${c.column}: « ${c.text} » (${c.confidence}) au lieu de « ${EXPECTED[i][j]} »`);
        if (ok && j < 10) rooms++;
      })
    );
    console.log(`Cellules « Anesth » lues correctement : ${right}/80 (${Math.round((right / 80) * 100)} %), SALLE 1–10 : ${rooms}/50\n${wrong.join("\n")}`);
    expect(r.days).toHaveLength(5);
    expect(right / 80).toBeGreaterThanOrEqual(0.9);
  }, 120_000);
});
