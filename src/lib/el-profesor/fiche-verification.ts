// « Vérifier l'actualité » d'une fiche ou d'un chapitre entier avec une IA
// qui a accès à la littérature (Claude avec PubMed et Consensus, ou toute IA
// avec recherche web) : on exporte un prompt, l'administrateur colle la
// réponse JSON, on en montre l'aperçu puis on l'applique. Trois choses sont
// demandées : l'actualité de chaque information, les études et auteurs clés
// (ce qu'un jury d'oral peut demander de citer) et l'historique des
// pratiques — rarement dans les livres, d'où ce passage par la littérature.
// La réponse ne contient que les changements. Pur (pas d'accès base) : les
// actions serveur (actions/fiche-verification.ts) chargent et écrivent.

import { normalizeContent, MERGE_BLOCK_TYPES } from "./merge/schemas";
import { blockPromptText, blockLabel } from "./merge/prompts";
import type { BlockContent, BlockType, Citation } from "./types";

export interface VerifiableFiche {
  ficheId: string;
  title: string;
  summary: string;
  blocks: { id: string; blockType: BlockType; content: BlockContent }[];
  flashcards: { id: string; front: string; back: string }[];
}

/** Short fingerprint of the fiches' structure: an answer built on another version of them is refused. */
export function verificationVersion(fiches: VerifiableFiche[]): string {
  let h = 0x811c9dc5;
  const text = fiches.map((f) => [f.ficheId, ...f.blocks.map((b) => b.id), "|", ...f.flashcards.map((c) => c.id)].join(",")).join(";");
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const fAlias = (i: number) => `F${i + 1}`;
const bAlias = (fi: number, i: number) => `F${fi + 1}.B${i + 1}`;
const kAlias = (fi: number, i: number) => `F${fi + 1}.K${i + 1}`;

export function buildVerificationPrompt(scope: { label: string; fiches: VerifiableFiche[] }, today: string): string {
  const body = {
    version: verificationVersion(scope.fiches),
    fiches: scope.fiches.map((f, fi) => ({
      id: fAlias(fi),
      titre: f.title,
      chapeau: f.summary,
      blocs: f.blocks.map((b, i) => ({ id: bAlias(fi, i), type: b.blockType, contenu: blockPromptText(b.blockType, b.content) })),
      cartes: f.flashcards.map((c, i) => ({ id: kAlias(fi, i), question: c.front, reponse: c.back })),
    })),
  };
  return `
Tu es relecteur expert en anesthésie-réanimation et tu m'aides à préparer l'examen oral final. Voici ${scope.label} d'un livre de révision (JSON plus bas). Nous sommes le ${today}.

Utilise tes outils de recherche — PubMed et Consensus si tu y as accès, sinon une recherche web — pour trois choses :

1. ACTUALITÉ. Vérifie que chaque information est exacte et à jour selon les recommandations et la littérature les plus récentes (sociétés savantes : SFAR, ESAIC, ASA, DAS, ERC/ILCOR, ESC, KDIGO, Surviving Sepsis… ; méta-analyses et grands essais récents). Corrige ce qui est dépassé ou faux, ajoute ce qui manque d'important et de récent. Ne touche pas à ce qui est juste.

2. ÉTUDES ET AUTEURS CLÉS. Pour chaque fiche, les grandes études et les auteurs qu'un jury peut demander de citer : ceux qui ont fondé la pratique actuelle ET ceux sur lesquels reposaient les pratiques anciennes (essais majeurs, cohortes, méta-analyses, recommandations, noms attachés à une technique, un score, un signe ou une classification). Un bloc "etudes_cles" en tableau — Étude (acronyme) ou auteurs | Année | Revue | Ce qu'elle a montré (chiffres clés) | Ce que ça a changé — avec ce qui compte vraiment pour le sujet (3 à 8 lignes), du plus ancien au plus récent. S'il existe déjà, complète-le plutôt que d'en créer un second.

3. HISTORIQUE. Comment on faisait avant et pourquoi on ne le fait plus : quelle étude, quel accident ou quelle recommandation a fait changer la pratique, et quand. Un bloc "historique" en texte (chronologie courte, une ligne « • année : … » par étape), seulement quand il y a une vraie évolution à raconter.

Règles de rigueur — une fausse référence est pire qu'une absence :
- Chaque étude, auteur ou recommandation que tu cites doit avoir été retrouvé avec un outil : donne son PMID (PubMed) ou son DOI dans "references". N'invente jamais une référence, un auteur, une année, une revue ni un chiffre ; si tu ne retrouves pas une étude, ne la cite pas.
- Toute modification a une "note" : ce qui a changé et pourquoi, en une ou deux phrases.
- Ne supprime un bloc ou une carte que s'il est devenu faux, en le disant dans la note.
- Style : français, texte brut (ni Markdown ni astérisques), puces « • », un intertitre court ("heading") pour chaque bloc ajouté.
- Ajoute des flashcards pour l'oral : une par étude ou auteur clé (« Quelle étude a montré… ? », « Qui a décrit… ? ») et une par évolution de pratique (« Pourquoi a-t-on abandonné… ? »), avec leurs références.

Réponds UNIQUEMENT par un objet JSON valide, dans un bloc \`\`\`json, qui ne contient que les CHANGEMENTS (rien pour ce qui reste tel quel) :
{
  "version": "${body.version}",
  "resume": "ce qui a changé, en quelques lignes",
  "modifications": [
    { "action": "modifier", "bloc": "F1.B3", "heading": "…", "contenu": { "text": "…" }, "note": "…", "references": [{ "titre": "Auteur et al., Revue Année", "pmid": "12345678", "doi": "10.…" }] },
    { "action": "ajouter", "fiche": "F1", "apres": "F1.B5", "type": "etudes_cles", "heading": "Études et auteurs clés", "contenu": { "headers": ["Étude ou auteurs", "Année", "Revue", "Ce qu'elle a montré", "Ce que ça a changé"], "rows": [["…", "…", "…", "…", "…"]] }, "note": "…", "references": [] },
    { "action": "ajouter", "fiche": "F1", "apres": "fin", "type": "historique", "heading": "…", "contenu": { "text": "• … : …" }, "note": "…", "references": [] },
    { "action": "supprimer", "bloc": "F1.B7", "note": "raison et référence" },
    { "action": "modifier_carte", "carte": "F1.K2", "question": "…", "reponse": "…", "note": "…", "references": [] },
    { "action": "ajouter_carte", "fiche": "F1", "question": "…", "reponse": "…", "references": [] },
    { "action": "supprimer_carte", "carte": "F1.K4", "note": "…" }
  ]
}
"apres" : identifiant du bloc après lequel insérer, "debut" ou "fin" ("fin" = juste avant le bloc « À retenir »). Types de bloc possibles : ${MERGE_BLOCK_TYPES.join(", ")}. Contenu d'un bloc : {"text": "…"} ; tableau : {"headers": […], "rows": [[…]]} ; étapes : {"steps": [{"label": "…", "detail": "…", "condition": "…"}]}.

${scope.fiches.length > 1 ? "Les fiches" : "La fiche"} :
${JSON.stringify(body, null, 2)}
`.trim();
}

// -- Reading the answer -----------------------------------------------------

export interface VerificationReference {
  label: string;
  title: string;
  url: string | null;
}

export interface FicheChanges {
  ficheId: string;
  updates: { id: string; content: BlockContent; note: string; refs: VerificationReference[] }[];
  inserts: { after: string | "debut" | "fin"; blockType: BlockType; content: BlockContent; note: string; refs: VerificationReference[] }[];
  removes: { id: string; note: string }[];
  cardUpdates: { id: string; front: string; back: string; note: string; refs: VerificationReference[] }[];
  cardAdds: { front: string; back: string; note: string; refs: VerificationReference[] }[];
  cardRemoves: { id: string; note: string }[];
}

export interface VerificationChanges {
  summary: string;
  fiches: FicheChanges[];
  /** What couldn't be used: unknown ids, empty contents… shown in the preview. */
  skipped: string[];
  referencesWithoutId: number;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const text = (fenced ? fenced[1] : raw).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("aucun objet JSON trouvé");
  return JSON.parse(text.slice(start, end + 1));
}

/** "Baillard C et al., Anesthesiology 2005" → "Baillard 2005"; "POISE (Devereaux…), NEJM 2008" → "POISE 2008". */
export function referenceLabel(title: string, fallback: string): string {
  const first = title.split(/[\s,.(]/).find(Boolean) ?? "";
  const year = /\b(1[89]\d\d|20\d\d)\b/.exec(title)?.[1];
  const label = [first, year].filter(Boolean).join(" ");
  return label || fallback;
}

export function normalizeReferences(raw: unknown): VerificationReference[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const ref = (r ?? {}) as { titre?: unknown; title?: unknown; pmid?: unknown; doi?: unknown; url?: unknown };
      const title = str(ref.titre) || str(ref.title);
      const pmid = str(ref.pmid).replace(/\D/g, "");
      const doi = str(ref.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
      const link = str(ref.url);
      const url = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : doi.startsWith("10.") ? `https://doi.org/${doi}` : /^https?:\/\//.test(link) ? link : null;
      if (!title && !url) return null;
      return { label: referenceLabel(title, pmid ? `PMID ${pmid}` : "Référence"), title: title || url!, url };
    })
    .filter((r): r is VerificationReference => r !== null);
}

export function parseVerification(raw: string, fiches: VerifiableFiche[]): { ok: true; changes: VerificationChanges } | { ok: false; error: string } {
  let data: Record<string, unknown>;
  try {
    data = extractJson(raw) as Record<string, unknown>;
  } catch (err) {
    return { ok: false, error: `Réponse illisible : ${err instanceof Error ? err.message : "JSON invalide"}.` };
  }
  const version = str(data.version) || str(data.fiche_version);
  if (version && version !== verificationVersion(fiches))
    return { ok: false, error: "Les fiches ont changé depuis l'export (blocs ou cartes ajoutés, supprimés ou déplacés) : exportez-les de nouveau." };

  const blockIndex = new Map<string, { fi: number; id: string; type: BlockType; content: BlockContent }>();
  const cardIndex = new Map<string, { fi: number; id: string }>();
  fiches.forEach((f, fi) => {
    f.blocks.forEach((b, i) => blockIndex.set(bAlias(fi, i), { fi, id: b.id, type: b.blockType, content: b.content }));
    f.flashcards.forEach((c, i) => cardIndex.set(kAlias(fi, i), { fi, id: c.id }));
  });
  const ficheOf = (alias: string) => {
    const m = /^F(\d+)$/i.exec(alias);
    const fi = m ? Number(m[1]) - 1 : fiches.length === 1 ? 0 : -1;
    return fi >= 0 && fi < fiches.length ? fi : -1;
  };

  const out: FicheChanges[] = fiches.map((f) => ({ ficheId: f.ficheId, updates: [], inserts: [], removes: [], cardUpdates: [], cardAdds: [], cardRemoves: [] }));
  const skipped: string[] = [];
  let referencesWithoutId = 0;
  const refsOf = (m: { references?: unknown }) => {
    const refs = normalizeReferences(m.references);
    referencesWithoutId += refs.filter((r) => !r.url).length;
    return refs;
  };
  const withHeading = (content: BlockContent | null, heading: string) => (content && heading ? ({ ...content, heading } as BlockContent) : content);

  for (const entry of Array.isArray(data.modifications) ? data.modifications : []) {
    const m = (entry ?? {}) as Record<string, unknown>;
    const action = str(m.action).toLowerCase();
    const note = str(m.note);
    if (action === "modifier") {
      const target = blockIndex.get(str(m.bloc).toUpperCase());
      if (!target) {
        skipped.push(`Bloc inconnu : ${str(m.bloc) || "?"}`);
        continue;
      }
      const existingHeading = (target.content as { heading?: string }).heading ?? "";
      const content = withHeading(normalizeContent(target.type, m.contenu), str(m.heading) || existingHeading);
      if (!content) {
        skipped.push(`Contenu vide ou mal formé pour ${str(m.bloc)}`);
        continue;
      }
      out[target.fi].updates.push({ id: target.id, content, note, refs: refsOf(m) });
    } else if (action === "ajouter") {
      const fi = ficheOf(str(m.fiche).toUpperCase());
      const type = MERGE_BLOCK_TYPES.includes(str(m.type) as BlockType) ? (str(m.type) as BlockType) : "texte_libre";
      const content = withHeading(normalizeContent(type, m.contenu), str(m.heading));
      if (fi === -1 || !content) {
        skipped.push(`Ajout ignoré (${fi === -1 ? "fiche inconnue" : "contenu vide"}) : ${str(m.heading) || type}`);
        continue;
      }
      const afterAlias = str(m.apres).toUpperCase();
      const after = afterAlias === "DEBUT" || afterAlias === "DÉBUT" ? "debut" : blockIndex.get(afterAlias)?.fi === fi ? blockIndex.get(afterAlias)!.id : "fin";
      out[fi].inserts.push({ after, blockType: type, content, note, refs: refsOf(m) });
    } else if (action === "supprimer") {
      const target = blockIndex.get(str(m.bloc).toUpperCase());
      if (target) out[target.fi].removes.push({ id: target.id, note });
      else skipped.push(`Bloc inconnu : ${str(m.bloc) || "?"}`);
    } else if (action === "modifier_carte") {
      const target = cardIndex.get(str(m.carte).toUpperCase());
      const front = str(m.question);
      const back = str(m.reponse);
      if (!target || !front || !back) {
        skipped.push(`Carte ignorée : ${str(m.carte) || "?"}`);
        continue;
      }
      out[target.fi].cardUpdates.push({ id: target.id, front, back, note, refs: refsOf(m) });
    } else if (action === "ajouter_carte") {
      const fi = ficheOf(str(m.fiche).toUpperCase());
      const front = str(m.question);
      const back = str(m.reponse);
      if (fi === -1 || !front || !back) {
        skipped.push(`Carte ajoutée ignorée : ${front || "?"}`);
        continue;
      }
      out[fi].cardAdds.push({ front, back, note, refs: refsOf(m) });
    } else if (action === "supprimer_carte") {
      const target = cardIndex.get(str(m.carte).toUpperCase());
      if (target) out[target.fi].cardRemoves.push({ id: target.id, note });
      else skipped.push(`Carte inconnue : ${str(m.carte) || "?"}`);
    } else if (action) skipped.push(`Action inconnue : ${action}`);
  }
  return { ok: true, changes: { summary: str(data.resume), fiches: out, skipped, referencesWithoutId } };
}

/**
 * The fiche's blocks in their new order: kept and updated blocks where they
 * were, additions after their anchor ("fin" = just before the closing « À
 * retenir »), removed ones left out.
 */
export function orderAfterChanges(currentIds: string[], blockTypeOf: (id: string) => BlockType | undefined, changes: FicheChanges): (string | { insert: number })[] {
  const removed = new Set(changes.removes.map((r) => r.id));
  const kept = currentIds.filter((id) => !removed.has(id));
  const out: (string | { insert: number })[] = [];
  changes.inserts.forEach((ins, i) => {
    if (ins.after === "debut") out.push({ insert: i });
  });
  let tail = kept.length;
  while (tail > 0 && blockTypeOf(kept[tail - 1]) === "a_retenir") tail--;
  kept.forEach((id, index) => {
    if (index === tail) changes.inserts.forEach((ins, i) => ins.after === "fin" && ins.blockType !== "a_retenir" && out.push({ insert: i }));
    out.push(id);
    changes.inserts.forEach((ins, i) => ins.after === id && out.push({ insert: i }));
  });
  if (tail === kept.length) changes.inserts.forEach((ins, i) => ins.after === "fin" && ins.blockType !== "a_retenir" && out.push({ insert: i }));
  changes.inserts.forEach((ins, i) => ins.after === "fin" && ins.blockType === "a_retenir" && out.push({ insert: i }));
  // An anchor that was itself removed: the addition goes before « À retenir ».
  const placed = new Set(out.filter((x): x is { insert: number } => typeof x !== "string").map((x) => x.insert));
  changes.inserts.forEach((_, i) => {
    if (placed.has(i)) return;
    const at = out.findIndex((x) => typeof x === "string" && blockTypeOf(x) === "a_retenir");
    out.splice(at === -1 ? out.length : at, 0, { insert: i });
  });
  return out;
}

/** The citations a change brings: its note (« Actualisation », in the chip's tooltip) and its references (chips that open PubMed / the DOI). */
export function changeCitations(note: string, refs: VerificationReference[], month: string): Citation[] {
  const out: Citation[] = [];
  if (note) out.push({ page: 0, quote: note, bookTitle: `Actualisation ${month}`, chapterTitle: note });
  for (const r of refs) out.push({ page: 0, quote: r.title, bookTitle: r.label, ...(r.url ? { url: r.url } : {}) });
  return out;
}

/** One line per change, for the preview shown before applying. */
export function describeChanges(changes: VerificationChanges, fiches: VerifiableFiche[]): string[] {
  const lines: string[] = [];
  const many = fiches.length > 1;
  changes.fiches.forEach((c, fi) => {
    const f = fiches[fi];
    const where = many ? `« ${f.title} » — ` : "";
    const blockLabelOf = (id: string) => {
      const i = f.blocks.findIndex((b) => b.id === id);
      return i === -1 ? "bloc" : `${blockLabel(f.blocks[i].blockType)} n° ${i + 1}`;
    };
    const refs = (r: VerificationReference[]) => (r.length ? ` [${r.map((x) => x.label).join(", ")}]` : "");
    for (const u of c.updates) lines.push(`${where}Modifié — ${blockLabelOf(u.id)}${u.note ? ` : ${u.note}` : ""}${refs(u.refs)}`);
    for (const a of c.inserts) lines.push(`${where}Ajouté — ${blockLabel(a.blockType)}${(a.content as { heading?: string }).heading ? ` « ${(a.content as { heading?: string }).heading} »` : ""}${a.note ? ` : ${a.note}` : ""}${refs(a.refs)}`);
    for (const r of c.removes) lines.push(`${where}Supprimé — ${blockLabelOf(r.id)}${r.note ? ` : ${r.note}` : ""}`);
    for (const u of c.cardUpdates) lines.push(`${where}Carte modifiée — ${u.front}${u.note ? ` (${u.note})` : ""}`);
    for (const a of c.cardAdds) lines.push(`${where}Carte ajoutée — ${a.front}${refs(a.refs)}`);
    for (const r of c.cardRemoves) lines.push(`${where}Carte supprimée${r.note ? ` : ${r.note}` : ""}`);
  });
  return lines;
}
