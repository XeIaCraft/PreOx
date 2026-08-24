import "server-only";

import { GeminiError } from "@/lib/gemini-shared";
import { extractPdfPageTexts } from "./pdf-text";
import { extractDocxText, extractPptxText } from "./office-text";

// Reasonable upper bound on the source text fed to a notion-update check —
// a full textbook chapter or a long review article is well under this, and
// it keeps a single admin upload from generating an absurd token bill.
const MAX_SOURCE_TEXT_CHARS = 120_000;

/**
 * Best-effort plain text of an uploaded "article" for the notion-update
 * pipeline (actions/notion-updates.ts) — sniffs by extension since that's
 * what the admin's file picker actually gives a reliable signal on, not
 * MIME type (browsers are inconsistent about it for .docx/.pptx). Falls
 * back to reading the bytes as UTF-8 text for anything else (.txt, .md...).
 */
export async function extractTextFromUpload(bytes: Uint8Array, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  let text: string;

  if (ext === "pdf") {
    const pages = await extractPdfPageTexts(bytes);
    text = pages.join("\n\n");
    if (!text.trim()) throw new GeminiError("Aucun texte lisible dans ce PDF (probablement un scan/image sans OCR).");
  } else if (ext === "docx") {
    text = await extractDocxText(bytes);
  } else if (ext === "pptx") {
    text = await extractPptxText(bytes);
  } else {
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (!text.trim()) throw new GeminiError("Fichier vide ou illisible — formats acceptés : PDF, Word (.docx), PowerPoint (.pptx), texte brut.");
  }

  return text.length > MAX_SOURCE_TEXT_CHARS ? text.slice(0, MAX_SOURCE_TEXT_CHARS) : text;
}
