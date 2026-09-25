// More treatment classes and what they imply for the anaesthesia — same
// conventions as DEFAULT_DRUG_CLASSES (catalog-defaults.ts): general
// precautions only; whether and when to stop belongs to a rule. Enzyme
// inducers and inhibitors, renally cleared drugs: Manuel pratique
// d'anesthésie (2020), chapter 5. Editable in Paramètres.

import type { DrugClassItem } from "./catalog";

const d = (item: DrugClassItem): DrugClassItem => item;

export const EXTRA_DRUG_CLASSES: DrugClassItem[] = [
  // --- Cardiovasculaire ---------------------------------------------------------------
  d({ id: "betablockers", atc: "C07", label: "Bêtabloquants", attention: { level: "info", text: "Bêtabloquant : poursuivre, y compris le matin de l'intervention (arrêt brutal : effet rebond) ; bradycardie et réponse atténuée à l'hypovolémie." } }),
  d({ id: "acei_arb", atc: "C09", label: "IEC, sartans, sacubitril", attention: { level: "info", text: "IEC ou sartan : hypotension à l'induction (vasoplégie) ; poursuite ou arrêt la veille selon la règle retenue." } }),
  d({ id: "diuretics", atc: "C03", label: "Diurétiques", attention: { level: "info", text: "Diurétique : kaliémie, natrémie et volémie à vérifier ; souvent suspendu le matin de l'intervention." } }),
  d({ id: "mra", atc: "C03DA", label: "Antialdostérones", attention: { level: "info", text: "Spironolactone, éplérénone : hyperkaliémie, surtout avec IEC et insuffisance rénale." } }),
  d({ id: "dihydropyridines", atc: "C08C", label: "Inhibiteurs calciques (dihydropyridines)", attention: { level: "info", text: "Amlodipine, nifédipine… : poursuivre ; vasodilatation additive aux anesthésiques." } }),
  d({ id: "central_antihypertensives", atc: "C02AC", label: "Antihypertenseurs centraux", attention: { level: "medium", text: "Clonidine, moxonidine : ne pas arrêter brutalement (rebond hypertensif) ; diminue les besoins en anesthésiques." } }),
  d({ id: "ivabradine", atc: "C01EB17", label: "Ivabradine", attention: { level: "info", text: "Bradycardie sinusale ; poursuivre." } }),
  d({ id: "antiarrhythmics_3", atc: "C01BD", label: "Antiarythmiques de classe III", attention: { level: "medium", text: "Allongement du QT : éviter les autres médicaments qui l'allongent ; bradycardie." } }),
  d({ id: "heparins", atc: "B01AB", label: "Héparines (HNF, HBPM)", needsRule: true, attention: { level: "medium", text: "Héparine : délai avant la chirurgie et avant une ponction neuraxiale, plaquettes (TIH) ; reprise selon le risque hémorragique." } }),
  d({ id: "fondaparinux", atc: "B01AX05", label: "Fondaparinux", needsRule: true, attention: { level: "medium", text: "Demi-vie longue, élimination rénale : délais allongés si insuffisance rénale ; ponction neuraxiale prudente." } }),
  d({ id: "pentoxifylline", atc: "C04AD", label: "Vasodilatateurs périphériques", attention: { level: "info", text: "Effet antiagrégant modeste (pentoxifylline, cilostazol) à prendre en compte." } }),

  // --- Métabolisme ---------------------------------------------------------------------
  d({ id: "metformin", atc: "A10BA", label: "Biguanides (metformine)", needsRule: true, attention: { level: "info", text: "Metformine : acidose lactique si insuffisance rénale aiguë, hypoxie ou produit de contraste." } }),
  d({ id: "sulfonylureas", atc: "A10BB", label: "Sulfamides hypoglycémiants", needsRule: true, attention: { level: "medium", text: "Risque d'hypoglycémie pendant le jeûne : glycémies capillaires." } }),
  d({ id: "dpp4", atc: "A10BH", label: "Gliptines (inhibiteurs de la DPP-4)", attention: { level: "info", text: "Peu d'hypoglycémies ; souvent poursuivies." } }),
  d({ id: "antithyroid", atc: "H03B", label: "Antithyroïdiens", implies: "hyperthyroidism", attention: { level: "medium", text: "Hyperthyroïdie traitée : euthyroïdie à confirmer avant une chirurgie programmée ; agranulocytose possible (hémogramme)." } }),
  d({ id: "desmopressin", atc: "H01BA", label: "Desmopressine", attention: { level: "medium", text: "Hyponatrémie : natrémie ; restriction hydrique adaptée." } }),
  d({ id: "somatostatin", atc: "H01CB", label: "Analogues de la somatostatine", attention: { level: "info", text: "Octréotide : poursuivre (acromégalie, carcinoïde) ; glycémie." } }),
  d({ id: "gout_drugs", atc: "M04", label: "Antigoutteux", attention: { level: "info", text: "Colchicine : toxicité en cas d'insuffisance rénale ou d'inhibiteur du CYP3A4." } }),

  // --- Système nerveux ------------------------------------------------------------------
  d({ id: "tricyclics", atc: "N06AA", label: "Antidépresseurs tricycliques", attention: { level: "medium", text: "Effets anticholinergiques, allongement du QT, potentialisation des vasopresseurs indirects (éphédrine) : préférer les agonistes directs à doses réduites." } }),
  d({ id: "bupropion", atc: "N06AX12", label: "Bupropion", attention: { level: "info", text: "Abaisse le seuil épileptogène ; poursuivre." } }),
  d({ id: "triptans", atc: "N02CC", label: "Triptans", attention: { level: "info", text: "Vasoconstriction coronaire ; syndrome sérotoninergique avec d'autres sérotoninergiques." } }),
  d({ id: "gabapentinoids", atc: "N03AX", label: "Gabapentinoïdes et autres antiépileptiques", attention: { level: "info", text: "Prégabaline, gabapentine : poursuivre ; sédation additive, dépression respiratoire avec les opioïdes." } }),
  d({ id: "enzyme_inducers", atc: "N03AF", label: "Carbamazépine et apparentés", attention: { level: "medium", text: "Inducteur enzymatique (manuel, chap. 5) : besoins accrus en opioïdes, curares stéroïdiens et certains hypnotiques ; résistance aux curares." } }),
  d({ id: "phenytoin", atc: "N03AB", label: "Phénytoïne", attention: { level: "medium", text: "Inducteur enzymatique : résistance aux curares non dépolarisants, besoins accrus en opioïdes ; dosage si doute." } }),
  d({ id: "barbiturates", atc: "N03AA", label: "Phénobarbital", attention: { level: "medium", text: "Inducteur enzymatique (tolérance pharmacocinétique) ; sédation additive." } }),
  d({ id: "valproate", atc: "N03AG", label: "Valproate", attention: { level: "medium", text: "Inhibiteur enzymatique (manuel, chap. 5) ; thrombopénie et dysfonction plaquettaire : plaquettes avant une chirurgie hémorragique." } }),
  d({ id: "memantine", atc: "N06DX01", label: "Mémantine", implies: "cognitive", attention: { level: "info", text: "Antagoniste NMDA : prudence avec la kétamine." } }),
  d({ id: "smoking_cessation", atc: "N07BA", label: "Aide au sevrage tabagique", attention: { level: "info", text: "Varénicline, substituts nicotiniques : à poursuivre — sevrage bénéfique avant la chirurgie." } }),
  d({ id: "cannabinoids", atc: "N02BG10", label: "Cannabinoïdes médicaux", attention: { level: "info", text: "Tolérance aux hypnotiques ; sédation additive." } }),

  // --- Respiratoire ----------------------------------------------------------------------
  d({ id: "inhaled_bronchodilators", atc: "R03A", label: "Bronchodilatateurs inhalés", implies: "asthma", attention: { level: "info", text: "Poursuivre et apporter l'inhalateur ; prise le matin de l'intervention." } }),
  d({ id: "inhaled_steroids", atc: "R03BA", label: "Corticoïdes inhalés", attention: { level: "info", text: "Poursuivre ; doses élevées au long cours : discuter une insuffisance surrénalienne." } }),
  d({ id: "leukotriene", atc: "R03DC", label: "Antileucotriènes", attention: { level: "info", text: "Poursuivre (asthme)." } }),
  d({ id: "asthma_biologics", atc: "R03DX", label: "Biothérapies de l'asthme", implies: "asthma", attention: { level: "info", text: "Asthme sévère sous biothérapie : contrôle de l'asthme à vérifier avant une chirurgie programmée." } }),

  // --- Anti-infectieux (interactions) --------------------------------------------------------
  d({ id: "macrolides", atc: "J01FA", label: "Macrolides", attention: { level: "medium", text: "Inhibiteurs du CYP3A4 (érythromycine, clarithromycine — manuel, chap. 5) : prolongent midazolam, fentanyl, alfentanil ; allongement du QT." } }),
  d({ id: "fluoroquinolones", atc: "J01MA", label: "Fluoroquinolones", attention: { level: "info", text: "Allongement du QT ; abaisse le seuil épileptogène." } }),
  d({ id: "azoles", atc: "J02AC", label: "Antifongiques azolés", attention: { level: "medium", text: "Inhibiteurs puissants du CYP3A4 (kétoconazole — manuel, chap. 5) : prolongent midazolam et opioïdes ; QT." } }),
  d({ id: "antiretrovirals", atc: "J05A", label: "Antirétroviraux", implies: "hiv", attention: { level: "medium", text: "Ne pas interrompre ; interactions majeures (ritonavir, cobicistat : inhibiteurs du CYP3A4 — midazolam contre-indiqué par voie orale)." } }),
  d({ id: "hydroxychloroquine", atc: "P01BA", label: "Antipaludéens de synthèse", attention: { level: "info", text: "Hydroxychloroquine : allongement du QT ; poursuivre (lupus, polyarthrite)." } }),
  d({ id: "metronidazole", atc: "P01AB", label: "Métronidazole", attention: { level: "info", text: "Inhibiteur enzymatique (manuel, chap. 5) ; effet antabuse avec l'alcool." } }),

  // --- Immunologie, oncologie ----------------------------------------------------------------
  d({ id: "anti_tnf", atc: "L04AB", label: "Anti-TNF", attention: { level: "medium", text: "Risque infectieux : date de la dernière injection et moment de la chirurgie selon la règle ; ne pas arrêter sans avis." } }),
  d({ id: "jak_inhibitors", atc: "L04AF", label: "Inhibiteurs de JAK", attention: { level: "medium", text: "Risque infectieux et thrombotique ; arrêt préopératoire court selon la règle." } }),
  d({ id: "interleukin_inhibitors", atc: "L04AC", label: "Anti-interleukines", attention: { level: "info", text: "Risque infectieux ; injection programmée à caler sur la chirurgie." } }),
  d({ id: "methotrexate", atc: "L04AX03", label: "Méthotrexate", attention: { level: "info", text: "À faible dose : généralement poursuivi ; fonction rénale, hémogramme." } }),
  d({ id: "anthracyclines", atc: "L01DB", label: "Anthracyclines", attention: { level: "medium", text: "Cardiotoxicité : échocardiographie selon la dose cumulée et les symptômes." } }),
  d({ id: "bleomycin", atc: "L01DC01", label: "Bléomycine", attention: { level: "high", text: "Toxicité pulmonaire aggravée par l'oxygène : FiO₂ la plus basse possible, prudence avec le remplissage." } }),
  d({ id: "chemotherapy", atc: "L01", label: "Chimiothérapie et thérapies ciblées", attention: { level: "medium", text: "Cytopénies (hémogramme), cardiotoxicité, neuropathie à documenter avant une ALR ; délai depuis la dernière cure." } }),
  d({ id: "aromatase_inhibitors", atc: "L02BG", label: "Inhibiteurs de l'aromatase", attention: { level: "info", text: "Poursuivre ; ostéoporose (installation)." } }),
  d({ id: "gnrh", atc: "L02AE", label: "Analogues de la GnRH", attention: { level: "info", text: "Allongement du QT possible ; poursuivre." } }),

  // --- Divers --------------------------------------------------------------------------------
  d({ id: "testosterone", atc: "G03B", label: "Androgènes", attention: { level: "info", text: "Polyglobulie et risque thrombotique : hémogramme." } }),
  d({ id: "antiemetics_5ht3", atc: "A04AA", label: "Sétrons", attention: { level: "info", text: "Allongement du QT ; syndrome sérotoninergique avec d'autres sérotoninergiques." } }),
  d({ id: "denosumab", atc: "M05BX04", label: "Dénosumab", attention: { level: "info", text: "Hypocalcémie possible ; ostéonécrose de la mâchoire (chirurgie dentaire)." } }),
  d({ id: "dantrolene", atc: "M03CA", label: "Dantrolène", attention: { level: "info", text: "Myorelaxant : potentialise les curares ; poursuivre." } }),
  d({ id: "carbonic_anhydrase", atc: "S01EC", label: "Inhibiteurs de l'anhydrase carbonique", attention: { level: "info", text: "Acétazolamide : acidose métabolique, hypokaliémie." } }),
  d({ id: "retinoids", atc: "D10BA", label: "Rétinoïdes", attention: { level: "info", text: "Isotrétinoïne : grossesse exclue ; sécheresse des muqueuses." } }),
];
