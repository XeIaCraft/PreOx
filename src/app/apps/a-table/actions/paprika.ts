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

export async function importPaprikaExport(fileBase64: string): Promise<ActionState & { imported?: number; skipped?: number }> {
  await requireATableAccess();

  let entries;
  try {
    entries = await parsePaprikaExport(Buffer.from(fileBase64, "base64"));
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
