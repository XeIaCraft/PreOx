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

Objectif absolu : NE JAMAIS PERDRE D'INFORMATION IMPORTANTE. Le lecteur utilisera exclusivement ce que tu extrais pour réviser — tout ce que tu omets est perdu pour lui. En cas de doute sur l'importance d'une information, inclus-la plutôt que de l'omettre.

Étapes :

1. Identifie les sous-entités du chapitre dans l'ordre où elles apparaissent, en te basant sur les sous-titres/sections du livre lui-même (ex: un médicament par sous-entité en pharmacologie, une pathologie par sous-entité en pathologie, un dispositif/technique par sous-entité en anatomie/technique). Ne découpe PAS arbitrairement si le chapitre ne s'y prête pas — utilise le découpage naturel du livre.

2. Pour chaque sous-entité, produis UNE fiche composée de blocs de contenu TYPÉS (pas une rubrique unique et rigide) qui reflètent fidèlement ce que le livre dit réellement de cette sous-entité. Types de blocs disponibles :
${BLOCK_TYPES_DOC}

Règles strictes pour chaque bloc :
- "citations" est OBLIGATOIRE et non vide : chaque bloc doit citer verbatim (mot pour mot, sans paraphrase) le ou les passages du livre qui le fondent, avec le numéro de page tel qu'imprimé sur la page (pas le numéro de page du fichier PDF si différent).
- Ne génère jamais un bloc sans base textuelle vérifiable dans le document.
- Pour "tableau_comparatif", remplis "content.headers" et "content.rows" (un tableau réel), ne mets rien dans "content.text".
- Pour "protocole_paliers", remplis "content.steps" (liste ordonnée), pas "content.text".
- Pour les autres types, remplis "content.text" avec le contenu synthétisé (mais fidèle et complet — ne résume pas au point de perdre une nuance importante).

3. Pour chaque sous-entité, génère des flashcards de révision à partir UNIQUEMENT des faits déjà extraits et cités dans ses blocs (jamais directement depuis le texte brut, jamais un fait qui n'apparaît dans aucun bloc).

${FLASHCARD_QUALITY_DOC}

Chaque flashcard : une question précise et sans ambiguïté au recto ("front"), la réponse exacte attendue au verso ("back"), et sa/ses citation(s) source.

4. Indique enfin "estimated_remaining_passes" : ton estimation honnête du nombre de passes de complément supplémentaires ("Compléter l'extraction", qui relit le PDF pour combler les trous) probablement encore nécessaires pour une couverture quasi-exhaustive de ce chapitre. Base-toi sur la longueur/densité réelle du chapitre et sur ce que tu sens avoir pu couvrir en une seule lecture — 0 si le chapitre est court/simple et que tu es confiant d'avoir tout couvert, un chiffre plus élevé (2, 3...) pour un chapitre long ou très dense où une seule passe ne peut raisonnablement pas tout capter.

Réponds uniquement avec le JSON demandé, structuré exactement selon le schéma fourni.
`.trim();
}

export function buildComplementaryPrompt(chapterTitle: string, coverageSummaryJson: string): string {
  return `
Tu es le même assistant d'extraction que précédemment, sur le même chapitre « ${chapterTitle} ». Une première extraction a déjà été faite.

${EXPERT_READER_CONTEXT}

Voici un résumé de ce qui est déjà couvert (nom de chaque sous-entité, type et résumé de chacun de ses blocs déjà extraits, et les questions des flashcards déjà générées) :

${coverageSummaryJson}

Ta tâche cette fois : relis l'intégralité du document et identifie UNIQUEMENT les notions importantes qui ne sont PAS encore couvertes par ce résumé. N'invente rien et ne répète JAMAIS un fait déjà couvert, même reformulé — c'est le but exact de cette passe : combler les trous, pas dupliquer.

Pour chaque trou trouvé :
- S'il concerne une sous-entité déjà listée ci-dessus (même si elle est incomplète), ajoute les blocs et/ou flashcards manquants sous "additions_for_existing", avec "sub_entity_name" reprenant EXACTEMENT le nom déjà utilisé pour cette sous-entité (aucune variation, aucune reformulation).
- Si c'est un thème ou une sous-entité entièrement absente de la liste ci-dessus, crée une nouvelle entrée sous "new_sub_entities" (même structure que lors d'une extraction initiale : nom, résumé, fiche avec blocs et flashcards).

S'il n'y a réellement plus rien d'important à ajouter, retourne "additions_for_existing" et "new_sub_entities" comme des tableaux vides — ne force pas la génération de contenu superflu ou redondant juste pour remplir la réponse.

Pour les flashcards en particulier, regarde si le résumé ci-dessus laisse des faits testables sans carte pour une sous-entité donnée — pas seulement des sous-entités entières manquantes. Mêmes exigences de couverture et de niveau que lors d'une extraction initiale :

${FLASHCARD_QUALITY_DOC}

Mêmes règles strictes que pour l'extraction initiale : chaque bloc et chaque flashcard doit citer verbatim (page + texte exact) le passage du livre qui le fonde, les tableaux comparatifs vont dans un vrai tableau, les protocoles par paliers dans une liste d'étapes structurée.

Indique enfin "estimated_remaining_passes" : ta nouvelle estimation, APRÈS cette passe de complément, du nombre de passes encore probablement nécessaires pour une couverture quasi-exhaustive — 0 si tu es maintenant confiant que le chapitre est couvert dans son ensemble.

Réponds uniquement avec le JSON demandé, structuré exactement selon le schéma fourni.
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
