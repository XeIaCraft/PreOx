"use server";

import { requireATableAccess } from "@/lib/a-table/dal";
import { parsePaprikaExport } from "@/lib/a-table/paprika";
import { importRecipe } from "./recipes";

export interface ActionState {
  error?: string;
  success?: string;
}

// Caps how many recipes one import processes — each one is a separate AI
// structuring call, and a huge library would otherwise risk the Server
// Action's execution time limit and burn through the user's Gemini quota
// in one click.
const MAX_RECIPES_PER_IMPORT = 15;

// A Paprika export with many recipes' embedded photos can run large even
// though only MAX_RECIPES_PER_IMPORT get processed — checked before parsing
// so an oversized file fails fast instead of at the Server Action's own
// request-body limit.
const MAX_EXPORT_BYTES = 20 * 1024 * 1024;

export async function importPaprikaExport(fileBase64: string): Promise<ActionState & { imported?: number; skipped?: number }> {
  await requireATableAccess();

  const bytes = Buffer.from(fileBase64, "base64");
  if (bytes.byteLength > MAX_EXPORT_BYTES) return { error: "Fichier trop lourd (20 Mo maximum)." };

  let entries;
  try {
    entries = await parsePaprikaExport(bytes);
  } catch {
    return { error: "Fichier .paprikarecipes invalide ou illisible." };
  }
  if (entries.length === 0) return { error: "Aucune recette trouvée dans ce fichier." };

  const toImport = entries.slice(0, MAX_RECIPES_PER_IMPORT);
  let imported = 0;
  for (const entry of toImport) {
    const result = await importRecipe({ text: entry.rawText });
    if (!result.error) imported++;
  }

  const skipped = entries.length - toImport.length;
  return {
    success: `${imported} recette(s) importée(s)${skipped > 0 ? ` — ${skipped} ignorée(s) (limite de ${MAX_RECIPES_PER_IMPORT} par import)` : ""}.`,
    imported,
    skipped,
  };
}
