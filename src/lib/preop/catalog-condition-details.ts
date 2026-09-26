// Structured details asked once an antecedent is present — the stage,
// class or delay that changes the anaesthetic assessment — using the usual
// classifications (KDIGO, NYHA, CCS, Child-Pugh, GOLD, AHI, GINA, MGFA,
// ESC valve severity). ASA classes follow the examples of the ASA 2020
// update; « severe », « recent », « poorly controlled » feed the scores
// and rules. Editable in Paramètres › Antécédents.

import type { AttentionSpec, ConditionDetail, DetailOption } from "./catalog";

const choice = (id: string, label: string, options: DetailOption[], hint?: string): ConditionDetail => ({ id, label, kind: "choice", options, hint });
const num = (id: string, label: string, unit: string, hint?: string): ConditionDetail => ({ id, label, kind: "number", unit, hint });
const date = (id: string, label: string, hint?: string): ConditionDetail => ({ id, label, kind: "date", hint });
const text = (id: string, label: string, hint?: string): ConditionDetail => ({ id, label, kind: "text", hint });
const o = (code: string, label: string, extra: Omit<DetailOption, "code" | "label"> = {}): DetailOption => ({ code, label, ...extra });
const high = (t: string, material?: string[]): AttentionSpec => ({ level: "high", text: t, material });
const medium = (t: string, material?: string[]): AttentionSpec => ({ level: "medium", text: t, material });

/** Delay since an event (MI, stent, stroke, VTE): < 3 months counts as « recent ». */
const delay = (id: string, label: string, recentAttention: AttentionSpec, recentAsa?: number) =>
  choice(id, label, [o("lt3", "< 3 mois", { qualifier: "recent", asa: recentAsa, attention: recentAttention }), o("3to12", "3 à 12 mois"), o("gt12", "> 12 mois")]);

export const DEFAULT_CONDITION_DETAILS: Record<string, ConditionDetail[]> = {
  hypertension: [
    choice("control", "Contrôle", [o("controlled", "Contrôlée sous traitement", { asa: 2 }), o("uncontrolled", "Non contrôlée", { asa: 3, qualifier: "poorlyControlled" })], "Selon les mesures à domicile ou chez le médecin traitant ; la mesure du jour est dans l'étape Patient."),
    text("organ", "Retentissement", "HVG, insuffisance rénale, rétinopathie…"),
  ],
  coronary: [
    delay("since", "Dernier événement (infarctus, stent, pontage)", high("Moins de 3 mois : avis cardiologique sur le délai de la chirurgie non urgente et sur les antiagrégants ; ne jamais interrompre une double antiagrégation sans cet avis."), 4),
    choice("stent", "Stent", [o("none", "Aucun"), o("des", "Actif (pharmacologique)"), o("bms", "Nu"), o("unknown", "Type inconnu")]),
    choice("ccs", "Angor actuel (classe CCS)", [o("0", "Aucun"), o("1", "I : effort intense"), o("2", "II : effort ordinaire"), o("3", "III : effort léger", { qualifier: "severe", asa: 4, attention: high("Angor à l'effort léger : ischémie active probable, avis cardiologique avant toute chirurgie non urgente.") }), o("4", "IV : au moindre effort ou au repos", { qualifier: "severe", asa: 4, attention: high("Angor instable ou de repos : avis cardiologique avant toute chirurgie non urgente.") })]),
  ],
  heart_failure: [
    choice("nyha", "Classe NYHA", [o("1", "I : aucune limitation"), o("2", "II : effort ordinaire", { asa: 3 }), o("3", "III : effort léger", { asa: 3 }), o("4", "IV : au repos", { asa: 4, qualifier: "severe", attention: high("Insuffisance cardiaque décompensée ou NYHA IV : avis cardiologique, chirurgie non urgente reportée.") })], "Aussi dans l'étape Évaluation."),
    choice("ef", "FEVG", [o("pef", "≥ 50 % (préservée)", { asa: 3 }), o("mref", "41–49 % (modérément réduite)", { asa: 3 }), o("ref", "≤ 40 % (réduite)", { asa: 3 }), o("severe", "< 30 % (sévèrement réduite)", { asa: 4, qualifier: "severe", attention: high("FEVG sévèrement réduite : échographie récente, avis cardiologique, monitorage invasif à discuter.", ["Pression artérielle invasive (à discuter)"]) })], "Classes de l'ESC 2021 ; ASA IV si réduction sévère."),
    date("echo", "Dernière échocardiographie"),
  ],
  aortic_stenosis: [
    choice("severity", "Sévérité (échocardiographie)", [o("mild", "Légère (Vmax < 3 m/s)", { asa: 2 }), o("moderate", "Modérée (Vmax 3–3,9 m/s, gradient moyen 20–39 mmHg)", { asa: 3 }), o("severe", "Serrée (Vmax ≥ 4 m/s, gradient moyen ≥ 40 mmHg, surface < 1 cm²)", { asa: 4, qualifier: "severe" })], "Critères ESC/EACTS 2021."),
    choice("symptoms", "Symptômes", [o("none", "Asymptomatique"), o("yes", "Angor, syncope ou dyspnée", { qualifier: "severe", asa: 4, attention: high("Rétrécissement aortique symptomatique : avis cardiologique (remplacement valvulaire avant une chirurgie non urgente à discuter).") })]),
    date("echo", "Dernière échocardiographie"),
  ],
  valve: [
    choice("severity", "Sévérité", [o("mild", "Légère"), o("moderate", "Modérée", { asa: 3 }), o("severe", "Sévère", { asa: 4, qualifier: "severe" })]),
    text("which", "Valve et lésion", "ex. insuffisance mitrale"),
  ],
  arrhythmia: [
    choice("type", "Type", [o("paroxysmal", "FA paroxystique"), o("persistent", "FA persistante"), o("permanent", "FA permanente"), o("flutter", "Flutter"), o("other", "Autre trouble du rythme")]),
    choice("rate", "Contrôle de la fréquence", [o("ok", "FC de repos < 110 /min"), o("fast", "Non contrôlée (≥ 110 /min)", { qualifier: "poorlyControlled", attention: medium("FA rapide : contrôle de la fréquence avant une chirurgie programmée.") })], "Seuil de l'ESC (contrôle souple de la fréquence)."),
  ],
  pacemaker: [
    choice("device", "Appareil", [o("pm", "Pacemaker"), o("icd", "Défibrillateur (DAI)", { attention: high("DAI : désactiver les thérapies (programmation ou aimant selon la procédure du service) si bistouri monopolaire au-dessus de l'ombilic ; défibrillateur externe prêt.", ["Aimant", "Défibrillateur avec électrodes"]) }), o("crt", "Resynchronisation (CRT)")]),
    choice("dependent", "Dépendant du stimulateur", [o("no", "Non"), o("yes", "Oui", { attention: high("Patient dépendant : programmation en mode asynchrone à discuter, stimulation de secours prête.", ["Électrodes de stimulation transcutanée", "Aimant"]) })]),
    date("check", "Dernier contrôle", "Contrôle de moins de 6 mois (PM) ou 3 à 6 mois (DAI) habituellement demandé."),
  ],
  pulmonary_hypertension: [
    choice("who", "Classe fonctionnelle (OMS)", [o("1", "I"), o("2", "II", { asa: 3 }), o("3", "III", { asa: 4, qualifier: "severe" }), o("4", "IV", { asa: 4, qualifier: "severe" })]),
    num("paps", "PAPs estimée (échographie)", "mmHg"),
  ],
  asthma: [
    choice("control", "Contrôle (GINA)", [o("controlled", "Contrôlé", { asa: 2 }), o("partial", "Partiellement contrôlé", { asa: 2 }), o("uncontrolled", "Non contrôlé", { asa: 3, qualifier: "poorlyControlled" })], "Sur les 4 dernières semaines : symptômes diurnes > 2/semaine, réveils nocturnes, bronchodilatateur > 2/semaine, limitation."),
    choice("exacerbation", "Exacerbation ou corticoïdes oraux < 3 mois", [o("no", "Non"), o("yes", "Oui", { qualifier: "recent", attention: medium("Exacerbation récente : optimiser et reporter une chirurgie programmée si possible.") })]),
  ],
  copd: [
    choice("gold", "Sévérité (GOLD, VEMS)", [o("1", "GOLD 1 : VEMS ≥ 80 %"), o("2", "GOLD 2 : 50–79 %"), o("3", "GOLD 3 : 30–49 %", { qualifier: "severe", attention: high("BPCO sévère : EFR et gazométrie récentes, kinésithérapie pré- et postopératoire, ALR si possible.") }), o("4", "GOLD 4 : < 30 %", { qualifier: "severe", asa: 4, attention: high("BPCO très sévère : avis pneumologique, gazométrie, surveillance postopératoire rapprochée.") })]),
    choice("exacerbation", "Exacerbation < 1 mois", [o("no", "Non"), o("yes", "Oui", { qualifier: "recent", attention: medium("Exacerbation récente : reporter une chirurgie programmée si possible.") })]),
  ],
  osa: [
    choice("ahi", "Sévérité (IAH)", [o("mild", "Léger : 5–14 /h"), o("moderate", "Modéré : 15–29 /h"), o("severe", "Sévère : ≥ 30 /h", { qualifier: "severe", attention: high("SAOS sévère : PPC du patient au réveil, épargne morphinique, surveillance prolongée de la SpO₂.", ["PPC du patient"]) })]),
    choice("cpap", "Appareillé", [o("yes", "Oui, PPC utilisée"), o("no", "Non ou mal toléré", { qualifier: "poorlyControlled" })]),
  ],
  home_o2: [num("flow", "Débit d'oxygène", "L/min")],
  diabetes_oral: [
    choice("hypo", "Hypoglycémies", [o("no", "Non"), o("yes", "Fréquentes ou sévères", { attention: medium("Hypoglycémies fréquentes : surveillance glycémique rapprochée pendant le jeûne.") })]),
    text("complications", "Complications", "Néphropathie, neuropathie (gastroparésie, dysautonomie), rétinopathie, coronaropathie…"),
  ],
  diabetes_insulin: [
    choice("type", "Type", [o("t1", "Type 1", { attention: high("Diabète de type 1 : ne jamais arrêter l'insuline basale (risque d'acidocétose), glycémies capillaires horaires pendant le jeûne.") }), o("t2", "Type 2 insulinotraité")]),
    choice("pump", "Pompe ou capteur", [o("no", "Non"), o("pump", "Pompe à insuline", { attention: medium("Pompe à insuline : plan avec le patient ou l'équipe de diabétologie (débit basal, retrait, relais).") }), o("cgm", "Capteur de glucose seul")]),
    choice("hypo", "Hypoglycémies", [o("no", "Non"), o("yes", "Fréquentes ou sévères")]),
  ],
  thyroid: [choice("type", "Type", [o("hypo", "Hypothyroïdie"), o("hyper", "Hyperthyroïdie"), o("goitre", "Goitre (voies aériennes)", { attention: medium("Goitre : rechercher une compression trachéale (dyspnée, stridor, imagerie).") })])],
  ckd: [
    choice("kdigo", "Stade KDIGO (DFGe)", [o("g3a", "G3a : 45–59", { asa: 2 }), o("g3b", "G3b : 30–44", { asa: 3 }), o("g4", "G4 : 15–29", { asa: 3, attention: high("Insuffisance rénale sévère : adapter chaque posologie, éviter AINS et produits de contraste, kaliémie.") }), o("g5", "G5 : < 15, non dialysé", { asa: 4, qualifier: "severe" })], "Le DFGe calculé est affiché dans l'étape Patient."),
  ],
  dialysis: [
    choice("type", "Type", [o("hd", "Hémodialyse"), o("pd", "Dialyse péritonéale")]),
    choice("side", "Fistule", [o("left", "Bras gauche"), o("right", "Bras droit"), o("none", "Cathéter / pas de fistule")], "Bras de la fistule : ni brassard ni perfusion."),
    text("days", "Jours de dialyse"),
  ],
  cirrhosis: [
    choice("child", "Child-Pugh", [o("a", "A (5–6)", { asa: 3 }), o("b", "B (7–9)", { asa: 3, attention: high("Cirrhose Child B : risque opératoire élevé, avis hépatologique pour une chirurgie programmée.") }), o("c", "C (10–15)", { asa: 4, qualifier: "severe", attention: high("Cirrhose Child C : chirurgie programmée généralement contre-indiquée, avis hépatologique.") })]),
    num("meld", "MELD", ""),
    choice("varices", "Varices œsophagiennes", [o("no", "Non / inconnues"), o("yes", "Oui", { attention: medium("Varices œsophagiennes : pas de sonde gastrique à l'aveugle.") })]),
  ],
  stroke: [
    choice("since", "Délai depuis l'AVC / AIT", [o("lt3", "< 3 mois", { qualifier: "recent", asa: 4, attention: high("AVC / AIT de moins de 3 mois : discuter le report d'une chirurgie non urgente ; maintenir la pression de perfusion.") }), o("3to9", "3 à 9 mois"), o("gt9", "> 9 mois")]),
    text("sequelae", "Séquelles", "Documenter le déficit avant une ALR."),
  ],
  vte: [delay("since", "Dernier épisode", medium("Thrombose de moins de 3 mois : chirurgie programmée à différer si possible ; anticoagulation et relais selon vos règles."))],
  epilepsy: [choice("control", "Contrôle", [o("controlled", "Pas de crise depuis 1 an"), o("recent", "Crises récentes", { qualifier: "poorlyControlled", attention: medium("Épilepsie mal contrôlée : avis neurologique, antiépileptiques le matin de l'intervention.") })])],
  parkinson: [
    choice("device", "Traitement particulier", [o("none", "Aucun"), o("dbs", "Stimulation cérébrale profonde", { attention: high("Neurostimulateur : désactivation selon le neurologue, bistouri bipolaire.") }), o("pump", "Pompe (apomorphine, lévodopa intestinale)", { attention: high("Pompe : ne pas interrompre sans plan de relais (neurologue).") })]),
  ],
  myasthenia: [
    choice("mgfa", "Classe MGFA", [o("1", "I : oculaire"), o("2", "II : généralisée légère"), o("3", "III : modérée", { qualifier: "severe" }), o("4", "IV : sévère", { qualifier: "severe", asa: 4 }), o("5", "V : intubée", { qualifier: "severe", asa: 4 })]),
    choice("bulbar", "Atteinte bulbaire ou respiratoire", [o("no", "Non"), o("yes", "Oui", { attention: high("Atteinte bulbaire : risque d'inhalation et de ventilation postopératoire prolongée ; soins intensifs à prévoir.") })]),
  ],
  anemia: [choice("iron", "Bilan martial", [o("todo", "À faire"), o("deficient", "Carence martiale", { attention: medium("Carence martiale : fer (IV si délai court) avant une chirurgie à risque hémorragique.") }), o("normal", "Normal")]), text("cause", "Cause")],
  thrombocytopenia: [text("cause", "Cause", "Médicament, hépatopathie, PTI, hémopathie…")],
  bleeding_disorder: [text("which", "Trouble et sévérité", "ex. Willebrand type 1, taux de facteur…")],
  pregnancy: [
    num("weeks", "Terme", "SA", "Au-delà de 20 SA : décubitus latéral gauche, risque d'inhalation."),
    choice("rhesus", "Rhésus", [o("pos", "Positif"), o("neg", "Négatif", { attention: medium("Rhésus négatif : immunoglobulines anti-D (200 µg) dans les 72 h après l'accouchement ou tout saignement (manuel, chap. 36).") })]),
  ],
  ex_premature: [num("birthWeeks", "Terme de naissance", "SA", "Sert à calculer l'âge post-conceptionnel (apnées jusqu'à 52 semaines).")],
  difficult_airway: [
    choice("letter", "Courrier ou carte d'intubation difficile", [o("yes", "Oui, récupéré"), o("no", "Non, à récupérer")]),
    text("what", "Ce qui a été difficile et ce qui a marché"),
  ],
  malignant_hyperthermia: [
    choice("who", "Concerné", [o("patient", "Le patient"), o("family", "Un apparenté")]),
    choice("test", "Test de contracture / génétique", [o("done_pos", "Fait, positif"), o("done_neg", "Fait, négatif"), o("none", "Non fait")]),
  ],
  anaesthetic_allergy: [text("drug", "Produit en cause"), choice("workup", "Bilan allergologique", [o("done", "Fait"), o("none", "Non fait", { attention: high("Réaction per-anesthésique sans bilan : bilan allergologique avant une chirurgie programmée ; éviter tous les produits alors administrés.") })])],
  kidney_transplant: [date("when", "Date de la greffe")],
  transplant: [text("organ", "Organe et date")],
  bariatric_history: [
    choice("type", "Intervention", [
      o("bypass", "Bypass gastrique", { attention: medium("Bypass : absorption des médicaments oraux modifiée, carences (fer, B12, vitamines), AINS à éviter (ulcère anastomotique) ; pas de sonde gastrique à l'aveugle.") }),
      o("sleeve", "Sleeve gastrectomie", { attention: medium("Sleeve : reflux gastro-œsophagien fréquent (inhalation) ; carences à rechercher.") }),
      o("band", "Anneau gastrique", { attention: high("Anneau : mal positionné ou trop serré, risque d'inhalation (séquence rapide — manuel, chap. 44) ; demander dysphagie et vomissements.") }),
      o("other", "Autre ou plusieurs"),
    ]),
    date("when", "Date"),
  ],
  cancer: [
    choice(
      "extent",
      "Extension",
      [
        o("local", "Localisée, sans retentissement général", { asa: 1 }),
        o("advanced", "Localement avancée ou avec retentissement (amaigrissement, anémie, douleur)", { asa: 3 }),
        o("metastatic", "Métastatique", { asa: 3 }),
        o("remission", "Traitée, en rémission", { asa: 1 }),
      ],
      "L'ASA décrit le retentissement général : une tumeur localisée qui motive l'intervention, sans autre maladie, ne l'élève pas ; les autres antécédents et la chimiothérapie comptent à part."
    ),
    text("treatment", "Traitement en cours", "Chimiothérapie, radiothérapie, immunothérapie, hormonothérapie…"),
    choice("radiotherapy", "Radiothérapie", [o("none", "Aucune"), o("neck", "Cervicale ou ORL", { attention: high("Cou irradié : sclérose cervicale, trismus, ostéoradionécrose — intubation difficile possible (manuel, chap. 45).") }), o("chest", "Médiastinale ou thoracique", { attention: medium("Médiastin irradié : péricardite, poumon radique, toxicité cardiaque des anthracyclines majorée (manuel, chap. 45).") }), o("other", "Autre site")]),
  ],
  chemotherapy: [
    choice("anthracycline", "Anthracyclines (doxorubicine…)", [o("no", "Non"), o("yes", "Oui", { attention: medium("Cardiotoxicité (aiguë à retardée) : ECG et échocardiographie, surtout si doses élevées, médiastin irradié, âge < 15 ou > 65 ans (manuel, chap. 45).") })]),
    choice("bleomycin", "Bléomycine", [o("no", "Non"), o("yes", "Oui", { attention: high("Fibrose pulmonaire aggravée par l'oxygène : FiO₂ la plus basse possible pour SpO₂ 88–92 %, apports liquidiens prudents (manuel, chap. 45).") })]),
    choice("neurotoxic", "Neurotoxique (platine, vincristine, taxane)", [o("no", "Non"), o("yes", "Oui", { attention: medium("Neuropathie périphérique à documenter avant une ALR ; cisplatine : fonction rénale, hypomagnésémie (manuel, chap. 45).") })]),
  ],
  burns: [
    num("tbsa", "Surface brûlée (2e et 3e degrés)", "%", "Règle des 9 ; la paume de la main du patient ≈ 1 %."),
    choice("inhalation", "Inhalation de fumées", [o("no", "Non"), o("yes", "Oui", { qualifier: "severe", attention: high("Inhalation de fumées : intubation précoce avant l'œdème (sonde plus petite), bronchoscopie ; CO (O₂ 100 %) et cyanures (hydroxocobalamine) (manuel, chap. 41).") })]),
  ],
};
