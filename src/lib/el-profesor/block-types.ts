import type { BlockType } from "@/lib/el-profesor/types";

// Canonical block-type list, kept in its own module (2026-08-26) so both
// gemini.ts and anthropic.ts can depend on it without a circular import
// between the two — anthropic.ts already needed it (Claude's tool schema),
// and gemini.ts started needing anthropic.ts's normalizers the same day
// (shared defensive parsing for a model double-encoding an array as its own
// JSON string). gemini.ts re-exports this for every existing external
// importer, so nothing else needs to change its import path.
export const BLOCK_TYPES: BlockType[] = [
  "definition_mecanisme",
  "valeurs_seuils",
  "tableau_comparatif",
  "protocole_paliers",
  "mnemotechnique",
  "perle_clinique",
  "piege_erreur",
  "formule",
  "texte_libre",
];
