import "server-only";

import JSZip from "jszip";
import { GeminiError } from "@/lib/gemini-shared";

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Concatenates every text run inside one paragraph-like XML block, ignoring formatting tags — same "read the runs, ignore the markup" approach for both docx and pptx since both are OOXML. */
function extractParagraphText(paragraphXml: string, runTag: string): string {
  const runRegex = new RegExp(`<${runTag}(?:\\s[^>]*)?>([^<]*)</${runTag}>`, "g");
  let text = "";
  let match: RegExpExecArray | null;
  while ((match = runRegex.exec(paragraphXml))) {
    text += decodeXmlEntities(match[1]);
  }
  return text;
}

function extractParagraphs(xml: string, paragraphTag: string, runTag: string): string[] {
  const paragraphRegex = new RegExp(`<${paragraphTag}(?:\\s[^>]*)?>[\\s\\S]*?</${paragraphTag}>`, "g");
  const paragraphs = xml.match(paragraphRegex) ?? [];
  return paragraphs.map((p) => extractParagraphText(p, runTag)).filter((t) => t.trim());
}

/** Plain text of a .docx file, paragraph per line — no formatting, no images, no tables structure beyond their cell text. Item 5 of the backlog: lets a chapter be sourced from Word instead of only PDF. */
export async function extractDocxText(bytes: Uint8Array): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new GeminiError("Fichier .docx invalide ou corrompu.");
  }
  const doc = zip.file("word/document.xml");
  if (!doc) throw new GeminiError("Ce fichier ne ressemble pas à un .docx valide (word/document.xml manquant).");
  const xml = await doc.async("string");
  const paragraphs = extractParagraphs(xml, "w:p", "w:t");
  if (paragraphs.length === 0) throw new GeminiError("Aucun texte trouvé dans ce document Word.");
  return paragraphs.join("\n");
}

/** Plain text of a .pptx file, one slide per section — same run-extraction approach as extractDocxText, but per slide file and grouped with a slide header so the model can keep the deck's structure. Item 5 of the backlog. */
export async function extractPptxText(bytes: Uint8Array): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new GeminiError("Fichier .pptx invalide ou corrompu.");
  }

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)![1]);
      const nb = Number(b.match(/slide(\d+)\.xml$/)![1]);
      return na - nb;
    });
  if (slideFiles.length === 0) throw new GeminiError("Ce fichier ne ressemble pas à un .pptx valide (aucune diapositive trouvée).");

  const slides: string[] = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.file(slideFiles[i])!.async("string");
    const paragraphs = extractParagraphs(xml, "a:p", "a:t");
    if (paragraphs.length === 0) continue;
    slides.push(`--- Diapositive ${i + 1} ---\n${paragraphs.join("\n")}`);
  }
  if (slides.length === 0) throw new GeminiError("Aucun texte trouvé dans ce diaporama.");
  return slides.join("\n\n");
}
