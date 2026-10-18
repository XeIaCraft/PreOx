// « Vérifier l'actualité » d'une fiche avec une IA externe (ChatGPT, Claude,
// Perplexity… avec recherche web) : on exporte la fiche dans un prompt qui
// demande une réponse JSON stricte, l'administrateur colle la réponse, on en
// montre l'aperçu puis on l'applique. Pure (pas d'accès base) : les actions
// serveur (actions/fiche-verification.ts) chargent la fiche et écrivent.

import { normalizeContent, MERGE_BLOCK_TYPES } from "./merge/schemas";
import { blockPromptText, blockLabel } from "./merge/prompts";
import type { BlockContent, BlockType } from "./types";

export interface VerifiableFiche {
  title: string;
  summary: string;
  blocks: { id: string; blockType: BlockType; content: BlockContent }[];
  flashcards: { id: string; front: string; back: string }[];
}

/** Short fingerprint of the fiche's structure: an answer built on another version of it is refused. */
export function ficheVersion(fiche: VerifiableFiche): string {
  let h = 0x811c9dc5;
  for (const ch of [...fiche.blocks.map((b) => b.id), "|", ...fiche.flashcards.map((c) => c.id)].join(",")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function buildFicheVerificationPrompt(fiche: VerifiableFiche, today: string): string {
  const body = {
    fiche_version: ficheVersion(fiche),
    titre: fiche.title,
    chapeau: fiche.summary,
    blocs: fiche.blocks.map((b, i) => ({ id: `B${i + 1}`, type: b.blockType, contenu: blockPromptText(b.blockType, b.content) })),
    cartes: fiche.flashcards.map((c, i) => ({ id: `K${i + 1}`, question: c.front, reponse: c.back })),
  };
  return `
Tu es relecteur expert en anesthésie-réanimation. Voici une fiche de révision (au format JSON, plus bas). Vérifie, à la date d'aujourd'hui (${today}), que CHAQUE information est exacte et À JOUR selon les recommandations et la littérature les plus récentes : sociétés savantes (SFAR, ESAIC, ASA, DAS, ERC/ILCOR, ESC, KDIGO, Surviving Sepsis…), méta-analyses et essais majeurs récents. Recherche sur le web si tu le peux.

Pour chaque bloc et chaque carte :
- exact et actuel → "change": "inchangé" (recopie-le tel quel) ;
- dépassé, imprécis ou faux → "change": "modifié", avec le contenu corrigé ;
- et dans "note", pour toute modification : ce qui a changé et pourquoi, avec la référence (auteurs, année, revue ou recommandation, DOI si possible).
Ajoute ("change": "nouveau", "id": null) ce qui manque d'important et de récent, à sa place dans l'ordre de lecture. Ne supprime un bloc ou une carte que s'il est devenu faux ou obsolète, en l'indiquant dans "supprimes" avec la raison. N'invente aucune référence : si tu n'es pas sûr, garde l'existant.

Style à respecter : français, texte brut (ni Markdown ni astérisques), puces « • » pour les énumérations. Types de bloc possibles : ${MERGE_BLOCK_TYPES.join(", ")}. Contenu d'un bloc : {"text": "..."} ; pour "tableau_comparatif" : {"headers": [...], "rows": [[...]]} ; pour "protocole_paliers" : {"steps": [{"label": "...", "detail": "...", "condition": "..."}]}. "heading" = intertitre court facultatif.

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, de cette forme exacte :
{
  "fiche_version": "${body.fiche_version}",
  "resume": "ce qui a changé, en quelques lignes",
  "blocs": [{ "id": "B1", "change": "inchangé", "type": "definition_mecanisme", "heading": "…", "contenu": { "text": "…" }, "note": "" }],
  "cartes": [{ "id": "K1", "change": "inchangé", "question": "…", "reponse": "…", "note": "" }],
  "supprimes": [{ "id": "B3", "note": "raison et référence" }]
}
Liste dans "blocs" et "cartes" TOUS les éléments à garder, dans l'ordre voulu (un élément absent sera conservé tel quel, à la fin).

La fiche :
${JSON.stringify(body, null, 2)}
`.trim();
}

export type BlockChange =
  | { kind: "keep"; id: string }
  | { kind: "update"; id: string; blockType: BlockType; content: BlockContent; note: string }
  | { kind: "add"; blockType: BlockType; content: BlockContent; note: string };

export type CardChange = { kind: "keep"; id: string } | { kind: "update"; id: string; front: string; back: string; note: string } | { kind: "add"; front: string; back: string; note: string };

export interface VerificationChanges {
  summary: string;
  blocks: BlockChange[];
  cards: CardChange[];
  removedBlocks: { id: string; note: string }[];
  removedCards: { id: string; note: string }[];
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const text = (fenced ? fenced[1] : raw).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Aucun objet JSON trouvé dans la réponse.");
  return JSON.parse(text.slice(start, end + 1));
}

function sameContent(a: BlockContent, b: BlockContent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function parseFicheVerification(raw: string, fiche: VerifiableFiche): { ok: true; changes: VerificationChanges } | { ok: false; error: string } {
  let data: Record<string, unknown>;
  try {
    data = extractJson(raw) as Record<string, unknown>;
  } catch (err) {
    return { ok: false, error: `Réponse illisible : ${err instanceof Error ? err.message : "JSON invalide"}.` };
  }
  const version = str(data.fiche_version);
  if (version && version !== ficheVersion(fiche)) return { ok: false, error: "La fiche a changé depuis l'export (blocs ou cartes ajoutés, supprimés ou déplacés) : exportez-la de nouveau." };

  const blockById = new Map(fiche.blocks.map((b, i) => [`B${i + 1}`, b]));
  const cardById = new Map(fiche.flashcards.map((c, i) => [`K${i + 1}`, c]));
  const seenBlocks = new Set<string>();
  const seenCards = new Set<string>();

  const removedBlocks: VerificationChanges["removedBlocks"] = [];
  const removedCards: VerificationChanges["removedCards"] = [];
  for (const r of Array.isArray(data.supprimes) ? data.supprimes : []) {
    const id = str((r as { id?: unknown }).id).toUpperCase();
    const note = str((r as { note?: unknown }).note);
    if (blockById.has(id)) {
      removedBlocks.push({ id: blockById.get(id)!.id, note });
      seenBlocks.add(id);
    } else if (cardById.has(id)) {
      removedCards.push({ id: cardById.get(id)!.id, note });
      seenCards.add(id);
    }
  }

  const blocks: BlockChange[] = [];
  for (const entry of Array.isArray(data.blocs) ? data.blocs : []) {
    const e = entry as { id?: unknown; change?: unknown; type?: unknown; heading?: unknown; contenu?: unknown; note?: unknown };
    const alias = str(e.id).toUpperCase();
    const existing = blockById.get(alias);
    if (existing && seenBlocks.has(alias)) continue;
    const declared = MERGE_BLOCK_TYPES.includes(e.type as BlockType) ? (e.type as BlockType) : (existing?.blockType ?? "texte_libre");
    const type = existing ? existing.blockType : declared;
    const normalized = normalizeContent(type, e.contenu);
    const heading = str(e.heading);
    const content = normalized ? ((heading ? { ...normalized, heading } : normalized) as BlockContent) : null;
    if (existing) {
      seenBlocks.add(alias);
      const change = str(e.change).toLowerCase();
      if (!content || change.startsWith("inchang") || sameContent(content, existing.content)) blocks.push({ kind: "keep", id: existing.id });
      else blocks.push({ kind: "update", id: existing.id, blockType: existing.blockType, content, note: str(e.note) });
    } else if (content) {
      blocks.push({ kind: "add", blockType: type, content, note: str(e.note) });
    }
  }
  // Nothing is lost by omission: an element the answer didn't mention stays, at the end.
  fiche.blocks.forEach((b, i) => {
    if (!seenBlocks.has(`B${i + 1}`)) blocks.push({ kind: "keep", id: b.id });
  });

  const cards: CardChange[] = [];
  for (const entry of Array.isArray(data.cartes) ? data.cartes : []) {
    const e = entry as { id?: unknown; change?: unknown; question?: unknown; reponse?: unknown; note?: unknown };
    const alias = str(e.id).toUpperCase();
    const existing = cardById.get(alias);
    if (existing && seenCards.has(alias)) continue;
    const front = str(e.question);
    const back = str(e.reponse);
    if (existing) {
      seenCards.add(alias);
      const change = str(e.change).toLowerCase();
      if (!front || !back || change.startsWith("inchang") || (front === existing.front && back === existing.back)) cards.push({ kind: "keep", id: existing.id });
      else cards.push({ kind: "update", id: existing.id, front, back, note: str(e.note) });
    } else if (front && back) cards.push({ kind: "add", front, back, note: str(e.note) });
  }
  fiche.flashcards.forEach((c, i) => {
    if (!seenCards.has(`K${i + 1}`)) cards.push({ kind: "keep", id: c.id });
  });

  return { ok: true, changes: { summary: str(data.resume), blocks, cards, removedBlocks, removedCards } };
}

/** One line per change, for the preview shown before applying. */
export function describeChanges(changes: VerificationChanges, fiche: VerifiableFiche): string[] {
  const label = (id: string) => {
    const i = fiche.blocks.findIndex((b) => b.id === id);
    return i === -1 ? "bloc" : `${blockLabel(fiche.blocks[i].blockType)} n° ${i + 1}`;
  };
  const cardLabel = (id: string) => `carte n° ${fiche.flashcards.findIndex((c) => c.id === id) + 1}`;
  const lines: string[] = [];
  for (const b of changes.blocks) {
    if (b.kind === "update") lines.push(`Modifié — ${label(b.id)}${b.note ? ` : ${b.note}` : ""}`);
    if (b.kind === "add") lines.push(`Ajouté — ${blockLabel(b.blockType)}${b.note ? ` : ${b.note}` : ""}`);
  }
  for (const r of changes.removedBlocks) lines.push(`Supprimé — ${label(r.id)}${r.note ? ` : ${r.note}` : ""}`);
  for (const c of changes.cards) {
    if (c.kind === "update") lines.push(`Carte modifiée — ${cardLabel(c.id)}${c.note ? ` : ${c.note}` : ""}`);
    if (c.kind === "add") lines.push(`Carte ajoutée — ${c.front}${c.note ? ` (${c.note})` : ""}`);
  }
  for (const r of changes.removedCards) lines.push(`Carte supprimée — ${cardLabel(r.id)}${r.note ? ` : ${r.note}` : ""}`);
  return lines;
}
