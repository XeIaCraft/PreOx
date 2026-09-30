import { describe, expect, it } from "vitest";
import { correctExtractionCitations, correctComplementaryCitations } from "./pdf-text";
import type { Citation, ExtractionResult, ComplementaryResult, ExtractedSubEntity } from "./types";

const citation = (page: number, quote: string): Citation => ({ page, quote });

function subEntityWith(citations: Citation[]): ExtractedSubEntity {
  return {
    name: "Test",
    summary: "",
    fiche: {
      title: "Test",
      blocks: [{ block_type: "definition_mecanisme", content: { text: "x" }, citations }],
      flashcards: [],
    },
  };
}

describe("correctExtractionCitations", () => {
  const pageTexts = ["Introduction générale, rien d'utile ici.", "L'hyperkaliémie provoque des troubles du rythme cardiaque graves.", "Conclusion."];

  it("corrects the page number when the quote is found verbatim on exactly one other page", () => {
    const result: ExtractionResult = { sub_entities: [subEntityWith([citation(1, "L'hyperkaliémie provoque des troubles du rythme cardiaque graves")])], estimated_remaining_passes: 0 };
    correctExtractionCitations(result, pageTexts);
    expect(result.sub_entities[0].fiche.blocks[0].citations[0].page).toBe(2);
  });

  it("leaves the page untouched when the quote already points to the right page", () => {
    const result: ExtractionResult = { sub_entities: [subEntityWith([citation(2, "L'hyperkaliémie provoque des troubles du rythme cardiaque graves")])], estimated_remaining_passes: 0 };
    correctExtractionCitations(result, pageTexts);
    expect(result.sub_entities[0].fiche.blocks[0].citations[0].page).toBe(2);
  });

  it("leaves the page untouched when the quote isn't found anywhere (paraphrased or scanned page)", () => {
    const result: ExtractionResult = { sub_entities: [subEntityWith([citation(1, "une phrase qui n'existe nulle part dans ce document")])], estimated_remaining_passes: 0 };
    correctExtractionCitations(result, pageTexts);
    expect(result.sub_entities[0].fiche.blocks[0].citations[0].page).toBe(1);
  });

  it("leaves the page untouched when the quote is ambiguous (matches more than one page)", () => {
    const ambiguousPages = ["Le patient doit être surveillé attentivement.", "Le patient doit être surveillé attentivement en réanimation."];
    const result: ExtractionResult = { sub_entities: [subEntityWith([citation(1, "le patient doit être surveillé attentivement")])], estimated_remaining_passes: 0 };
    correctExtractionCitations(result, ambiguousPages);
    // Ambiguous: the short needle matches both pages 1 and 2 — original page kept.
    expect(result.sub_entities[0].fiche.blocks[0].citations[0].page).toBe(1);
  });

  it("never corrects a citation whose quote is too short to locate reliably", () => {
    const result: ExtractionResult = { sub_entities: [subEntityWith([citation(1, "hyperkaliémie")])], estimated_remaining_passes: 0 };
    correctExtractionCitations(result, pageTexts);
    expect(result.sub_entities[0].fiche.blocks[0].citations[0].page).toBe(1);
  });
});

describe("correctComplementaryCitations", () => {
  const pageTexts = ["Rien ici.", "La ventilation protectrice limite le volume courant à 6 mL par kilogramme de poids idéal."];

  it("corrects citations on both additions_for_existing and new_sub_entities", () => {
    const result: ComplementaryResult = {
      additions_for_existing: [
        {
          sub_entity_name: "Existante",
          blocks: [
            {
              block_type: "definition_mecanisme",
              content: { text: "x" },
              citations: [citation(1, "la ventilation protectrice limite le volume courant à 6 mL par kilogramme")],
            },
          ],
          flashcards: [],
        },
      ],
      new_sub_entities: [
        {
          name: "Nouvelle",
          summary: "",
          fiche: {
            title: "Nouvelle",
            blocks: [],
            flashcards: [
              {
                front: "?",
                back: "x",
                citations: [citation(1, "la ventilation protectrice limite le volume courant à 6 mL par kilogramme")],
              },
            ],
          },
        },
      ],
      estimated_remaining_passes: 0,
    };

    correctComplementaryCitations(result, pageTexts);

    expect(result.additions_for_existing[0].blocks[0].citations[0].page).toBe(2);
    expect(result.new_sub_entities[0].fiche.flashcards[0].citations[0].page).toBe(2);
  });
});

describe("extractPdfPageTexts", () => {
  it("laisse intacts les octets de l'appelant (pdf.js transfère le buffer qu'on lui donne)", async () => {
    const { extractPdfPageTexts } = await import("./pdf-text");
    const content = "BT /F1 24 Tf 72 700 Td (Hello PreOx) Tj ET";
    const objs = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];
    objs.forEach((o, i) => {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new TextEncoder().encode(pdf);
    const size = bytes.byteLength;
    expect(await extractPdfPageTexts(bytes)).toEqual(["Hello PreOx"]);
    expect(bytes.byteLength).toBe(size);
    expect(() => new Blob([bytes as unknown as BlobPart])).not.toThrow();
  });
});
