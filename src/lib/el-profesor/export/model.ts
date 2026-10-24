// What an export volume is made of, whatever the output (PDF or Word): the
// book's own outline — parts, sub-parts, chapters, fiches — and each fiche's
// published blocks, in reading order. Built by load.ts, laid out by pdf.ts
// and docx.ts.
import type { BlockContent, BlockType } from "../types";

export type ExportImage = {
  /** PNG or JPEG bytes, already downsized for print (see load.ts). */
  data: Uint8Array;
  format: "png" | "jpeg";
  width: number;
  height: number;
  alt: string | null;
};

export type ExportBlock = {
  type: BlockType;
  content: BlockContent;
  image: ExportImage | null;
};

export type ExportFiche = {
  title: string;
  /** The fiche's summary, shown as its lead paragraph. */
  summary: string | null;
  blocks: ExportBlock[];
  /** « Miller's anesthesia : p. 1234, 1240 » — one entry per source book. */
  sources: string[];
};

export type ExportChapter = { title: string; fiches: ExportFiche[] };
export type ExportSubPart = { title: string | null; chapters: ExportChapter[] };
export type ExportPart = { title: string | null; subParts: ExportSubPart[] };

export type ExportVolume = {
  bookTitle: string;
  number: number;
  count: number;
  title: string;
  parts: ExportPart[];
  /** Day the export was made, already formatted (« 24 octobre 2026 »). */
  date: string;
};

/** Labels shown above each block — the same as the reading view's (fiche-viewer.tsx). */
export const BLOCK_LABELS: Record<BlockType, string> = {
  definition_mecanisme: "Définition / mécanisme",
  valeurs_seuils: "Valeurs & seuils",
  tableau_comparatif: "Tableau comparatif",
  protocole_paliers: "Protocole",
  mnemotechnique: "Mnémotechnique",
  perle_clinique: "Perle clinique",
  piege_erreur: "Piège fréquent",
  formule: "Formule",
  texte_libre: "Note",
  divergence: "Divergence entre sources",
  a_retenir: "À retenir par cœur",
  historique: "Historique",
  etudes_cles: "Études et auteurs clés",
};

/** How a block stands out on the page: a tinted box, a coloured rule on its left, or nothing. */
export type BlockTone = { kind: "box" | "rule" | "plain"; color: [number, number, number]; tint: [number, number, number] };

const PLAIN: BlockTone = { kind: "plain", color: [0.35, 0.4, 0.45], tint: [1, 1, 1] };

export const BLOCK_TONES: Record<BlockType, BlockTone> = {
  definition_mecanisme: PLAIN,
  valeurs_seuils: { kind: "rule", color: [0.12, 0.42, 0.62], tint: [0.94, 0.97, 0.99] },
  tableau_comparatif: PLAIN,
  protocole_paliers: { kind: "rule", color: [0.18, 0.5, 0.42], tint: [0.94, 0.98, 0.96] },
  mnemotechnique: { kind: "rule", color: [0.55, 0.36, 0.7], tint: [0.97, 0.95, 0.99] },
  perle_clinique: { kind: "rule", color: [0.13, 0.52, 0.5], tint: [0.94, 0.98, 0.98] },
  piege_erreur: { kind: "rule", color: [0.75, 0.25, 0.2], tint: [0.99, 0.95, 0.94] },
  formule: { kind: "rule", color: [0.35, 0.4, 0.55], tint: [0.96, 0.96, 0.98] },
  texte_libre: PLAIN,
  divergence: { kind: "box", color: [0.72, 0.45, 0.1], tint: [0.99, 0.96, 0.9] },
  a_retenir: { kind: "box", color: [0.11, 0.36, 0.58], tint: [0.92, 0.95, 0.99] },
  historique: PLAIN,
  etudes_cles: PLAIN,
};

export function hex([r, g, b]: [number, number, number]): string {
  return [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}
