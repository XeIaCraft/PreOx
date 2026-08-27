const BLOCK_TYPES_DOC = `
- "definition_mecanisme" : définition, mécanisme d'action, physiopathologie
- "valeurs_seuils" : valeurs numériques de référence, seuils, posologies simples
- "tableau_comparatif" : comparaison de plusieurs éléments côte à côte (classes de médicaments, diagnostics différentiels...) — TOUJOURS en tableau réel (headers + rows), jamais aplati en liste
- "protocole_paliers" : suite d'étapes ou de paliers conditionnels (ex: protocole d'antalgie, arbre décisionnel)
- "mnemotechnique" : moyen mnémotechnique
- "perle_clinique" : astuce ou point clé d'intérêt clinique pratique
- "piege_erreur" : piège fréquent, erreur classique à éviter
- "formule" : formule ou équation
- "texte_libre" : tout contenu important qui ne rentre dans aucune des catégories ci-dessus — jamais un prétexte pour perdre de l'information, sert de filet de sécurité
`.trim();

const EXPERT_READER_CONTEXT = `
Le lecteur est un(e) anesthésiste-réanimateur belge (en formation ou déjà spécialiste) qui vise une maîtrise théorique de niveau EXPERT (registre des référentiels européens UEMS/EBA/EDAIC) — être étudiant n'abaisse pas l'exigence de profondeur. Calibre systématiquement la profondeur du contenu — fiches ET flashcards — en conséquence : ce qui compte, c'est ce qui permet de reconnaître une situation, décider, agir et prioriser en clinique ou de trancher une distinction piégeuse à l'oral, pas seulement mémoriser une définition isolée.
`.trim();

// Explicit regardless of the model's own default (added 2026-08-25, after a
// question about English-language source books): without this, a book in
// English risks producing fiche/flashcard text in English too, since
// nothing else in these prompts says otherwise. Citations are the one
// deliberate exception — they must stay verbatim in the source's own
// language to remain a faithful, page-matching quote.
const LANGUAGE_RULE = `
Langue : rédige tout le contenu que tu génères (noms de sous-entités, titres de fiche, texte des blocs, questions et réponses des flashcards) exclusivement en FRANÇAIS, quelle que soit la langue du document source (même s'il est en anglais ou dans une autre langue) — traduis fidèlement en conservant la terminologie médicale standard, ne recopie jamais tel quel un passage en langue étrangère en dehors d'une citation. Seules les "citations" (le champ "quote") restent verbatim dans la langue exacte du texte source, car elles doivent correspondre mot pour mot au passage cité.
`.trim();

// Added 2026-08-27 after a recurring failure on content-heavy chapters:
// the model sometimes serializes a large array field (sub_entities,
// additions_for_existing...) as its own JSON string instead of a native
// array in the tool call — this roughly doubles that field's token cost
// (every quote/newline needs escaping) and can push a genuinely large
// chapter past the provider's own output ceiling, truncating the response
// mid-structure. coerceArray (anthropic.ts) already recovers a *complete*
// double-encoded string and salvages whatever complete elements exist in a
// *truncated* one, but preventing the double-encoding in the first place
// avoids the truncation risk altogether — this is a best-effort nudge, not
// a guarantee (tool-use schemas constrain shape but aren't rigidly
// enforced), so the salvage path stays in place as the real safety net.
const STRICT_ARRAY_FORMAT_RULE = `
Format strict : chaque champ de type tableau (ex. "sub_entities", "blocks", "flashcards", "additions_for_existing", "new_sub_entities") doit être un VRAI tableau JSON natif dans ta réponse — jamais une chaîne de caractères contenant du JSON sérialisé (même entre guillemets avec des \\n), quelle que soit la taille du contenu.
`.trim();

const FLASHCARD_QUALITY_DOC = `
Couverture : génère AUTANT DE FLASHCARDS QUE NÉCESSAIRE pour couvrir tout ce qui, dans les blocs déjà extraits, est réellement testable ou utile à la décision clinique — pas un nombre fixe, pas une seule carte générique par sous-entité. Une sous-entité riche et nuancée mérite beaucoup de cartes ; une sous-entité pauvre en mérite peu. N'invente rien pour atteindre un quota, et ne fusionne jamais deux faits distincts dans une carte vague — une carte = une idée testable et sans ambiguïté.

Niveau attendu — des "items de maîtrise", pas du simple savoir : chaque fois que le contenu source le permet, préfère une question qui fait reconnaître, décider, agir ou prioriser plutôt qu'un pur rappel de définition. Angles à exploiter quand le texte les couvre réellement (liste d'exemples pour t'inspirer, pas une checklist à cocher une par une ni un minimum à atteindre) :
- mécanisme / physiopathologie qui explique un effet ou une décision clinique
- formule, posologie, seuil ou valeur critique à connaître par cœur
- indication précise dans une situation clinique donnée
- contre-indication ou précaution qui change concrètement la prise en charge
- distinction avec une entité proche ou souvent confondue — piège de raisonnement classique
- red flag ou signe qui ne doit jamais être manqué
- conduite à tenir immédiate face à une situation décrite dans le texte
- erreur classique, piège fréquent ou point qui fait la différence à l'oral
`.trim();

export function buildExtractionPrompt(chapterTitle: string): string {
  return `
Tu es un assistant d'extraction pour du matériel pédagogique médical de haut niveau (anesthésie/médecine). Le document fourni est un chapitre de livre intitulé « ${chapterTitle} ». Certaines pages sont du texte natif propre, d'autres sont des scans/photos — lis-les comme des images si besoin.

${EXPERT_READER_CONTEXT}

${LANGUAGE_RULE}

Objectif absolu : NE JAMAIS PERDRE D'INFORMATION IMPORTANTE. Le lecteur utilisera exclusivement ce que tu extrais pour réviser — tout ce que tu omets est perdu pour lui. En cas de doute sur l'importance d'une information, inclus-la plutôt que de l'omettre.

Étapes :

1. Identifie les sous-entités du chapitre dans l'ordre où elles apparaissent, en te basant sur les sous-titres/sections du livre lui-même (ex: un médicament par sous-entité en pharmacologie, une pathologie par sous-entité en pathologie, un dispositif/technique par sous-entité en anatomie/technique). Ne découpe PAS arbitrairement si le chapitre ne s'y prête pas — utilise le découpage naturel du livre.

2. Pour chaque sous-entité, produis UNE fiche composée de blocs de contenu TYPÉS (pas une rubrique unique et rigide) qui reflètent fidèlement ce que le livre dit réellement de cette sous-entité. Types de blocs disponibles :
${BLOCK_TYPES_DOC}

Règles strictes pour chaque bloc :
- "citations" est OBLIGATOIRE et non vide : chaque bloc doit citer verbatim (mot pour mot, sans paraphrase) le ou les passages du livre qui le fondent, avec le numéro de PAGE DU FICHIER PDF. Règle de comptage stricte et NON NÉGOCIABLE : "page" = la position de la page dans le fichier PDF fourni, en partant de 1 pour la toute première page du fichier tel qu'il t'est donné (quel que soit son contenu : couverture, sommaire, ou directement du texte), puis +1 pour chaque page suivante dans l'ordre du fichier. IGNORE TOTALEMENT tout numéro imprimé sur la page elle-même (en-tête, pied de page, folio du livre original) — ce numéro imprimé ne correspond presque jamais à la position réelle dans le fichier fourni (le chapitre est un extrait du livre, pas le livre entier) et l'utiliser produirait une citation qui pointe vers la mauvaise page. Avant de répondre, recompte mentalement depuis la première page du fichier pour vérifier chaque numéro de page cité. C'est ce numéro (position dans le fichier) qui sert ensuite à ouvrir automatiquement la bonne page dans le lecteur PDF de l'application — une erreur ici casse la citation.
- Ne génère jamais un bloc sans base textuelle vérifiable dans le document.
- Pour "tableau_comparatif", remplis "content.headers" et "content.rows" (un tableau réel), ne mets rien dans "content.text".
- Pour "protocole_paliers", remplis "content.steps" (liste ordonnée), pas "content.text".
- Pour les autres types, remplis "content.text" avec le contenu synthétisé (mais fidèle et complet — ne résume pas au point de perdre une nuance importante).

3. Pour chaque sous-entité, génère des flashcards de révision à partir UNIQUEMENT des faits déjà extraits et cités dans ses blocs (jamais directement depuis le texte brut, jamais un fait qui n'apparaît dans aucun bloc).

${FLASHCARD_QUALITY_DOC}

Chaque flashcard : une question précise et sans ambiguïté au recto ("front"), la réponse exacte attendue au verso ("back"), et sa/ses citation(s) source.

Repère aussi les schémas/images du document : si une page proche de cette flashcard contient un schéma, une image, un tableau visuel (pas juste du texte) qui aiderait concrètement à répondre ou à mémoriser (ex: anatomie, circuit, courbe, dispositif), indique "suggested_image_page" (même règle de comptage que "page" dans les citations — position réelle dans le fichier, pas le folio imprimé) et "suggested_image_hint" (description courte de ce qu'il faut capturer, ex: « le schéma du circuit du gaz frais »). Ne force rien : la plupart des flashcards n'ont besoin d'aucune image — laisse ces deux champs vides quand ce n'est pas le cas.

4. Indique enfin "estimated_remaining_passes" : ton estimation honnête du nombre de passes de complément supplémentaires ("Compléter l'extraction", qui relit le PDF pour combler les trous) probablement encore nécessaires pour une couverture quasi-exhaustive de ce chapitre. Base-toi sur la longueur/densité réelle du chapitre et sur ce que tu sens avoir pu couvrir en une seule lecture — 0 si le chapitre est court/simple et que tu es confiant d'avoir tout couvert, un chiffre plus élevé (2, 3...) pour un chapitre long ou très dense où une seule passe ne peut raisonnablement pas tout capter.

${STRICT_ARRAY_FORMAT_RULE}

Réponds uniquement avec le JSON demandé, structuré exactement selon le schéma fourni.
`.trim();
}

/**
 * Same extraction pipeline as buildExtractionPrompt, but for a chapter
 * sourced from Word/PowerPoint (item 5 of the backlog) instead of a PDF:
 * the source is plain text handed in the prompt itself, not a file
 * attachment, so there is no page position to cite — every citation must
 * use "page": 0 and rely purely on the verbatim "quote" to locate the
 * passage in the original document.
 */
export function buildTextExtractionPrompt(chapterTitle: string, sourceText: string): string {
  return `
Tu es un assistant d'extraction pour du matériel pédagogique médical de haut niveau (anesthésie/médecine). Voici le texte brut d'un chapitre intitulé « ${chapterTitle} », extrait d'un document Word ou PowerPoint (mise en forme perdue, mais le texte est complet) :

${sourceText}

${EXPERT_READER_CONTEXT}

${LANGUAGE_RULE}

Objectif absolu : NE JAMAIS PERDRE D'INFORMATION IMPORTANTE. Le lecteur utilisera exclusivement ce que tu extrais pour réviser — tout ce que tu omets est perdu pour lui. En cas de doute sur l'importance d'une information, inclus-la plutôt que de l'omettre.

Étapes :

1. Identifie les sous-entités du chapitre dans l'ordre où elles apparaissent, en te basant sur les titres/sections du texte lui-même. Ne découpe PAS arbitrairement si le texte ne s'y prête pas — utilise le découpage naturel du document (une diapositive ou un groupe de diapositives peut correspondre à une sous-entité pour un PowerPoint).

2. Pour chaque sous-entité, produis UNE fiche composée de blocs de contenu TYPÉS (pas une rubrique unique et rigide) qui reflètent fidèlement ce que le texte dit réellement de cette sous-entité. Types de blocs disponibles :
${BLOCK_TYPES_DOC}

Règles strictes pour chaque bloc :
- "citations" est OBLIGATOIRE et non vide : chaque bloc doit citer verbatim (mot pour mot, sans paraphrase) le ou les passages du texte qui le fondent. Ce document n'a pas de pages — mets toujours "page": 0 et fais reposer la citation entièrement sur "quote" (le passage exact, assez long pour être retrouvé sans ambiguïté dans le texte fourni).
- Ne génère jamais un bloc sans base textuelle vérifiable dans le document.
- Pour "tableau_comparatif", remplis "content.headers" et "content.rows" (un tableau réel), ne mets rien dans "content.text".
- Pour "protocole_paliers", remplis "content.steps" (liste ordonnée), pas "content.text".
- Pour les autres types, remplis "content.text" avec le contenu synthétisé (mais fidèle et complet — ne résume pas au point de perdre une nuance importante).

3. Pour chaque sous-entité, génère des flashcards de révision à partir UNIQUEMENT des faits déjà extraits et cités dans ses blocs (jamais directement depuis le texte brut, jamais un fait qui n'apparaît dans aucun bloc).

${FLASHCARD_QUALITY_DOC}

Chaque flashcard : une question précise et sans ambiguïté au recto ("front"), la réponse exacte attendue au verso ("back"), et sa/ses citation(s) source (même règle : "page": 0, "quote" verbatim). Ne remplis jamais "suggested_image_page"/"suggested_image_hint" pour ce document — il n'y a pas de fichier source à capturer.

4. Indique enfin "estimated_remaining_passes" : ce document n'a pas de passe de complément possible (pas de fichier à relire) — réponds toujours 0.

${STRICT_ARRAY_FORMAT_RULE}

Réponds uniquement avec le JSON demandé, structuré exactement selon le schéma fourni.
`.trim();
}

// Gemini gets this same body via a separate structured-output schema
// channel (see EXTRACTION_RESPONSE_SCHEMA in gemini.ts) — a manual
// copy/paste into an external chat has no such channel, so the shape has to
// be spelled out literally in the prompt text itself instead.
const EXTERNAL_IMPORT_JSON_SCHEMA_DOC = `
Réponds UNIQUEMENT avec un objet JSON valide, rien avant ni après (tu peux l'entourer d'un bloc de code \`\`\`json si tu préfères, mais aucune explication en dehors), respectant EXACTEMENT cette forme :

{
  "sub_entities": [
    {
      "name": "string",
      "summary": "string",
      "fiche": {
        "title": "string",
        "blocks": [
          {
            "block_type": "definition_mecanisme" | "valeurs_seuils" | "tableau_comparatif" | "protocole_paliers" | "mnemotechnique" | "perle_clinique" | "piege_erreur" | "formule" | "texte_libre",
            "content": { "text": "string" }
                       // uniquement pour "tableau_comparatif" : { "headers": ["string", ...], "rows": [["string", ...], ...] }
                       // uniquement pour "protocole_paliers" : { "steps": [{ "label": "string", "detail": "string", "condition": "string (optionnel)" }, ...] },
            "citations": [ { "page": <number>, "quote": "string" }, ... ]
          }
        ],
        "flashcards": [
          { "front": "string", "back": "string", "citations": [ { "page": <number>, "quote": "string" }, ... ] }
        ]
      }
    }
  ],
  "estimated_remaining_passes": <number>
}
`.trim();

/**
 * Same instructions as buildExtractionPrompt, for a human to copy/paste into
 * an external chat (e.g. Claude.ai, with the chapter PDF attached by hand)
 * instead of calling Gemini automatically — a manual escape hatch for when
 * Gemini's own quota is exhausted. The output gets pasted back in and
 * imported through the same validation + citation-correction pipeline as a
 * normal extraction.
 */
export function buildExternalImportPrompt(chapterTitle: string): string {
  const base = buildExtractionPrompt(chapterTitle).replace(
    /\n*Réponds uniquement avec le JSON demandé, structuré exactement selon le schéma fourni\.$/,
    ""
  );
  return `${base}\n\n${EXTERNAL_IMPORT_JSON_SCHEMA_DOC}`;
}

export function buildComplementaryPrompt(chapterTitle: string, coverageSummaryJson: string): string {
  return `
Tu es le même assistant d'extraction que précédemment, sur le même chapitre « ${chapterTitle} ». Une première extraction a déjà été faite.

${EXPERT_READER_CONTEXT}

${LANGUAGE_RULE}

Voici un résumé de ce qui est déjà couvert (nom de chaque sous-entité, type et résumé de chacun de ses blocs déjà extraits, et les questions des flashcards déjà générées) :

${coverageSummaryJson}

Ta tâche cette fois : relis l'intégralité du document et identifie UNIQUEMENT les notions importantes qui ne sont PAS encore couvertes par ce résumé. N'invente rien et ne répète JAMAIS un fait déjà couvert, même reformulé — c'est le but exact de cette passe : combler les trous, pas dupliquer.

Pour chaque trou trouvé :
- S'il concerne une sous-entité déjà listée ci-dessus (même si elle est incomplète), ajoute les blocs et/ou flashcards manquants sous "additions_for_existing", avec "sub_entity_name" reprenant EXACTEMENT le nom déjà utilisé pour cette sous-entité (aucune variation, aucune reformulation).
- Si c'est un thème ou une sous-entité entièrement absente de la liste ci-dessus, crée une nouvelle entrée sous "new_sub_entities" (même structure que lors d'une extraction initiale : nom, résumé, fiche avec blocs et flashcards).

S'il n'y a réellement plus rien d'important à ajouter, retourne "additions_for_existing" et "new_sub_entities" comme des tableaux vides — ne force pas la génération de contenu superflu ou redondant juste pour remplir la réponse.

Pour les flashcards en particulier, regarde si le résumé ci-dessus laisse des faits testables sans carte pour une sous-entité donnée — pas seulement des sous-entités entières manquantes. Mêmes exigences de couverture et de niveau que lors d'une extraction initiale :

${FLASHCARD_QUALITY_DOC}

Mêmes règles strictes que pour l'extraction initiale : chaque bloc et chaque flashcard doit citer verbatim (page + texte exact) le passage du livre qui le fonde, les tableaux comparatifs vont dans un vrai tableau, les protocoles par paliers dans une liste d'étapes structurée. Même règle aussi pour "suggested_image_page"/"suggested_image_hint" sur une flashcard : seulement quand un schéma/image proche aiderait vraiment, jamais par défaut.

Indique enfin "estimated_remaining_passes" : ta nouvelle estimation, APRÈS cette passe de complément, du nombre de passes encore probablement nécessaires pour une couverture quasi-exhaustive — 0 si tu es maintenant confiant que le chapitre est couvert dans son ensemble.

${STRICT_ARRAY_FORMAT_RULE}

Réponds uniquement avec le JSON demandé, structuré exactement selon le schéma fourni.
`.trim();
}

export function buildSelectionPrompt(subEntityName: string, chapterTitle: string, page: number, quote: string): string {
  return `
${EXPERT_READER_CONTEXT}

${LANGUAGE_RULE}

Un utilisateur a lui-même sélectionné, à la main, le passage suivant dans le chapitre « ${chapterTitle} », page ${page}, à propos de la sous-entité « ${subEntityName} » :

« ${quote} »

Ta tâche : produire UN SEUL bloc de contenu typé (même vocabulaire que d'habitude : ${BLOCK_TYPES_DOC}) qui capture fidèlement ce passage précis, sous "block", avec "citations" reprenant exactement cette page et ce passage (tu peux raccourcir légèrement la citation si elle est très longue, mais reste verbatim). Choisis le type le plus adapté au contenu réel du passage — un "tableau_comparatif" seulement si le passage contient effectivement une comparaison tabulaire, etc.

Si le passage contient un fait clinique testable, produis en plus UNE flashcard sous "flashcard" (front/back/citations) — sinon omets "flashcard" plutôt que d'en inventer une artificielle.

N'ajoute strictement aucune information absente de ce passage précis — ce n'est pas une extraction du chapitre entier, seulement de ce texte fourni.

Réponds uniquement avec le JSON demandé, structuré exactement selon le schéma fourni.
`.trim();
}

export function buildMnemonicPrompt(subEntityName: string, sourceText: string): string {
  return `
${EXPERT_READER_CONTEXT}

Voici le contenu déjà rédigé pour la sous-entité « ${subEntityName} » :

« ${sourceText} »

Ta tâche : propose UN SEUL moyen mnémotechnique efficace (acronyme, phrase, image mentale...) en français pour retenir ce contenu précis — court, mémorable, directement utile pour un examen ou la pratique clinique. Si le contenu ne s'y prête vraiment pas (trop abstrait, aucune liste ou séquence à retenir), réponds quand même avec le meilleur compromis possible plutôt que de refuser.

Réponds uniquement avec le JSON demandé (un champ "text"), structuré exactement selon le schéma fourni.
`.trim();
}

export function buildWeaknessSynthesisPrompt(items: { front: string; back: string }[]): string {
  const list = items.map((it, i) => `${i + 1}. Q: ${it.front}\n   R: ${it.back}`).join("\n");
  return `
${EXPERT_READER_CONTEXT}

Voici une liste de flashcards que l'utilisateur a régulièrement du mal à retenir (cartes actuellement en réapprentissage ou ayant accumulé plusieurs échecs) :

${list}

Ta tâche : rédige une courte fiche de synthèse en français, pensée pour une relecture rapide avant de continuer à réviser :
1. Regroupe ces points faibles par thème ou mécanisme commun quand c'est vraiment pertinent — ne force pas un regroupement artificiel si les cartes sont disparates, un point isolé reste un point isolé.
2. Pour chaque regroupement (ou chaque carte isolée), rappelle le point clé à retenir, avec un moyen mnémotechnique ou une astuce de distinction si tu en as une vraiment utile.
3. Termine par 2 ou 3 conseils concrets et actionnables pour mieux retenir ces notions à l'avenir (angle d'approche, association, technique de révision) — pas des généralités du type "révisez plus souvent".

Format de sortie : TEXTE BRUT uniquement, pas de Markdown (pas de #, pas de *, pas de -) — utilise des sauts de ligne et une numérotation simple ("1.", "2."...) pour structurer, comme si tu écrivais une note à la main.

Réponds uniquement avec le JSON demandé (un champ "text"), structuré exactement selon le schéma fourni.
`.trim();
}

/** On-demand translation of a fiche's full content — never persisted, only shown to the user who asked. Item 12 of the backlog. */
export function buildFicheTranslationPrompt(ficheTitle: string, ficheText: string, targetLanguage: string): string {
  return `
Traduis fidèlement le contenu suivant, extrait d'une fiche de révision médicale intitulée « ${ficheTitle} », vers la langue suivante : ${targetLanguage}.

Contenu à traduire :
« ${ficheText} »

Consignes :
- Traduction fidèle et complète, aucune information ajoutée ni omise.
- Conserve la terminologie médicale standard de la langue cible (pas une traduction mot à mot qui sonnerait faux à un professionnel).
- Conserve la structure du texte (sauts de ligne, énumérations) autant que possible.

Format de sortie : TEXTE BRUT uniquement, pas de Markdown.

Réponds uniquement avec le JSON demandé (un champ "text"), structuré exactement selon le schéma fourni.
`.trim();
}

/** On-demand clinical-vignette generation from a fiche's content, to practice reasoning about a chapter's clinical implications. Item 13 of the backlog. */
export function buildClinicalCasePrompt(subEntityName: string, ficheText: string): string {
  return `
${EXPERT_READER_CONTEXT}

Voici le contenu déjà rédigé pour la sous-entité « ${subEntityName} » :
« ${ficheText} »

Ta tâche : rédige UN cas clinique d'entraînement réaliste et pertinent qui met en application ce contenu précis, pour faire pratiquer le raisonnement clinique plutôt que le simple rappel. Structure attendue :
1. Un court vignette clinique (contexte patient, présentation, éléments cliniques pertinents — invente des détails plausibles et cohérents, jamais absurdes).
2. 2 à 4 questions progressives qui testent la compréhension et la décision clinique à partir de ce cas (diagnostic, conduite à tenir, priorisation, piège à éviter...).
3. Les réponses attendues à ces questions, avec une brève justification qui s'appuie sur le contenu de la fiche.

Format de sortie : TEXTE BRUT uniquement, pas de Markdown — utilise des sauts de ligne et une numérotation simple pour structurer.

Réponds uniquement avec le JSON demandé (un champ "text"), structuré exactement selon le schéma fourni.
`.trim();
}

/** On-demand exam-style question generation from a fiche's content — ephemeral, never persisted. Item 8 of the backlog. */
export function buildExamQuestionsPrompt(subEntityName: string, ficheText: string): string {
  return `
${EXPERT_READER_CONTEXT}

Voici le contenu déjà rédigé pour la sous-entité « ${subEntityName} » :
« ${ficheText} »

Ta tâche : rédige 3 à 5 questions dans le style d'un concours/examen d'anesthésie-réanimation (registre européen UEMS/EBA/EDAIC), à partir UNIQUEMENT de ce contenu. Varie les formats pertinents pour ce contenu (QCM à une bonne réponse avec distracteurs plausibles, question à réponse courte, question de type "quelle est la conduite à tenir"...). Pour chaque question :
1. L'énoncé complet (avec les options si QCM).
2. La bonne réponse.
3. Une justification brève qui s'appuie sur le contenu de la fiche, y compris pourquoi les distracteurs sont incorrects si pertinent.

Format de sortie : TEXTE BRUT uniquement, pas de Markdown — numérote les questions.

Réponds uniquement avec le JSON demandé (un champ "text"), structuré exactement selon le schéma fourni.
`.trim();
}

/** On-demand mind map from a chapter's already-written content — ephemeral, never persisted. Item 2 of the backlog. Fixed two-level tree (central topic → branches → leaf points), not open recursion, to keep the Gemini response schema simple and the rendering predictable. */
export function buildMindMapPrompt(chapterTitle: string, subEntitySummaries: { name: string; text: string }[]): string {
  const content = subEntitySummaries.map((s) => `### ${s.name}\n${s.text}`).join("\n\n");
  return `
${EXPERT_READER_CONTEXT}

Voici le contenu déjà rédigé pour le chapitre « ${chapterTitle} » :

${content}

Ta tâche : construis une carte mentale de ce chapitre pour aider à en mémoriser la structure d'ensemble.
- "central" : le thème central du chapitre, en 2-5 mots.
- "branches" : 4 à 8 branches principales (les grands axes/notions du chapitre), chacune avec un "label" court et 2-6 "children" (des points clés courts, une idée par point — pas des phrases longues).

Réponds uniquement avec le JSON demandé, structuré exactement selon le schéma fourni.
`.trim();
}

export function buildNotionCategorizationPrompt(ficheTitle: string, ficheText: string, existingNotionNames: string[]): string {
  return `
Tu catégorises le contenu médical d'une fiche de révision par "notions" transversales — des concepts qui peuvent apparaître dans plusieurs chapitres ou plusieurs livres différents (ex: "Hyperkaliémie", "Choc anaphylactique", "Anticoagulants et chirurgie", "Ventilation protectrice"). Le but : pouvoir un jour comparer entre eux tous les passages de la bibliothèque qui parlent de la même notion, même extraits de livres différents.

Fiche « ${ficheTitle} » :
« ${ficheText} »

Notions déjà existantes dans la bibliothèque (réutilise-les si elles correspondent vraiment, plutôt que de créer un quasi-doublon avec un nom légèrement différent) :
${existingNotionNames.length > 0 ? existingNotionNames.map((n) => `- ${n}`).join("\n") : "(aucune pour l'instant)"}

Attribue à cette fiche entre 1 et 3 notions parmi celles-ci ou, si aucune ne convient vraiment, un nom de notion nouveau et précis (pas trop large : "Anesthésie" est trop vague, "Anesthésie et insuffisance rénale" est utile). Réponds uniquement avec le JSON demandé (un champ "notions", liste de chaînes), structuré exactement selon le schéma fourni.
`.trim();
}

export function buildContradictionCheckPrompt(
  notionName: string,
  ficheATitle: string,
  ficheAText: string,
  ficheBTitle: string,
  ficheBText: string
): string {
  return `
Tu compares deux fiches de révision médicale qui partagent la même notion transversale « ${notionName} », potentiellement issues de livres ou chapitres différents. Ta tâche : détecter si elles se contredisent réellement sur un point de fait (valeur numérique différente, conduite à tenir opposée, mécanisme décrit différemment...) — pas juste des différences de formulation, de niveau de détail, ou des angles complémentaires qui ne se contredisent pas.

Fiche A — « ${ficheATitle} » :
« ${ficheAText} »

Fiche B — « ${ficheBTitle} » :
« ${ficheBText} »

Réponds uniquement avec le JSON demandé : "contradictory" (booléen — true seulement si tu es raisonnablement confiant qu'il y a une vraie contradiction factuelle exploitable, pas un simple doute) et "explanation" (si contradictoire : quel point précis diverge et comment, en une ou deux phrases ; sinon une chaîne vide), structuré exactement selon le schéma fourni.
`.trim();
}

/**
 * Compares a fiche's current content against an external source (a pasted
 * answer from a literature-search tool like Consensus/OpenEvidence, or the
 * text of an uploaded article) to decide whether the fiche needs updating —
 * the "réunification" counterpart of buildComplementaryPrompt, but sourced
 * from outside the library instead of the chapter's own PDF. Deliberately
 * proposes only the delta (like a complementary addition), never a full
 * rewrite — the admin reviews and applies, same as every other AI output.
 */
export function buildNotionUpdateCheckPrompt(
  notionName: string,
  ficheTitle: string,
  ficheText: string,
  sourceLabel: string,
  sourceText: string
): string {
  return `
${EXPERT_READER_CONTEXT}

Tu compares le contenu déjà rédigé d'une fiche de révision médicale, liée à la notion transversale « ${notionName} », à une source externe plus récente — ${sourceLabel}. Ta tâche : déterminer si cette source apporte une information qui manque à la fiche, ou qui la contredit / rend obsolète sur un point de fait (nouvelle recommandation, seuil modifié, conduite à tenir révisée, contre-indication ajoutée...) — pas une simple différence de formulation ou de niveau de détail qui ne change rien au fond.

Fiche « ${ficheTitle} » (contenu actuel) :
« ${ficheText} »

Source externe (${sourceLabel}) :
« ${sourceText} »

Si la source ne change ni n'ajoute rien de substantiel par rapport à ce que la fiche dit déjà, réponds "needs_update": false, "explanation": "" et laisse "blocks"/"flashcards" vides — ne force rien.

Si la source apporte réellement quelque chose de nouveau ou de contradictoire pour cette fiche précise :
- "needs_update": true.
- "explanation" : en une ou deux phrases, ce qui change et pourquoi — c'est ce que l'admin lira pour décider s'il valide la proposition.
- "blocks"/"flashcards" : UNIQUEMENT ce qu'il faut ajouter ou corriger, jamais une réécriture complète de la fiche — même format que pour une extraction (block_type/content/citations pour les blocs, front/back/citations pour les flashcards). Pour "citations", mets toujours "page": 0 (cette source n'a pas de pagination de fichier PDF fiable) et fais reposer la citation sur "quote" : le passage exact de la source externe qui justifie l'ajout.

Réponds uniquement avec le JSON demandé, structuré exactement selon le schéma fourni.
`.trim();
}

/**
 * AI-assisted first pass for the "diviser un PDF en chapitres" admin tool
 * (requested 2026-08-24) — the admin uploads a whole book PDF once instead
 * of pre-splitting it by hand, and this suggests where each chapter starts
 * from short per-page excerpts; the admin reviews/edits every suggestion
 * (title + page range) before anything is actually split and uploaded.
 */
export function buildChapterSplitPrompt(pageTexts: string[]): string {
  const pages = pageTexts
    .map((text, i) => `--- Page ${i + 1} ---\n${text.trim().slice(0, 300) || "(page vide ou image scannée)"}`)
    .join("\n\n");
  return `
Voici le texte extrait de chaque page d'un livre médical au format PDF (un court extrait par page, pour repérer la structure du document) :

${pages}

Ta tâche : identifie les DÉBUTS de chapitre (ou grandes parties/sections numérotées) de ce livre, dans l'ordre, à partir des titres/en-têtes visibles dans les extraits — pas les sous-sections internes à un chapitre. Ignore les pages de sommaire/table des matières/index/couverture/remerciements en tant que « chapitre » (ce n'est pas du contenu à réviser), mais utilise-les si elles t'aident à repérer où chaque chapitre commence réellement dans le corps du livre.

Pour chaque chapitre repéré, donne son titre exact (tel qu'il apparaît dans le livre, sans numérotation superflue type « Chapitre 3 — » si le titre seul suffit à l'identifier) et le numéro de la PREMIÈRE page (1-indexé, correspondant aux numéros « Page N » ci-dessus) où ce chapitre commence.

Si tu n'es pas sûr de la structure (livre sans découpage clair, extraits illisibles car pages scannées...), fais de ton mieux avec les indices disponibles plutôt que de renvoyer une liste vide — un premier découpage approximatif que l'utilisateur pourra corriger à la main est plus utile qu'aucun découpage.

Réponds uniquement avec le JSON demandé (un tableau "chapters", chaque élément avec "title" et "start_page"), structuré exactement selon le schéma fourni, trié par "start_page" croissant.
`.trim();
}

/**
 * OCR fallback for pages pdfjs's text layer couldn't extract (scanned or
 * photographed pages) — item "OCR des PDF scannés" of the pistes
 * d'amélioration 2026-08-24. Only asked for the specific pages that came
 * back empty, never the whole document — this only feeds citation page
 * correction, not extraction itself (which already reads the raw PDF
 * directly and doesn't need a text layer).
 */
export function buildPageOcrPrompt(pageNumbers: number[]): string {
  return `
Ce document est un livre ou un chapitre au format PDF. Les pages suivantes n'ont aucune couche de texte extractible, probablement parce que ce sont des pages scannées ou photographiées : ${pageNumbers.join(", ")}.

Pour CHACUNE de ces pages, et uniquement celles-ci, transcris fidèlement et intégralement le texte visible — verbatim, sans résumer, sans corriger l'orthographe ni la mise en forme, sans commentaire de ta part. Si une page listée est en réalité illisible ou ne contient pas de texte exploitable (image pure, page blanche), renvoie une chaîne vide pour cette page plutôt que d'inventer du contenu.

Réponds uniquement avec le JSON demandé (un tableau "pages", un élément par page demandée avec "page_number" et "text"), structuré exactement selon le schéma fourni.
`.trim();
}

/**
 * Piste d'amélioration 2026-08-24 ("traitement des cartes sangsues") : une
 * reformulation ciblée pour une flashcard qu'un nombre inhabituel
 * d'utilisateurs rate de façon persistante — signe fréquent d'une
 * question mal posée plutôt que d'une vraie difficulté de la notion.
 */
export function buildLeechRewordingPrompt(subEntityName: string, front: string, back: string, againRate: number): string {
  return `
${EXPERT_READER_CONTEXT}

Cette flashcard, rattachée à la sous-entité « ${subEntityName} », est actuellement ratée par une proportion inhabituellement élevée d'utilisateurs (environ ${Math.round(againRate * 100)} % des réponses) — ce qui indique souvent un problème de formulation de la question plutôt qu'une vraie difficulté de la notion : question ambiguë, deux informations demandées à la fois, réponse attendue trop vague pour être auto-évaluée fiablement.

Question actuelle : « ${front} »
Réponse attendue : « ${back} »

Ta tâche : propose UNE seule reformulation de la QUESTION (pas de la réponse) qui cible plus précisément ce qui est attendu, sans changer le fond de ce qui est testé — l'objectif est de réduire les erreurs dues à une question mal comprise, pas de rendre la carte plus facile sur le fond. Si le problème semble plutôt venir de la réponse attendue elle-même (trop vague, deux faits mélangés, à scinder en deux cartes), dis-le dans "note" en plus de ta reformulation de la question.

Réponds uniquement avec le JSON demandé (un champ "text" pour la question reformulée, et un champ "note" — chaîne vide si tu n'as rien à signaler), structuré exactement selon le schéma fourni.
`.trim();
}

/**
 * Piste d'amélioration 2026-08-24 ("boucler les signalements vers la
 * régénération") : propose une correction de flashcard à partir du motif
 * de signalement d'un utilisateur, plutôt que de laisser l'admin retaper
 * le contenu à la main. Suggestion uniquement — jamais appliquée sans
 * relecture, comme tout le reste du contenu généré par IA dans ce module.
 */
export function buildFlashcardFlagFixPrompt(subEntityName: string, front: string, back: string, flagReason: string): string {
  return `
${EXPERT_READER_CONTEXT}

Cette flashcard, rattachée à la sous-entité « ${subEntityName} », a été signalée comme incorrecte par un utilisateur.

Question actuelle : « ${front} »
Réponse actuelle : « ${back} »

Motif du signalement : « ${flagReason || "Aucun motif précisé."} »

Ta tâche : propose une version corrigée de la question ET de la réponse qui règle le problème signalé, en conservant tout ce qui n'est pas concerné par le signalement. Si le motif est trop vague pour identifier une correction fiable, renvoie la question et la réponse originales inchangées et explique pourquoi dans "note" plutôt que d'inventer une correction non fondée.

Réponds uniquement avec le JSON demandé (les champs "front" et "back" pour la question/réponse corrigées, et "note" — chaîne vide si tu n'as rien à signaler), structuré exactement selon le schéma fourni.
`.trim();
}

/** Same as buildFlashcardFlagFixPrompt, for a fiche block's free-text content (definition, mnémotechnique, perle clinique, etc.) — not applicable to tableau_comparatif/protocole_paliers blocks, whose structured content isn't a single text field. */
export function buildBlockFlagFixPrompt(subEntityName: string, blockType: string, currentText: string, flagReason: string): string {
  return `
${EXPERT_READER_CONTEXT}

Ce bloc de fiche (type « ${blockType} »), rattaché à la sous-entité « ${subEntityName} », a été signalé comme incorrect par un utilisateur.

Contenu actuel : « ${currentText} »

Motif du signalement : « ${flagReason || "Aucun motif précisé."} »

Ta tâche : propose une version corrigée de ce contenu qui règle le problème signalé, en conservant le style et tout ce qui n'est pas concerné par le signalement. Si le motif est trop vague pour identifier une correction fiable, renvoie le contenu original inchangé et explique pourquoi dans "note" plutôt que d'inventer une correction non fondée.

Réponds uniquement avec le JSON demandé (un champ "text" pour le contenu corrigé, et un champ "note" — chaîne vide si tu n'as rien à signaler), structuré exactement selon le schéma fourni.
`.trim();
}

/**
 * Real cross-book fusion for a notion (requested 2026-08-26 — the notion
 * "glossary" had only ever cross-linked separate fiches, never actually
 * merged their content, so reading a notion still meant opening every book
 * one by one). Every source block is numbered ("[b3]") so the model can
 * point back to exactly which ones it drew from instead of writing new
 * citations itself — see the doc comment on SynthesisCitation: the app
 * resolves "source_block_ids" back to the real citations afterward, so
 * nothing here is ever trusted to invent a page/quote.
 */
export function buildNotionSynthesisPrompt(
  notionName: string,
  sourceBlocks: { id: string; bookTitle: string; chapterTitle: string; ficheTitle: string; blockType: string; text: string }[]
): string {
  const body = sourceBlocks.map((b) => `[${b.id}] (${b.bookTitle} — ${b.chapterTitle} — ${b.ficheTitle} — type: ${b.blockType})\n${b.text}`).join("\n\n");
  return `
${EXPERT_READER_CONTEXT}

${LANGUAGE_RULE}

Voici tous les blocs de contenu déjà extraits et publiés, dans toute la bibliothèque, qui traitent de la notion transversale « ${notionName} » — chacun vient d'un livre (potentiellement différent) et porte un identifiant entre crochets, ex. [b3] :

${body}

Ta tâche : rédige UN VRAI CHAPITRE de synthèse sur cette notion — pas un empilement de fiches, un texte structuré et agréable à lire comme un chapitre de livre de référence, organisé en SECTIONS TITRÉES (l'équivalent, pour une synthèse, des sous-entités d'une extraction normale). Respecte ces règles strictes :

1. Découpe la synthèse en plusieurs sections, chacune avec un titre court et précis (ex. "Définition et mécanisme", "Valeurs de référence", "Prise en charge / protocole", "Pièges et perles cliniques") — jamais une section unique fourre-tout, et jamais un titre générique du style "Synthèse" ou "Informations". Choisis les titres à partir du contenu réel, pas d'un gabarit fixe.
2. Ordonne les sections comme le ferait un chapitre de référence : d'abord ce qui pose les bases (définition, mécanisme, physiopathologie), puis les données concrètes (valeurs, seuils, comparatifs), puis l'application pratique (protocoles, conduite à tenir), et enfin les repères de mémorisation ou de vigilance (pièges, perles, mnémotechniques) — jamais un ordre arbitraire ou calqué sur l'ordre des livres sources.
3. Dans chaque section, si plusieurs blocs disent la même chose (même en termes différents), fusionne-les en un seul bloc de synthèse — ne répète jamais un fait déjà couvert par un bloc de synthèse précédent, dans cette section ou une autre.
4. Si un bloc source apporte un détail complémentaire propre à un livre (absent des autres), garde-le — soit comme nuance dans un bloc existant, soit comme bloc à part si le sujet diffère assez — ne perds jamais une information réellement utile sous prétexte de dédupliquer.
5. Types de blocs disponibles, mêmes règles de contenu qu'une extraction normale :
${BLOCK_TYPES_DOC}
Ne fusionne jamais deux blocs sources de nature différente (ex. un tableau comparatif et une définition) dans un seul bloc de synthèse — ce sont deux blocs distincts, même s'ils traitent du même sous-thème.
6. Si deux blocs sources se contredisent factuellement sur un point précis (valeur numérique différente, conduite à tenir opposée), ne tranche PAS toi-même lequel a raison : garde les deux formulations dans le même bloc de synthèse en signalant explicitement la divergence (« Selon [nom du livre A] ... alors que selon [nom du livre B] ... »).
7. EXHAUSTIVITÉ — AUCUNE PERTE D'INFORMATION : chaque bloc source listé ci-dessus doit être repris par au moins un bloc de synthèse, quelque part dans une section. Avant de répondre, repasse mentalement la liste complète des identifiants [b1], [b2], [b3]... et vérifie qu'aucun n'est absent de tous les "source_block_ids" de ta réponse — un bloc source qui n'apporte vraiment rien d'utile (redondance totale déjà couverte ailleurs) doit quand même apparaître dans le "source_block_ids" du bloc de synthèse qui couvre ce même fait, jamais être simplement omis.
8. N'INVENTE RIEN : chaque bloc de synthèse doit être fondé UNIQUEMENT sur les blocs sources listés ci-dessus, jamais sur tes propres connaissances. Pour CHAQUE bloc de synthèse que tu écris, indique dans "source_block_ids" la liste complète des identifiants entre crochets des blocs sources qui l'ont nourri (ex. ["b3", "b7"]) — utilise tous les blocs sources pertinents pour ce point précis, pas seulement le premier trouvé, et n'omets aucun bloc source que tu as effectivement utilisé.

Réponds uniquement avec le JSON demandé (un tableau "sections", chacune avec "title" et "blocks"), structuré exactement selon le schéma fourni.
`.trim();
}

export function buildVerificationPrompt(extractionJson: string): string {
  return `
Tu reçois le document source (chapitre PDF) et, ci-dessous, un JSON d'extraction déjà produit à partir de ce document (sous-entités, fiches, blocs avec citations, flashcards). Ta seule tâche : vérifier la fidélité de chaque bloc et chaque flashcard à sa citation et au document source.

JSON d'extraction à vérifier :
${extractionJson}

Pour chaque bloc et chaque flashcard (identifiés par leur position dans le tableau "sub_entities[i].fiche.blocks"/"flashcards"), vérifie :
- La citation existe-t-elle réellement dans le document, à la page indiquée (ou une page très proche) ?
- Le contenu généré (content/front/back) est-il fidèle à cette citation, sans erreur, invention ni contresens ?

Ne corrige rien toi-même. Retourne uniquement la liste des éléments à signaler : pour chaque problème détecté, indique l'index de la sous-entité ("sub_entity_index"), l'index du bloc OU de la flashcard concerné ("block_index" ou "flashcard_index", l'autre à null), et une raison courte. N'inclus PAS les éléments corrects — seulement ceux qui nécessitent une relecture humaine attentive.

Réponds uniquement avec le JSON demandé, structuré exactement selon le schéma fourni.
`.trim();
}
