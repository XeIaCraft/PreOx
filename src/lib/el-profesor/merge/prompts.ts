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

export function buildPlanPrompt(bookTitle: string, catalog: { books: { title: string }[]; text: string; ficheCount: number }, targetSubParts: number): string {
  return `
Tu conçois la table des matières d'un livre de révision unique, « ${bookTitle} », qui fusionne ces livres de référence : ${catalog.books.map((b) => `« ${b.title} »`).join(", ")}. Les fiches de ces livres seront ensuite rangées dans tes sous-parties, organisées en chapitres puis fusionnées sujet par sujet : ton plan décide de l'ordre dans lequel le lecteur apprendra tout ce contenu.

${EXPERT_READER_CONTEXT}

Conçois les PARTIES et leurs SOUS-PARTIES (les chapitres et les fiches seront définis ensuite, dans chaque sous-partie, à partir de son contenu réel) :
- Une progression pensée pour apprendre et retenir, du fondamental vers l'appliqué : sciences de base (physiologie, pharmacologie, physique, monitorage) avant les techniques (voies aériennes, anesthésie générale, anesthésie locorégionale…), les techniques avant les terrains et les spécialités (pédiatrie, obstétrique, cardiaque…), puis urgences, réanimation et complications. Chaque sous-partie s'appuie sur ce qui précède.
- Regroupe par SUJET ce que les livres traitent à des endroits différents : un sujet n'a qu'une seule sous-partie, jamais deux sous-parties qui se recouvrent.
- Chaque sous-partie a un titre clair et un "scope" d'une à deux phrases qui délimite précisément ce qui y entre (et, si utile, ce qui n'y entre pas) : c'est la seule chose qui servira à y ranger les fiches sans hésiter.
- Taille : environ ${targetSubParts} sous-parties pour ${catalog.ficheCount} fiches sources (une centaine de fiches chacune, entre 30 et 200) ; 6 à 20 parties.
- Couvre TOUT le contenu listé ci-dessous : aucune fiche ne doit rester sans sous-partie où aller.
- Titres en français, concis, comme dans un vrai manuel, sans numérotation.

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

export interface PromptSubPart {
  key: string;
  path: string;
  scope: string;
}

export function buildAssignPrompt(bookTitle: string, subParts: PromptSubPart[], fiches: { alias: string; ref: SourceFicheRef }[]): string {
  return `
Tu ranges des fiches sources dans la table des matières du livre de révision « ${bookTitle} », qui fusionne plusieurs livres.

Règles :
- Chaque fiche va dans exactement UNE sous-partie : celle dont le périmètre ("scope") lui correspond le mieux, la plus spécifique possible — d'après son titre, son résumé et son chapitre d'origine.
- Réponds pour TOUTES les fiches listées (${fiches.length}), avec leurs identifiants exacts (ex. "F3") et la clé exacte de la sous-partie (ex. "S12").

${STRICT_ARRAY_FORMAT_RULE}

Table des matières :
${subParts.map((s) => `${s.key} — ${s.path} : ${s.scope}`).join("\n")}

Fiches à ranger :
${fiches.map(({ alias, ref }) => `${alias} — [${ref.bookTitle} / ${ref.chapterTitle}] ${ref.title}${ref.summary ? ` — ${ref.summary}` : ""}`).join("\n")}
`.trim();
}

// -- 3. Chapitres et fiches d'une sous-partie -------------------------------

const kchars = (n: number) => (n >= 1000 ? `≈ ${Math.round(n / 1000)} k car.` : `${n} car.`);

export function buildOutlinePrompt(
  bookTitle: string,
  subPart: { partTitle: string; title: string; scope: string; neighbours: string[] },
  fiches: { alias: string; ref: SourceFicheRef }[]
): string {
  return `
Tu organises la sous-partie « ${subPart.title || subPart.partTitle} »${subPart.title ? ` (partie « ${subPart.partTitle} »)` : ""} du livre de révision « ${bookTitle} », qui fusionne plusieurs livres de référence. Périmètre : ${subPart.scope}
${subPart.neighbours.length ? `Sous-parties voisines (leur contenu n'est pas à traiter ici) : ${subPart.neighbours.join(" · ")}.` : ""}

${EXPERT_READER_CONTEXT}

Voici les fiches sources rangées dans cette sous-partie, venant de livres différents. Organise-les en CHAPITRES, et chaque chapitre en FICHES fusionnées, dans l'ordre où il faut les apprendre :
- Un chapitre = un thème cohérent, en général 3 à 12 fiches. Ordonne les chapitres pour que chacun s'appuie sur les précédents.
- Une fiche fusionnée = un sujet qu'on apprend d'une traite (un médicament, une technique, une pathologie, un mécanisme, une situation clinique). Réunis dans une même fiche les fiches sources de livres différents qui traitent du même sujet : c'est le cœur de la fusion. Quand un livre découpe un sujet en plusieurs fiches pointues et qu'un autre le traite en une seule fiche large, suis le découpage le plus fin et cite la fiche large dans chacune des fiches qu'elle concerne (son contenu sera réparti entre elles).
- Dans un chapitre : d'abord ce qu'il faut comprendre (généralités, mécanismes), puis les applications, enfin les situations particulières et les complications.
- Taille : une fiche fusionnée réunit en général 1 à 6 fiches sources et au plus ≈ 45 k caractères de sources (la taille de chaque fiche est indiquée) ; au-delà, découpe le sujet en sous-sujets cohérents.
- Chaque fiche source listée (${fiches.length}) doit apparaître dans au moins une fiche, avec son identifiant exact (ex. "F3").
- Titres de chapitres et de fiches : le nom du sujet, précis, en français, sans numérotation. Objectif : une phrase.

${STRICT_ARRAY_FORMAT_RULE}

Fiches sources :
${fiches
  .map(({ alias, ref }) => `${alias} — [${ref.bookTitle} / ${ref.chapterTitle}] ${ref.title} (${ref.blockCount} blocs, ${ref.cardCount} cartes, ${kchars(ref.chars)})${ref.summary ? ` — ${ref.summary}` : ""}`)
  .join("\n")}
`.trim();
}

// -- 4. Fiche ---------------------------------------------------------------

export interface PromptSourceFiche {
  alias: string;
  bookTitle: string;
  chapterTitle: string;
  title: string;
  /** Titles of the other merged fiches that take the rest of a shared source fiche. */
  sharedWith: string[];
  blocks: { alias: string; blockType: string; content: BlockContent; pages: number[]; image: string | null }[];
  cards: { alias: string; front: string; back: string }[];
}

function sourceFicheText(f: PromptSourceFiche): string {
  const lines = [`=== ${f.alias} — « ${f.bookTitle} » — chapitre « ${f.chapterTitle} » — fiche « ${f.title} »`];
  if (f.sharedWith.length) lines.push(`(Fiche source large : seuls les passages sur ce sujet sont ici ; le reste est traité dans ${f.sharedWith.map((t) => `« ${t} »`).join(", ")}.)`);
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
${context.siblings.length ? `Autres fiches du chapitre, qui ont leur propre fiche : ${context.siblings.map((t) => `« ${t} »`).join(", ")}.` : ""}

Exigences, par ordre de priorité :

1. ZÉRO PERTE D'INFORMATION. Chaque fait, chiffre, dose, unité, seuil, condition, exception, nuance, mécanisme, comparaison, incidence et référence présent dans les blocs sources se retrouve dans ta fiche — reformulé et regroupé, jamais omis, jamais arrondi. Quand deux sources disent la même chose, dis-le une fois (et liste les deux blocs dans "source_block_ids"). Quand l'une est plus détaillée, garde le détail. Dans le doute, garde. La fiche fusionnée est au moins aussi complète que la plus complète des sources — en pratique plus, puisqu'elle les additionne. N'ajoute aucun fait absent des sources. Les valeurs chiffrées sont contrôlées automatiquement après coup : une valeur oubliée sera signalée.

2. CONTRADICTIONS. Si les sources divergent (dose, seuil, indication, recommandation, définition, chiffre…), ne tranche jamais en silence : écris un bloc "divergence", placé juste après le passage qu'il concerne, qui nomme le point de désaccord puis ce que dit chaque livre, nommément et avec ses nuances (« • ${bookNames[0] ?? "Livre A"} : … » / « • ${bookNames[1] ?? "Livre B"} : … »), et, si une source le précise, laquelle est la plus récente ou fait référence aujourd'hui. Une simple différence de niveau de détail n'est pas une divergence : additionne, ne l'oppose pas.

3. UNE LECTURE AGRÉABLE ET LOGIQUE. Écris comme un excellent manuel — le confort de lecture d'un Morgan ou d'un Albrecht, avec l'exhaustivité d'un Miller :
- Un fil conducteur, du « quoi » au « pourquoi » puis au « comment » : définition et contexte → mécanisme / physiologie / physiopathologie → données chiffrées (pharmacologie, valeurs, seuils) → clinique (indications, contre-indications, diagnostic) → conduite pratique (protocole, étapes) → situations particulières → pièges et perles → à retenir. Adapte cet ordre au sujet ; chaque bloc s'appuie sur le précédent.
- Des blocs courts : une idée par bloc, 40 à 160 mots ; au-delà, coupe en deux blocs. Chaque bloc a un intertitre ("heading") court qui dit ce qu'on y apprend (« Pourquoi la néostigmine échoue sur un bloc profond », pas « Remarque » ni « Généralités »).
- Explique : des phrases complètes et précises pour les mécanismes et les raisonnements — comprendre le pourquoi fait retenir ; des listes à puces « • » pour les énumérations (critères, effets indésirables, étapes courtes) ; jamais une fiche entièrement en puces.
- Un tableau (headers + rows) dès que plusieurs éléments se comparent sur les mêmes critères — c'est souvent la meilleure façon de réunir les données de plusieurs livres ; "protocole_paliers" pour une séquence d'étapes.
- Chaque chiffre avec son unité et son contexte (population, condition, étude quand la source en cite une).
- Renvois : quand un point relève surtout d'une autre fiche du chapitre, garde ce qu'en disent tes sources et ajoute une courte phrase de renvoi (« → voir la fiche « … » ») plutôt que de le développer.
- Texte brut : ni Markdown, ni astérisques, ni dièses (sauts de ligne autorisés).

4. À RETENIR. Termine par exactement UN bloc "a_retenir" : 5 à 12 points « • » courts et mémorisables, à savoir par cœur (chiffres clés, doses, seuils, red flags, conduite immédiate, pièges), une affirmation par point, dans l'ordre de la fiche — uniquement des informations déjà écrites plus haut ; "source_block_ids" = les blocs sources d'où viennent ces points.

5. ILLUSTRATIONS. Sur chaque bloc qu'une figure rendrait nettement plus clair (anatomie, courbe, schéma de mécanisme, algorithme, montage, échographie), renseigne "suggested_image.what" en décrivant précisément l'image à placer là (ex. « Courbe de dissociation de l'hémoglobine : déplacements par la température, le pH et le 2,3-DPG ») et, quand un bloc source a une illustration ou cite la page où son livre en montre une, "suggested_image.source_block_id". Un bloc source suivi de [illustration : …] a déjà une image : reprends-la sur le bloc fusionné le plus pertinent avec "reuse_image_from" (chaque illustration source reprise une fois, aucune perdue). Rien de décoratif : 0 à 4 suggestions selon le sujet.

6. TRAÇABILITÉ. "source_block_ids" de chaque bloc liste TOUS les blocs sources (identifiants entre crochets, ex. "B12") dont il reprend du contenu : c'est ce qui permet au lecteur de toucher un passage pour ouvrir la page du PDF d'origine, et de vérifier que rien n'a été perdu. Chaque bloc source apparaît dans au moins un bloc.

7. FLASHCARDS. Fusionne les cartes sources : deux cartes (même de livres différents) qui testent le même fait n'en font qu'une, qui garde la réponse la plus complète et les nuances de chacune ; des cartes qui testent des faits différents restent distinctes ; reformule pour la qualité et garde chaque valeur chiffrée. "source_flashcard_ids" liste les cartes sources fusionnées dans chaque carte (ex. "K4") : chaque carte source apparaît dans exactement une carte. Chaque point du bloc « À retenir » et chaque divergence est testé par au moins une carte (ajoute-la, "source_flashcard_ids" vide, si aucune carte source ne le teste). Une partie des cartes fait raisonner (« Pourquoi… ? », « Que faire si… ? », « Quelle différence entre… ? ») plutôt que réciter.
${FLASHCARD_QUALITY_DOC}

"summary" : chapeau de une à deux phrases — de quoi parle la fiche et pourquoi c'est important en pratique.

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
  missing: { alias: string; bookTitle: string; blockType: string; content: BlockContent; lostValues: string[] }[],
  cards: { alias: string; bookTitle: string; front: string; back: string; lostValues: string[] }[],
  needsKeyPoints: boolean
): string {
  return `
Fiche « ${context.title} » (chapitre « ${context.chapterTitle} », livre de révision « ${context.bookTitle} », fusion de plusieurs livres). Le contrôle de couverture a trouvé ce que la fiche ne reprend pas encore. Complète-la sans rien retirer de l'existant, en gardant son style (texte brut, intertitres courts, puces « • ») :
- pour intégrer une information : remplace un bloc existant par une version enrichie ("replacements" : son numéro, son contenu complet réécrit — même forme que le bloc d'origine : texte, tableau ou étapes —, et les blocs sources ajoutés), ou insère un nouveau bloc au bon endroit du déroulé ("insertions" : après quel numéro de bloc, -1 pour la tête ; jamais après le bloc « À retenir » final) ;
- si l'information d'un bloc source est en réalité déjà entièrement présente dans un bloc de la fiche (valeurs comprises), ne la répète pas : indique-le dans "already_covered" (identifiant du bloc source et numéro du bloc qui la contient) ;
- si un bloc source contredit la fiche, ajoute ou complète un bloc "divergence" qui cite ce que dit chaque livre.
Chaque bloc source listé doit finir dans "replacements", "insertions" ou "already_covered". N'ajoute aucun fait absent des sources.
${needsKeyPoints ? `
La fiche n'a pas de bloc « À retenir » : ajoute-le en "insertions" à la fin (type "a_retenir", 5 à 12 points « • » courts à savoir par cœur, uniquement des informations déjà dans la fiche).
` : ""}${cards.length ? `
Cartes : écris dans "flashcards" une carte pour chaque carte source listée ci-dessous qui n'est pas encore couverte (une idée testable par carte, toutes ses valeurs chiffrées gardées), avec son identifiant dans "source_flashcard_ids".
` : ""}
${MERGE_LANGUAGE_RULE}

${STRICT_ARRAY_FORMAT_RULE}

Fiche actuelle :
${current.map((b) => `#${b.index} ${blockLabel(b.blockType)} : ${blockPromptText(b.blockType, b.content)}`).join("\n")}
${
  missing.length
    ? `\nBlocs sources à intégrer :\n${missing
        .map((m) => `[${m.alias}] « ${m.bookTitle} » — ${blockLabel(m.blockType)} : ${blockPromptText(m.blockType, m.content)}${m.lostValues.length ? `\n   (valeurs absentes de la fiche : ${m.lostValues.join(" ; ")})` : ""}`)
        .join("\n")}`
    : ""
}
${
  cards.length
    ? `\nCartes sources à couvrir :\n${cards
        .map((c) => `[${c.alias}] « ${c.bookTitle} » — Q : ${c.front} — R : ${c.back}${c.lostValues.length ? ` (valeurs perdues : ${c.lostValues.join(" ; ")})` : ""}`)
        .join("\n")}`
    : ""
}
`.trim();
}
