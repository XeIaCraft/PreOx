// Output schemas of the five fusion stages, written once in plain JSON
// Schema (Claude's tool input_schema dialect) and converted for Gemini's
// responseSchema (upper-case type names) — the two providers must never
// drift apart on what a stage returns. The normalizers below are the only
// way a raw answer reaches the pipeline: tool use and responseSchema guide
// the shape but don't guarantee it (see coerceArray in anthropic.ts).

import { coerceArray } from "../anthropic";
import { BLOCK_TYPES } from "../block-types";
import type { BlockContent, BlockType } from "../types";
import type { RawMergedBlock, RawMergedCard, RawMergedFiche, RawRepair } from "./types";

type JsonSchema = Record<string, unknown>;

/** Block types the fusion may write: the extraction ones plus the two fusion-only ones. */
export const MERGE_BLOCK_TYPES: BlockType[] = [...BLOCK_TYPES, "divergence", "a_retenir", "historique", "etudes_cles"];

const BLOCK_CONTENT: JsonSchema = {
  type: "object",
  properties: {
    text: { type: "string" },
    headers: { type: "array", items: { type: "string" } },
    rows: { type: "array", items: { type: "array", items: { type: "string" } } },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, detail: { type: "string" }, condition: { type: "string" } },
        required: ["label", "detail"],
      },
    },
  },
};

const ID_LIST: JsonSchema = { type: "array", items: { type: "string" } };

export const PLAN_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    parts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          sub_parts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Vide seulement si la partie n'a pas besoin d'être subdivisée." },
                scope: { type: "string", description: "Ce que couvre cette sous-partie, assez précis pour y ranger une fiche sans hésiter." },
              },
              required: ["title", "scope"],
            },
          },
        },
        required: ["title", "sub_parts"],
      },
    },
  },
  required: ["parts"],
};

export const ASSIGN_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        properties: { fiche: { type: "string" }, sub_part: { type: "string" } },
        required: ["fiche", "sub_part"],
      },
    },
  },
  required: ["assignments"],
};

const OUTLINE_FICHE: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    objective: { type: "string", description: "En une phrase : ce que le lecteur saura après cette fiche." },
    sources: { ...ID_LIST, description: "Identifiants (ex. \"F3\") des fiches sources fusionnées dans celle-ci." },
  },
  required: ["title", "objective", "sources"],
};

export const OUTLINE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    chapters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          fiches: { type: "array", items: OUTLINE_FICHE },
        },
        required: ["title", "fiches"],
      },
    },
  },
  required: ["chapters"],
};

export const FICHE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Chapeau de la fiche : une à deux phrases." },
    blocks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          block_type: { type: "string", enum: MERGE_BLOCK_TYPES },
          heading: { type: "string", description: "Intertitre court du bloc (ex. « Mécanisme d'action »)." },
          content: BLOCK_CONTENT,
          source_block_ids: { ...ID_LIST, description: "Identifiants (ex. \"B12\") de TOUS les blocs sources dont ce bloc reprend le contenu." },
          suggested_image: {
            type: "object",
            properties: {
              what: { type: "string", description: "Ce qu'il serait utile d'illustrer ici, précisément." },
              source_block_id: { type: "string", description: "Bloc source dont la page contient déjà une figure utile, s'il y en a un." },
            },
            required: ["what"],
          },
          reuse_image_from: { type: "string", description: "Bloc source (ex. \"B7\") dont l'illustration existante doit être reprise ici." },
        },
        required: ["block_type", "content", "source_block_ids"],
      },
    },
    flashcards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          front: { type: "string" },
          back: { type: "string" },
          source_flashcard_ids: { ...ID_LIST, description: "Identifiants (ex. \"K4\") des cartes sources fusionnées dans celle-ci ; vide pour une carte nouvelle." },
        },
        required: ["front", "back", "source_flashcard_ids"],
      },
    },
  },
  required: ["summary", "blocks", "flashcards"],
};

export const REPAIR_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    replacements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          block_index: { type: "integer" },
          heading: { type: "string" },
          content: BLOCK_CONTENT,
          source_block_ids: ID_LIST,
        },
        required: ["block_index", "content", "source_block_ids"],
      },
    },
    insertions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          after_block_index: { type: "integer", description: "-1 pour insérer en tête." },
          block_type: { type: "string", enum: MERGE_BLOCK_TYPES },
          heading: { type: "string" },
          content: BLOCK_CONTENT,
          source_block_ids: ID_LIST,
        },
        required: ["after_block_index", "block_type", "content", "source_block_ids"],
      },
    },
    already_covered: {
      type: "array",
      items: {
        type: "object",
        properties: { source_block_id: { type: "string" }, block_index: { type: "integer" } },
        required: ["source_block_id", "block_index"],
      },
    },
    flashcards: {
      type: "array",
      description: "Cartes nouvelles pour les cartes sources listées ou les valeurs perdues ; vide s'il n'y a rien à ajouter.",
      items: {
        type: "object",
        properties: { front: { type: "string" }, back: { type: "string" }, source_flashcard_ids: ID_LIST },
        required: ["front", "back", "source_flashcard_ids"],
      },
    },
  },
  required: ["replacements", "insertions", "already_covered", "flashcards"],
};

/** Gemini's responseSchema dialect: same structure, upper-case type names. */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === "type" && typeof value === "string") out.type = value.toUpperCase();
    else if (key === "enum") out.enum = value;
    else out[key] = toGeminiSchema(value);
  }
  return out;
}

// -- Normalizers ------------------------------------------------------------

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const ids = (v: unknown): string[] => coerceArray(v).filter((x): x is string => typeof x === "string").map((x) => x.trim());

export interface RawPlan {
  parts: { title: string; sub_parts: { title: string; scope: string }[] }[];
}

export function normalizePlan(raw: unknown): RawPlan {
  const obj = raw as { parts?: unknown } | null;
  return {
    parts: coerceArray(obj?.parts)
      .map((p) => {
        const part = p as { title?: unknown; sub_parts?: unknown };
        return {
          title: str(part.title).trim(),
          sub_parts: coerceArray(part.sub_parts)
            .map((sp) => ({ title: str((sp as { title?: unknown }).title).trim(), scope: str((sp as { scope?: unknown }).scope).trim() }))
            .filter((sp) => sp.title || sp.scope),
        };
      })
      .filter((p) => p.title && p.sub_parts.length > 0),
  };
}

/** `chapter` is the key's former name, still accepted. */
export function normalizeAssignments(raw: unknown): { fiche: string; chapter: string }[] {
  const obj = raw as { assignments?: unknown } | null;
  return coerceArray(obj?.assignments)
    .map((a) => {
      const entry = a as { fiche?: unknown; sub_part?: unknown; chapter?: unknown };
      return { fiche: str(entry.fiche).trim(), chapter: (str(entry.sub_part) || str(entry.chapter)).trim() };
    })
    .filter((a) => a.fiche && a.chapter);
}

export function normalizeOutline(raw: unknown): { title: string; fiches: { title: string; objective: string; sources: string[] }[] }[] {
  const obj = raw as { chapters?: unknown } | null;
  return coerceArray(obj?.chapters)
    .map((c) => {
      const chapter = c as { title?: unknown; fiches?: unknown };
      return {
        title: str(chapter.title).trim(),
        fiches: coerceArray(chapter.fiches)
          .map((f) => {
            const fiche = f as { title?: unknown; objective?: unknown; sources?: unknown };
            return { title: str(fiche.title).trim(), objective: str(fiche.objective).trim(), sources: ids(fiche.sources) };
          })
          .filter((f) => f.title && f.sources.length > 0),
      };
    })
    .filter((c) => c.fiches.length > 0);
}

/** Keeps only the fields the block type actually uses, so a stray empty `rows` never turns a text block into a broken table. */
export function normalizeContent(blockType: BlockType, raw: unknown): BlockContent | null {
  const c = (raw ?? {}) as { text?: unknown; headers?: unknown; rows?: unknown; steps?: unknown };
  // « Études et auteurs clés »: a table when there is one, else text.
  if (blockType === "etudes_cles" && coerceArray(c.rows).length === 0) {
    const text = str(c.text).trim();
    return text ? { text } : null;
  }
  if (blockType === "tableau_comparatif" || blockType === "etudes_cles") {
    const headers = coerceArray(c.headers).map(str);
    const rows = coerceArray(c.rows).map((r) => coerceArray(r).map(str));
    if (rows.length === 0) return typeof c.text === "string" && c.text.trim() ? { text: c.text } : null;
    return { headers, rows };
  }
  if (blockType === "protocole_paliers") {
    const steps = coerceArray(c.steps)
      .map((s) => {
        const step = s as { label?: unknown; detail?: unknown; condition?: unknown };
        const condition = str(step.condition).trim();
        return { label: str(step.label), detail: str(step.detail), ...(condition ? { condition } : {}) };
      })
      .filter((s) => s.label || s.detail);
    if (steps.length === 0) return typeof c.text === "string" && c.text.trim() ? { text: c.text } : null;
    return { steps };
  }
  const text = str(c.text).trim();
  return text ? { text } : null;
}

/** A table or protocol answer whose structure was empty falls back to plain text — the type follows the content actually kept. */
function effectiveType(blockType: BlockType, content: BlockContent): BlockType {
  if ((blockType === "tableau_comparatif" || blockType === "protocole_paliers") && "text" in content) return "texte_libre";
  return blockType;
}

function normalizeBlock(raw: unknown): RawMergedBlock | null {
  const b = raw as { block_type?: unknown; heading?: unknown; content?: unknown; source_block_ids?: unknown; suggested_image?: unknown; reuse_image_from?: unknown };
  const declared = MERGE_BLOCK_TYPES.includes(b.block_type as BlockType) ? (b.block_type as BlockType) : "texte_libre";
  const content = normalizeContent(declared, b.content);
  if (!content) return null;
  const image = b.suggested_image as { what?: unknown; source_block_id?: unknown } | null | undefined;
  const what = str(image?.what).trim();
  const heading = str(b.heading).trim();
  return {
    block_type: effectiveType(declared, content),
    ...(heading ? { heading } : {}),
    content,
    source_block_ids: ids(b.source_block_ids),
    suggested_image: what ? { what, ...(str(image?.source_block_id).trim() ? { source_block_id: str(image?.source_block_id).trim() } : {}) } : null,
    reuse_image_from: str(b.reuse_image_from).trim() || null,
  };
}

export function normalizeMergedFiche(raw: unknown): RawMergedFiche {
  const obj = raw as { summary?: unknown; blocks?: unknown; flashcards?: unknown } | null;
  return {
    summary: str(obj?.summary).trim(),
    blocks: coerceArray(obj?.blocks)
      .map(normalizeBlock)
      .filter((b): b is RawMergedBlock => b !== null),
    flashcards: coerceArray(obj?.flashcards)
      .map((c) => {
        const card = c as { front?: unknown; back?: unknown; source_flashcard_ids?: unknown };
        return { front: str(card.front).trim(), back: str(card.back).trim(), source_flashcard_ids: ids(card.source_flashcard_ids) };
      })
      .filter((c): c is RawMergedCard => Boolean(c.front && c.back)),
  };
}

export function normalizeRepair(raw: unknown): RawRepair {
  const obj = raw as { replacements?: unknown; insertions?: unknown; already_covered?: unknown; flashcards?: unknown } | null;
  const replacements: RawRepair["replacements"] = [];
  for (const r of coerceArray(obj?.replacements)) {
    const rep = r as { block_index?: unknown; heading?: unknown; content?: unknown; source_block_ids?: unknown };
    if (typeof rep.block_index !== "number") continue;
    // The content type is checked against the existing block when applied.
    const heading = str(rep.heading).trim();
    replacements.push({ block_index: rep.block_index, ...(heading ? { heading } : {}), content: (rep.content ?? {}) as BlockContent, source_block_ids: ids(rep.source_block_ids) });
  }
  const insertions: RawRepair["insertions"] = [];
  for (const i of coerceArray(obj?.insertions)) {
    const ins = i as { after_block_index?: unknown; block_type?: unknown; heading?: unknown; content?: unknown; source_block_ids?: unknown };
    const declared = MERGE_BLOCK_TYPES.includes(ins.block_type as BlockType) ? (ins.block_type as BlockType) : "texte_libre";
    const content = normalizeContent(declared, ins.content);
    if (!content) continue;
    const heading = str(ins.heading).trim();
    insertions.push({
      after_block_index: typeof ins.after_block_index === "number" ? ins.after_block_index : Number.MAX_SAFE_INTEGER,
      block_type: effectiveType(declared, content),
      ...(heading ? { heading } : {}),
      content,
      source_block_ids: ids(ins.source_block_ids),
    });
  }
  const alreadyCovered: RawRepair["alreadyCovered"] = [];
  for (const a of coerceArray(obj?.already_covered)) {
    const entry = a as { source_block_id?: unknown; block_index?: unknown };
    if (typeof entry.block_index === "number" && str(entry.source_block_id).trim())
      alreadyCovered.push({ sourceBlockId: str(entry.source_block_id).trim(), blockIndex: entry.block_index });
  }
  const flashcards = coerceArray(obj?.flashcards)
    .map((c) => {
      const card = c as { front?: unknown; back?: unknown; source_flashcard_ids?: unknown };
      return { front: str(card.front).trim(), back: str(card.back).trim(), source_flashcard_ids: ids(card.source_flashcard_ids) };
    })
    .filter((c) => c.front && c.back);
  return { replacements, insertions, alreadyCovered, flashcards };
}
