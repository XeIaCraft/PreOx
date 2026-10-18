// Prompts of the five fusion stages (plan → répartition → chapitres →
// fiches → rattrapage). The fiche prompt carries the user's brief, in
// priority order: no information lost, contradictions quoted book by book,
// a reading flow built for learning, a closing « à retenir », suggested
// illustrations, merged flashcards. Ids in the prompts are short aliases
// (F12, B3, K7) given per task, never uuids — cheaper and far less often
// mistyped by the model.

import { BLOCK_TYPES_DOC, EXPERT_READER_CONTEXT, FLASHCARD_QUALITY_DOC, STRICT_ARRAY_FORMAT_RULE } from "../prompts";
import type { BlockContent, BlockType, ProtocolBlockContent, TableBlockContent } from "../types";
import type { SourceFicheRef } from "./types";

const MERGE_LANGUAGE_RULE = `
Langue : tout ce que tu écris (titres, intertitres, texte des blocs, cartes) est en FRANÇAIS, même quand une source est en anglais — traduis fidèlement, avec la terminologie médicale française standard (garde entre parenthèses le terme anglais consacré quand il est utile, ex. « bloc du plan du muscle érecteur du rachis (ESP block) »).
`.trim();

const MERGE_BLOCK_TYPES_DOC = `${BLOCK_TYPES_DOC}
- "divergence" : point sur lequel les livres sources se contredisent — nomme le point de désaccord puis ce que dit CHAQUE livre, nommément (« • Miller : … » / « • Morgan : … »)
- "a_retenir" : les points à savoir par cœur, en fin de fiche`;

const BLOCK_LABEL: Record<string, string> = {
  definition_mecanisme: "Définition / mécanisme",
  valeurs_seuils: "Valeurs & seuils",
  tableau_comparatif: "Tableau",
  protocole_paliers: "Protocole",
  mnemotechnique: "Mnémotechnique",
  perle_clinique: "Perle clinique",
  piege_erreur: "Piège",
  formule: "Formule",
  texte_libre: "Note",
  divergence: "Divergence",
  a_retenir: "À retenir",
};

/** Plain-text rendering of any block for a prompt — tables and protocols keep their structure (and protocol conditions, unlike blockToPlainText). */
export function blockPromptText(blockType: BlockType | string, content: BlockContent): string {
  const heading = (content as { heading?: string }).heading;
  const prefix = heading ? `${heading} — ` : "";
  if (blockType === "tableau_comparatif" && "rows" in content) {
    const c = content as TableBlockContent;
    return `${prefix}tableau\n  ${(c.headers ?? []).join(" | ")}\n${(c.rows ?? []).map((r) => `  ${r.join(" | ")}`).join("\n")}`;
  }
  if (blockType === "protocole_paliers" && "steps" in content) {
    const c = content as ProtocolBlockContent;
    return `${prefix}étapes\n${(c.steps ?? []).map((s, i) => `  ${i + 1}. ${s.label} — ${s.detail}${s.condition ? ` (si : ${s.condition})` : ""}`).join("\n")}`;
  }
  return `${prefix}${(content as { text?: string }).text ?? ""}`;
}

export function blockLabel(blockType: string): string {
  return BLOCK_LABEL[blockType] ?? blockType;
}

// -- 1. Plan ----------------------------------------------------------------

export function buildPlanPrompt(bookTitle: string, catalog: { books: { title: string }[]; text: string; ficheCount: number }, targetChapters: number): string {
  return `
Tu conçois la table des matières d'un livre de révision unique, « ${bookTitle} », qui fusionne ces livres de référence : ${catalog.books.map((b) => `« ${b.title} »`).join(", ")}. Les fiches de ces livres seront ensuite réparties dans tes chapitres puis fusionnées sujet par sujet — ton plan est ce qui décidera de l'ordre dans lequel le lecteur apprendra tout ce contenu.

${EXPERT_READER_CONTEXT}

Pense le plan pour l'apprentissage, la rétention et la pédagogie :
- Structure à trois niveaux : parties → sous-parties → chapitres (les fiches seront définies plus tard, à l'intérieur de chaque chapitre). Une sous-partie peut avoir un titre vide quand une partie n'a pas besoin d'être subdivisée.
- Progression du fondamental vers l'appliqué : bases (physiologie, pharmacologie, physique, monitorage) avant les techniques, les techniques avant les terrains, les spécialités et les situations particulières ; urgence, réanimation et complications regroupées de façon logique. Chaque chapitre s'appuie sur ce qui précède.
- Regroupe par SUJET ce que les livres traitent à des endroits différents : un sujet n'a qu'un seul chapitre, jamais deux chapitres qui se recouvrent.
- Chaque chapitre a un titre clair et un "scope" d'une à deux phrases qui délimite précisément ce qui y entre (et, si utile, ce qui n'y entre pas) : c'est la seule chose qui servira ensuite à y ranger les fiches sources sans hésitation.
- Taille : environ ${targetChapters} chapitres au total pour ${catalog.ficheCount} fiches sources (5 à 40 fiches par chapitre) ; 2 à 8 chapitres par sous-partie ; 6 à 20 parties.
- Couvre TOUT le contenu listé ci-dessous : aucune fiche source ne doit rester sans chapitre où aller.
- Titres en français.

${STRICT_ARRAY_FORMAT_RULE}

Contenu des livres (chapitre d'origine : titres des fiches) :

${catalog.text}
`.trim();
}

/** "Livre / chapitre : fiche · fiche · …" — the plan only needs to see what exists, not the content. */
export function buildCatalogText(books: { id: string; title: string }[], fiches: SourceFicheRef[]): string {
  const lines: string[] = [];
  for (const book of books) {
    const own = fiches.filter((f) => f.bookId === book.id);
    if (own.length === 0) continue;
    lines.push(`Livre « ${book.title} » (${own.length} fiches)`);
    let current = "";
    let titles: string[] = [];
    const flush = () => {
      if (current) lines.push(`  ${current} : ${titles.join(" · ")}`);
    };
    for (const f of own) {
      if (f.chapterTitle !== current) {
        flush();
        current = f.chapterTitle;
        titles = [];
      }
      titles.push(f.title);
    }
    flush();
    lines.push("");
  }
  return lines.join("\n").trim();
}

// -- 2. Répartition ---------------------------------------------------------

export interface PromptChapter {
  key: string;
  path: string;
  title: string;
  scope: string;
}

export function buildAssignPrompt(bookTitle: string, chapters: PromptChapter[], fiches: { alias: string; ref: SourceFicheRef }[]): string {
  return `
Tu ranges des fiches sources dans la table des matières du livre de révision « ${bookTitle} », qui fusionne plusieurs livres.

Règles :
- Chaque fiche va dans exactement UN chapitre : celui dont le périmètre ("scope") lui correspond le mieux, le plus spécifique possible — d'après son titre, son résumé et son chapitre d'origine.
- Réponds pour TOUTES les fiches listées (${fiches.length}), avec leurs identifiants exacts (ex. "F3") et la clé exacte du chapitre (ex. "C12").

${STRICT_ARRAY_FORMAT_RULE}

Table des matières :
${chapters.map((c) => `${c.key} — ${c.path ? `${c.path} > ` : ""}${c.title} : ${c.scope}`).join("\n")}

Fiches à ranger :
${fiches.map(({ alias, ref }) => `${alias} — [${ref.bookTitle} / ${ref.chapterTitle}] ${ref.title}${ref.summary ? ` — ${ref.summary}` : ""}`).join("\n")}
`.trim();
}

// -- 3. Chapitre ------------------------------------------------------------

export function buildChapterPrompt(
  bookTitle: string,
  chapter: { path: string; title: string; scope: string; neighbours: string[] },
  fiches: { alias: string; ref: SourceFicheRef }[]
): string {
  return `
Tu organises le chapitre « ${chapter.title} » du livre de révision « ${bookTitle} », qui fusionne plusieurs livres de référence.
Place dans le livre : ${chapter.path || "—"}. Périmètre : ${chapter.scope}
${chapter.neighbours.length ? `Chapitres voisins (leur contenu n'est pas à traiter ici) : ${chapter.neighbours.join(" · ")}.` : ""}

${EXPERT_READER_CONTEXT}

Voici les fiches sources rangées dans ce chapitre, venant de livres différents. Définis la liste ORDONNÉE des fiches du chapitre fusionné :
- Une fiche = un sujet cohérent qu'on apprend d'une traite (un médicament, une technique, une pathologie, un mécanisme, une situation clinique). Réunis dans une même fiche les fiches sources de livres différents qui traitent du même sujet : c'est le cœur de la fusion.
- Une fiche source qui couvre plusieurs sujets peut alimenter plusieurs fiches : liste-la dans chacune.
- Ordre pédagogique : ce qu'il faut comprendre d'abord vient d'abord (généralités et mécanismes, puis applications, puis situations particulières et complications).
- Taille : une fiche fusionnée réunit en général 1 à 6 fiches sources ; au-delà, découpe le sujet en sous-sujets cohérents.
- Chaque fiche source listée (${fiches.length}) doit apparaître dans au moins une fiche, avec son identifiant exact (ex. "F3").
- Titre : le nom du sujet, précis, en français. Objectif : une phrase.

${STRICT_ARRAY_FORMAT_RULE}

Fiches sources :
${fiches
  .map(({ alias, ref }) => `${alias} — [${ref.bookTitle} / ${ref.chapterTitle}] ${ref.title} (${ref.blockCount} blocs, ${ref.cardCount} cartes)${ref.summary ? ` — ${ref.summary}` : ""}`)
  .join("\n")}
`.trim();
}

// -- 4. Fiche ---------------------------------------------------------------

export interface PromptSourceFiche {
  alias: string;
  bookTitle: string;
  chapterTitle: string;
  title: string;
  blocks: { alias: string; blockType: string; content: BlockContent; pages: number[]; image: string | null }[];
  cards: { alias: string; front: string; back: string }[];
}

function sourceFicheText(f: PromptSourceFiche): string {
  const lines = [`=== ${f.alias} — « ${f.bookTitle} » — chapitre « ${f.chapterTitle} » — fiche « ${f.title} »`];
  for (const b of f.blocks) {
    const pages = b.pages.length ? ` · p. ${b.pages.join(", ")}` : "";
    lines.push(`[${b.alias}] ${blockLabel(b.blockType)}${pages} : ${blockPromptText(b.blockType, b.content)}`);
    if (b.image) lines.push(`[${b.alias}] [illustration : ${b.image}]`);
  }
  if (f.cards.length) {
    lines.push("Cartes :");
    for (const c of f.cards) lines.push(`[${c.alias}] Q : ${c.front} — R : ${c.back}`);
  }
  return lines.join("\n");
}

export function buildFichePrompt(
  context: { bookTitle: string; path: string; chapterTitle: string; title: string; objective: string; siblings: string[] },
  sources: PromptSourceFiche[]
): string {
  const bookNames = [...new Set(sources.map((s) => s.bookTitle))];
  return `
Tu rédiges UNE fiche du livre de révision « ${context.bookTitle} », qui fusionne plusieurs livres de référence d'anesthésie-réanimation. Cette fiche remplace, pour le lecteur, les fiches sources ci-dessous (${bookNames.map((b) => `« ${b} »`).join(", ")}) : après l'avoir lue, il ne doit plus jamais avoir besoin de relire les sources.

${EXPERT_READER_CONTEXT}

Place de la fiche : ${context.path ? `${context.path} > ` : ""}chapitre « ${context.chapterTitle} » — fiche « ${context.title} ». Objectif : ${context.objective}
${context.siblings.length ? `Autres fiches du chapitre (elles ont leur propre fiche : ne développe pas leur sujet ici, sauf ce que les sources de CETTE fiche en disent) : ${context.siblings.join(" · ")}.` : ""}

Exigences, par ordre de priorité :

1. ZÉRO PERTE D'INFORMATION. Chaque fait, chiffre, dose, unité, seuil, condition, exception, nuance, mécanisme, comparaison, incidence et référence présent dans les blocs sources se retrouve dans ta fiche — reformulé et regroupé, jamais omis, jamais arrondi. Quand deux sources disent la même chose, dis-le une fois (et liste les deux blocs dans "source_block_ids"). Quand l'une est plus détaillée, garde le détail. Dans le doute, garde. La fiche fusionnée est au moins aussi complète que la plus complète des sources — en pratique plus, puisqu'elle les additionne. N'ajoute aucun fait absent des sources.

2. CONTRADICTIONS. Si les sources divergent (dose, seuil, indication, recommandation, définition, chiffre…), ne tranche jamais en silence : écris un bloc "divergence" qui nomme le point de désaccord puis ce que dit chaque livre, nommément et avec ses nuances (« • ${bookNames[0] ?? "Livre A"} : … » / « • ${bookNames[1] ?? "Livre B"} : … »), et, si une source le précise, laquelle est la plus récente ou fait référence aujourd'hui. Une simple différence de niveau de détail n'est pas une divergence : additionne, ne l'oppose pas.

3. LISIBILITÉ ET PÉDAGOGIE. Le confort de lecture d'un Morgan ou d'un Albrecht avec l'exhaustivité d'un Miller : un déroulé logique, du « quoi » au « pourquoi » puis au « comment » — définition et contexte → mécanisme / physiologie / physiopathologie → données chiffrées (pharmacologie, valeurs, seuils) → clinique (indications, contre-indications, diagnostic) → conduite pratique (protocole, étapes) → pièges et perles → divergences → à retenir. Adapte cet ordre au sujet. Des blocs courts, une idée par bloc, chacun avec un intertitre ("heading") court et parlant. Des phrases complètes, claires et précises ; des listes à puces « • » pour les énumérations ; un tableau (headers + rows) dès que plusieurs éléments se comparent sur les mêmes critères ; "protocole_paliers" pour une séquence d'étapes. Texte brut : ni Markdown, ni astérisques, ni dièses (sauts de ligne autorisés).

4. À RETENIR. Termine par exactement UN bloc "a_retenir" : 5 à 12 points « • » à savoir par cœur (chiffres clés, doses, seuils, red flags, conduite immédiate, pièges) — uniquement des informations déjà écrites plus haut dans la fiche ; "source_block_ids" = les blocs sources d'où viennent ces points.

5. ILLUSTRATIONS. Sur chaque bloc qu'une figure rendrait nettement plus clair (anatomie, courbe, schéma de mécanisme, algorithme, montage, échographie), renseigne "suggested_image.what" en décrivant précisément l'image à placer là (ex. « Courbe de dissociation de l'hémoglobine : déplacements par la température, le pH et le 2,3-DPG ») et, quand un bloc source a une illustration ou cite la page où son livre en montre une, "suggested_image.source_block_id". Un bloc source suivi de [illustration : …] a déjà une image : reprends-la sur le bloc fusionné le plus pertinent avec "reuse_image_from" (chaque illustration source reprise une fois, aucune perdue). Rien de décoratif : 0 à 4 suggestions selon le sujet.

6. TRAÇABILITÉ. "source_block_ids" de chaque bloc liste TOUS les blocs sources (identifiants entre crochets, ex. "B12") dont il reprend du contenu : c'est ce qui permet au lecteur de cliquer pour ouvrir la page du PDF d'origine, et de vérifier que rien n'a été perdu. Chaque bloc source apparaît dans au moins un bloc.

7. FLASHCARDS. Fusionne les cartes sources : deux cartes (même de livres différents) qui testent le même fait n'en font qu'une, qui garde la réponse la plus complète et les nuances de chacune ; des cartes qui testent des faits différents restent distinctes ; reformule pour la qualité. "source_flashcard_ids" liste les cartes sources fusionnées dans chaque carte (ex. "K4") : chaque carte source apparaît dans exactement une carte. Ajoute des cartes nouvelles ("source_flashcard_ids" vide) pour les points du bloc "a_retenir" et les divergences qui ne sont pas déjà testés.
${FLASHCARD_QUALITY_DOC}

"summary" : chapeau de une à deux phrases qui situe la fiche.

${MERGE_LANGUAGE_RULE}

${STRICT_ARRAY_FORMAT_RULE}

Types de blocs :
${MERGE_BLOCK_TYPES_DOC}

Fiches sources :

${sources.map(sourceFicheText).join("\n\n")}
`.trim();
}

// -- 5. Rattrapage ----------------------------------------------------------

export function buildRepairPrompt(
  context: { bookTitle: string; chapterTitle: string; title: string },
  current: { index: number; blockType: string; content: BlockContent }[],
  missing: { alias: string; bookTitle: string; blockType: string; content: BlockContent }[]
): string {
  return `
Fiche « ${context.title} » (chapitre « ${context.chapterTitle} », livre de révision « ${context.bookTitle} », fusion de plusieurs livres). Le contrôle de couverture a trouvé des blocs sources dont le contenu n'a PAS été repris dans la fiche. Intègre CHAQUE information manquante, sans rien retirer de l'existant :
- soit en remplaçant un bloc existant par une version enrichie ("replacements" : son numéro, son contenu complet réécrit — même forme que le bloc d'origine : texte, tableau ou étapes —, et les blocs sources ajoutés) ;
- soit en insérant un nouveau bloc au bon endroit du déroulé ("insertions" : après quel numéro de bloc, -1 pour la tête ; jamais après le bloc « À retenir » final).
Si l'information d'un bloc source est en réalité déjà entièrement présente dans un bloc de la fiche, ne la répète pas : indique-le dans "already_covered" (identifiant du bloc source et numéro du bloc qui la contient). Si un bloc source contredit la fiche, ajoute ou complète un bloc "divergence" qui cite ce que dit chaque livre. N'ajoute aucun fait absent des sources. Chaque bloc source listé doit finir dans "replacements", "insertions" ou "already_covered".

${MERGE_LANGUAGE_RULE}

${STRICT_ARRAY_FORMAT_RULE}

Fiche actuelle :
${current.map((b) => `#${b.index} ${blockLabel(b.blockType)} : ${blockPromptText(b.blockType, b.content)}`).join("\n")}

Blocs sources à intégrer :
${missing.map((m) => `[${m.alias}] « ${m.bookTitle} » — ${blockLabel(m.blockType)} : ${blockPromptText(m.blockType, m.content)}`).join("\n")}
`.trim();
}
