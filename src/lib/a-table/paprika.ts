import "server-only";

import JSZip from "jszip";
import { gunzipSync } from "node:zlib";

interface PaprikaRecipeFields {
  name?: string;
  ingredients?: string;
  directions?: string;
  servings?: string;
  prep_time?: string;
  cook_time?: string;
  notes?: string;
  source?: string;
}

export interface ParsedPaprikaEntry {
  title: string;
  rawText: string;
}

function tryDecode(bytes: Uint8Array): PaprikaRecipeFields | null {
  const tryParse = (buf: Buffer): PaprikaRecipeFields | null => {
    try {
      return JSON.parse(buf.toString("utf8")) as PaprikaRecipeFields;
    } catch {
      return null;
    }
  };
  // Each entry in the zip is itself gzip-compressed JSON (Paprika's own
  // on-disk format for a single .paprikarecipe) — fall back to parsing the
  // raw bytes directly in case a given export ever isn't double-compressed.
  try {
    return tryParse(gunzipSync(bytes));
  } catch {
    return tryParse(Buffer.from(bytes));
  }
}

/**
 * Parses a Paprika .paprikarecipes export into plain-text blocks, one per
 * recipe — Paprika's ingredients/directions are single free-text fields
 * (not structured), so rather than writing a bespoke line parser this feeds
 * the same text through the AI recipe-structuring pipeline every other
 * text/URL import in this module already uses.
 */
export async function parsePaprikaExport(buffer: Buffer): Promise<ParsedPaprikaEntry[]> {
  const zip = await JSZip.loadAsync(buffer);
  const entries: ParsedPaprikaEntry[] = [];

  for (const file of Object.values(zip.files)) {
    if (file.dir) continue;
    const bytes = await file.async("uint8array");
    const fields = tryDecode(bytes);
    if (!fields?.name) continue;

    const lines = [
      fields.name,
      fields.servings ? `Portions : ${fields.servings}` : "",
      fields.prep_time ? `Préparation : ${fields.prep_time}` : "",
      fields.cook_time ? `Cuisson : ${fields.cook_time}` : "",
      fields.source ? `Source : ${fields.source}` : "",
      "",
      "Ingrédients :",
      fields.ingredients ?? "",
      "",
      "Étapes :",
      fields.directions ?? "",
      fields.notes ? `\nNotes : ${fields.notes}` : "",
    ].filter(Boolean);

    entries.push({ title: fields.name, rawText: lines.join("\n") });
  }

  return entries;
}
