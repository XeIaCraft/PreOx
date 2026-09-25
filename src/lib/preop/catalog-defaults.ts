// Default allergens and treatment-class implications, and the assembled
// default catalogues. Editable in Paramètres.

import type { AllergenItem, Catalogs, DrugClassItem, Interaction, MedicationItem, SurgeryItem } from "./catalog";
import { DEFAULT_CONDITIONS } from "./catalog-conditions";
import { MEDICATIONS } from "./medications";
import { SURGERY_CATALOG } from "./surgeries";
import { DEFAULT_VALUE_CHECKS } from "./value-checks";

const a = (item: AllergenItem): AllergenItem => item;

export const DEFAULT_ALLERGENS: AllergenItem[] = [
  a({ id: "latex", label: "Latex", keywords: ["latex", "caoutchouc"], drugWords: [], attention: { level: "high", text: "Salle et matériel sans latex, patient en premier du programme si possible.", material: ["Salle sans latex"] } }),
  a({
    id: "chlorhexidine",
    label: "Chlorhexidine",
    keywords: ["chlorhexidine", "hibitane", "hibidil", "hibiscrub"],
    drugWords: ["chlorhexidine"],
    attention: { level: "high", text: "Antisepsie sans chlorhexidine ; attention aux cathéters imprégnés et aux gels urétraux." },
    needsRule: true,
  }),
  a({
    id: "nmba",
    label: "Curares",
    keywords: ["curare", "curares", "rocuronium", "esmeron", "succinylcholine", "suxaméthonium", "celocurine", "atracurium", "cisatracurium", "nimbex", "vécuronium", "mivacurium"],
    drugWords: ["rocuronium", "succinylcholine", "suxaméthonium", "atracurium", "cisatracurium", "vécuronium", "mivacurium"],
    attention: { level: "high", text: "Allergie aux curares : bilan allergologique avant une nouvelle anesthésie ; éviter la molécule en cause et discuter les réactivités croisées." },
    needsRule: true,
  }),
  a({
    id: "betalactams",
    label: "Pénicillines / bêtalactamines",
    keywords: ["pénicilline", "penicilline", "amoxicilline", "augmentin", "clamoxyl", "bêtalactamine", "betalactamine", "flucloxacilline", "pipéracilline", "tazocin"],
    drugWords: ["amoxicilline", "pénicilline", "pipéracilline", "flucloxacilline", "céfazoline", "cefazoline", "céfuroxime", "cefuroxime", "ceftriaxone"],
    attention: { level: "high", text: "Préciser la réaction (immédiate, grave, retardée) ; antibioprophylaxie à adapter." },
    assessment: "pen-fast",
    needsRule: true,
  }),
  a({
    id: "cephalosporins",
    label: "Céphalosporines",
    keywords: ["céphalosporine", "céfazoline", "cefazoline", "kefzol", "céfuroxime", "cefuroxime", "zinacef", "ceftriaxone"],
    drugWords: ["céfazoline", "cefazoline", "céfuroxime", "cefuroxime", "ceftriaxone"],
    attention: { level: "high", text: "Antibioprophylaxie alternative à prévoir." },
    needsRule: true,
  }),
  a({
    id: "nsaids",
    label: "AINS / aspirine",
    keywords: ["ains", "anti-inflammatoire", "ibuprofène", "ibuprofene", "nurofen", "diclofénac", "voltaren", "aspirine", "kétorolac", "naproxène", "kétoprofène"],
    drugWords: ["kétorolac", "ketorolac", "ibuprofène", "ibuprofene", "diclofénac", "kétoprofène", "aspirine", "acide acétylsalicylique"],
    attention: { level: "medium", text: "Pas d'AINS ; asthme induit par l'aspirine possible." },
  }),
  a({
    id: "opioids",
    label: "Morphiniques",
    keywords: ["morphine", "codéine", "codeine", "tramadol", "oxycodone", "opiacé", "opioïde", "piritramide", "dipidolor", "fentanyl", "sufentanil", "rémifentanil", "hydromorphone"],
    drugWords: ["morphine", "codéine", "tramadol", "oxycodone", "piritramide", "fentanyl", "sufentanil", "rémifentanil", "remifentanil", "hydromorphone"],
    attention: { level: "medium", text: "Préciser (souvent intolérance : nausées, prurit) ; choisir un autre morphinique." },
  }),
  a({
    id: "local_anaesthetics",
    label: "Anesthésiques locaux",
    keywords: ["anesthésique local", "anesthésie locale", "lidocaïne", "lidocaine", "xylocaïne", "bupivacaïne", "ropivacaïne", "naropin", "mépivacaïne", "dentiste"],
    drugWords: ["lidocaïne", "lidocaine", "bupivacaïne", "bupivacaine", "ropivacaïne", "ropivacaine", "mépivacaïne", "lévobupivacaïne", "chloroprocaïne", "prilocaïne"],
    attention: { level: "high", text: "Vraie allergie rare : préciser (réaction à l'adrénaline, malaise vagal ?) ; bilan allergologique si doute avant une ALR." },
  }),
  a({ id: "iodinated_contrast", label: "Produits de contraste iodés", keywords: ["iode", "iodé", "produit de contraste", "scanner"], drugWords: [], attention: { level: "medium", text: "Préciser le produit et la réaction ; pas d'allergie croisée avec les fruits de mer." } }),
  a({ id: "povidone", label: "Povidone iodée", keywords: ["bétadine", "isobétadine", "povidone", "iso-betadine"], drugWords: ["povidone", "bétadine"], attention: { level: "medium", text: "Antisepsie sans povidone iodée." } }),
  a({ id: "gelatin", label: "Gélatines", keywords: ["gélatine", "geloplasma", "gelofusine", "gélofusine"], drugWords: ["gélatine", "geloplasma", "gelofusine"], attention: { level: "medium", text: "Pas de gélatines (colloïdes, éponges hémostatiques)." } }),
  a({ id: "dyes", label: "Colorants (bleu patenté, bleu de méthylène)", keywords: ["bleu patenté", "bleu de méthylène", "patent blue", "isosulfan"], drugWords: ["bleu"], attention: { level: "medium", text: "Colorants de repérage à éviter (ganglion sentinelle)." } }),
  a({ id: "sugammadex", label: "Sugammadex", keywords: ["sugammadex", "bridion"], drugWords: ["sugammadex"], attention: { level: "high", text: "Décurarisation : néostigmine ou curare sans antagonisation spécifique." } }),
  a({ id: "paracetamol", label: "Paracétamol", keywords: ["paracétamol", "paracetamol", "dafalgan", "perdolan", "panadol"], drugWords: ["paracétamol", "paracetamol"], attention: { level: "medium", text: "Analgésie sans paracétamol." } }),
  a({ id: "metamizole", label: "Métamizole", keywords: ["métamizole", "metamizole", "novalgine", "dipyrone"], drugWords: ["métamizole", "metamizole"], attention: { level: "medium", text: "Analgésie sans métamizole." } }),
  a({
    id: "propofol",
    label: "Propofol",
    keywords: ["propofol", "diprivan"],
    drugWords: ["propofol"],
    attention: { level: "high", text: "Préciser la réaction et récupérer le bilan ; induction avec un autre hypnotique." },
  }),
  a({
    id: "egg_soy",
    label: "Œuf, soja, arachide",
    keywords: ["oeuf", "œuf", "soja", "arachide", "cacahuète", "cacahuete"],
    drugWords: [],
    attention: { level: "info", text: "Ne contre-indique pas le propofol (recommandations des sociétés d'allergologie et d'anesthésie)." },
  }),
  a({
    id: "latex_fruits",
    label: "Kiwi, avocat, banane, châtaigne",
    keywords: ["kiwi", "avocat", "banane", "châtaigne", "chataigne"],
    drugWords: [],
    attention: { level: "medium", text: "Syndrome latex-fruits : rechercher une allergie au latex ; salle sans latex en cas de doute." },
  }),
  a({
    id: "clindamycin",
    label: "Clindamycine",
    keywords: ["clindamycine", "dalacin"],
    drugWords: ["clindamycine"],
    attention: { level: "high", text: "Antibioprophylaxie alternative à prévoir (souvent l'alternative aux bêtalactamines)." },
    needsRule: true,
  }),
  a({
    id: "vancomycin",
    label: "Vancomycine",
    keywords: ["vancomycine"],
    drugWords: ["vancomycine"],
    attention: { level: "medium", text: "Distinguer une vraie allergie d'un « red man syndrome » (lié à la vitesse de perfusion)." },
  }),
  a({
    id: "sulfonamides",
    label: "Sulfamides antibiotiques",
    keywords: ["sulfamide", "sulfamides", "bactrim", "eusaprim", "cotrimoxazole", "sulfaméthoxazole"],
    drugWords: ["sulfaméthoxazole", "cotrimoxazole"],
    attention: { level: "medium", text: "Éviter les sulfamides antibiotiques ; pas de réactivité croisée démontrée avec les sulfamides non antibiotiques (furosémide…)." },
  }),
  a({
    id: "quinolones",
    label: "Quinolones",
    keywords: ["quinolone", "ciprofloxacine", "ciproxine", "lévofloxacine", "levofloxacine", "tavanic", "moxifloxacine", "avelox"],
    drugWords: ["ciprofloxacine", "lévofloxacine", "levofloxacine", "moxifloxacine"],
    attention: { level: "medium", text: "Éviter les fluoroquinolones." },
  }),
  a({
    id: "heparins",
    label: "Héparines",
    keywords: ["héparine", "heparine", "clexane", "fraxiparine", "énoxaparine", "enoxaparine", "innohep", "fragmin"],
    drugWords: ["héparine", "heparine", "énoxaparine", "enoxaparine", "nadroparine", "tinzaparine", "daltéparine"],
    attention: { level: "high", text: "Préciser : allergie cutanée ou thrombopénie induite (TIH) ; thromboprophylaxie alternative à prévoir." },
    needsRule: true,
  }),
  a({ id: "protamine", label: "Protamine", keywords: ["protamine"], drugWords: ["protamine"], attention: { level: "high", text: "Neutralisation de l'héparine sans protamine à prévoir ; risque plus élevé si insuline NPH ou allergie au poisson." } }),
  a({ id: "seafood", label: "Poissons, crustacés, fruits de mer", keywords: ["crustacés", "crustaces", "fruits de mer", "poisson", "crevette", "moules"], drugWords: [], attention: { level: "info", text: "Pas de réactivité croisée avec la povidone iodée ni les produits de contraste iodés." } }),
  a({ id: "nickel", label: "Nickel / métaux", keywords: ["nickel", "métaux", "metaux", "bijoux fantaisie"], drugWords: [], attention: { level: "info", text: "Signaler au chirurgien en cas d'implant métallique." } }),
  a({ id: "aminoglycosides", label: "Aminosides", keywords: ["gentamicine", "amikacine", "tobramycine", "aminoside", "geomycine"], drugWords: ["gentamicine", "amikacine", "tobramycine"], attention: { level: "medium", text: "Pas d'aminoside : antibioprophylaxie alternative à prévoir." } }),
  a({ id: "metronidazole", label: "Métronidazole", keywords: ["métronidazole", "metronidazole", "flagyl"], drugWords: ["métronidazole", "metronidazole"], attention: { level: "medium", text: "Antibioprophylaxie alternative (chirurgie colorectale, gynécologique)." } }),
  a({ id: "macrolides", label: "Macrolides", keywords: ["macrolide", "clarithromycine", "azithromycine", "érythromycine", "zithromax", "biclar"], drugWords: ["clarithromycine", "azithromycine", "érythromycine"], attention: { level: "info", text: "Éviter les macrolides." } }),
  a({ id: "ethylene_oxide", label: "Oxyde d'éthylène", keywords: ["oxyde d'éthylène", "oxyde d'ethylene"], drugWords: [], attention: { level: "high", text: "Matériel stérilisé à l'oxyde d'éthylène à éviter (cathéters, circuits, dialyse) : prévenir la stérilisation et le bloc.", material: ["Matériel non stérilisé à l'oxyde d'éthylène"] } }),
  a({ id: "hyaluronidase", label: "Hyaluronidase", keywords: ["hyaluronidase", "hylase"], drugWords: ["hyaluronidase"], attention: { level: "medium", text: "Bloc ophtalmique sans hyaluronidase." } }),
  a({ id: "benzodiazepines", label: "Benzodiazépines", keywords: ["benzodiazépine", "midazolam", "dormicum", "lorazépam", "diazépam", "valium"], drugWords: ["midazolam", "lorazépam", "diazépam"], attention: { level: "medium", text: "Préciser la réaction (souvent effet paradoxal ou intolérance) ; prémédication sans benzodiazépine." } }),
  a({ id: "setrons", label: "Sétrons", keywords: ["ondansétron", "ondansetron", "zofran", "granisétron", "sétron"], drugWords: ["ondansétron", "ondansetron", "granisétron"], attention: { level: "info", text: "Prophylaxie des NVPO sans sétron (dexaméthasone, dropéridol selon le QT)." } }),
  a({ id: "adhesives", label: "Adhésifs / pansements", keywords: ["sparadrap", "pansement", "adhésif", "plâtre adhésif", "tegaderm"], drugWords: [], attention: { level: "info", text: "Matériel de fixation hypoallergénique.", material: ["Adhésifs hypoallergéniques"] } }),
];

const d = (item: DrugClassItem): DrugClassItem => item;

export const DEFAULT_DRUG_CLASSES: DrugClassItem[] = [
  d({ id: "insulin", atc: "A10A", label: "Insulines", implies: "diabetes_insulin" }),
  d({ id: "oral_antidiabetics", atc: "A10B", label: "Antidiabétiques non insuliniques", implies: "diabetes_oral" }),
  d({ id: "glp1", atc: "A10BJ", label: "Agonistes du GLP-1", attention: { level: "medium", text: "Agoniste du GLP-1 : vidange gastrique ralentie, risque d'estomac plein malgré le jeûne." } }),
  d({ id: "sglt2", atc: "A10BK", label: "Inhibiteurs du SGLT2", attention: { level: "medium", text: "Inhibiteur du SGLT2 : risque d'acidocétose euglycémique périopératoire." } }),
  d({ id: "statins", atc: "C10", label: "Hypolipémiants", implies: "dyslipidemia", needsRule: false }),
  d({ id: "thyroid_drugs", atc: "H03", label: "Médicaments de la thyroïde", implies: "thyroid" }),
  d({ id: "corticoids", atc: "H02AB", label: "Corticoïdes systémiques", attention: { level: "medium", text: "Corticothérapie au long cours : risque d'insuffisance surrénale, discuter une supplémentation périopératoire." } }),
  d({ id: "maoi", atc: "N06AF", label: "IMAO non sélectifs", attention: { level: "high", text: "IMAO : interactions graves (sympathomimétiques indirects comme l'éphédrine, péthidine, tramadol…) : à discuter avec le prescripteur." } }),
  d({ id: "ssri", atc: "N06AB", label: "ISRS", attention: { level: "info", text: "ISRS : risque de syndrome sérotoninergique (tramadol, péthidine, bleu de méthylène) ; saignement majoré avec les antiagrégants." } }),
  d({ id: "snri", atc: "N06AX", label: "Autres antidépresseurs", attention: { level: "info", text: "Antidépresseur : interactions sérotoninergiques (tramadol, péthidine)." } }),
  d({ id: "lithium", atc: "N05AN", label: "Lithium", implies: "bipolar", attention: { level: "medium", text: "Lithium : natrémie et fonction rénale ; potentialisation des curares." } }),
  d({ id: "antipsychotics", atc: "N05A", label: "Antipsychotiques", attention: { level: "info", text: "Antipsychotique : poursuivre ; allongement du QT." } }),
  d({ id: "benzodiazepines", atc: "N05B", label: "Anxiolytiques", attention: { level: "info", text: "Benzodiazépine au long cours : ne pas arrêter brutalement (sevrage) ; tolérance." } }),
  d({ id: "hypnotics", atc: "N05C", label: "Hypnotiques", attention: { level: "info", text: "Hypnotique au long cours : tolérance, sevrage si arrêt brutal." } }),
  d({ id: "antiparkinson", atc: "N04B", label: "Antiparkinsoniens", implies: "parkinson" }),
  d({ id: "antiepileptics", atc: "N03", label: "Antiépileptiques", attention: { level: "info", text: "Antiépileptique : poursuivre, y compris le matin de l'intervention." } }),
  d({ id: "anticholinesterases", atc: "N06DA", label: "Anticholinestérasiques", implies: "cognitive", attention: { level: "medium", text: "Anticholinestérasique : allonge l'effet de la succinylcholine, diminue celui des curares non dépolarisants." } }),
  d({ id: "opioids", atc: "N02A", label: "Opioïdes", implies: "chronic_pain", attention: { level: "medium", text: "Opioïde au long cours : poursuivre, analgésie multimodale et ALR, besoins majorés." } }),
  d({ id: "opioid_substitution", atc: "N07BC", label: "Substitution aux opioïdes", attention: { level: "medium", text: "Traitement de substitution poursuivi ; tolérance aux opioïdes, analgésie multimodale." } }),
  d({ id: "paracetamol", atc: "N02BE", label: "Paracétamol", needsRule: false }),
  d({ id: "nsaids", atc: "M01A", label: "AINS", attention: { level: "info", text: "AINS : fonction rénale, saignement." } }),
  d({ id: "alpha_blockers", atc: "G04CA", label: "Alpha-bloquants urologiques", attention: { level: "info", text: "Alpha-bloquant : syndrome de l'iris flasque (cataracte), hypotension orthostatique." } }),
  d({ id: "amiodarone", atc: "C01BD", label: "Amiodarone", implies: "arrhythmia", attention: { level: "info", text: "Amiodarone : QT, bradycardie, fonction thyroïdienne." } }),
  d({ id: "digoxin", atc: "C01AA", label: "Digitaliques", implies: "arrhythmia", attention: { level: "info", text: "Digoxine : kaliémie, toxicité si insuffisance rénale." } }),
  d({ id: "nitrates", atc: "C01DA", label: "Dérivés nitrés", implies: "coronary" }),
  d({ id: "immunosuppressants", atc: "L04", label: "Immunosuppresseurs", attention: { level: "medium", text: "Immunosuppresseur : poursuivre selon le prescripteur ; risque infectieux." } }),
  d({ id: "contraceptives", atc: "G03A", label: "Contraceptifs hormonaux", attention: { level: "medium", text: "Œstroprogestatif : risque thromboembolique à intégrer à la thromboprophylaxie." } }),
  d({ id: "hrt", atc: "G03F", label: "Traitement hormonal de la ménopause", attention: { level: "info", text: "Risque thromboembolique à intégrer." } }),
  d({ id: "tamoxifen", atc: "L02BA", label: "Anti-œstrogènes", attention: { level: "medium", text: "Tamoxifène : risque thromboembolique à intégrer." } }),
  d({ id: "ppi", atc: "A02BC", label: "IPP", needsRule: false }),
  d({ id: "maoi_a", atc: "N06AG", label: "IMAO-A (moclobémide)", implies: "depression", attention: { level: "medium", text: "IMAO-A : interactions avec les sympathomimétiques indirects (éphédrine) et les sérotoninergiques (péthidine, tramadol) ; à discuter avec le prescripteur." } }),
  d({ id: "maoi_b", atc: "N04BD", label: "IMAO-B (rasagiline, sélégiline, safinamide)", attention: { level: "info", text: "IMAO-B : éviter péthidine et tramadol (syndrome sérotoninergique) ; prudence avec les sympathomimétiques indirects." } }),
  d({ id: "rate_ccb", atc: "C08D", label: "Vérapamil, diltiazem", attention: { level: "info", text: "Vérapamil / diltiazem : bradycardie et bloc AV, potentialisés par les bêtabloquants et les halogénés." } }),
  d({ id: "class1c", atc: "C01BC", label: "Antiarythmiques de classe IC", implies: "arrhythmia" }),
  d({ id: "pde5", atc: "G04BE", label: "Inhibiteurs de la PDE5", attention: { level: "info", text: "Inhibiteur de la PDE5 : hypotension sévère avec les dérivés nitrés ; si prescrit pour une HTAP, ne pas l'interrompre." } }),
  d({ id: "estrogens", atc: "G03C", label: "Œstrogènes", attention: { level: "info", text: "Œstrogène : risque thromboembolique à intégrer à la thromboprophylaxie." } }),
  d({ id: "serms", atc: "G03XC", label: "Modulateurs sélectifs des récepteurs aux œstrogènes", attention: { level: "medium", text: "Raloxifène : risque thromboembolique à intégrer." } }),
  d({ id: "anticholinesterases_mg", atc: "N07AA", label: "Anticholinestérasiques (myasthénie)", implies: "myasthenia", attention: { level: "medium", text: "Pyridostigmine : poursuivre ; modifie l'effet des curares (succinylcholine prolongée, non dépolarisants moins efficaces) : monitorage.", material: ["Curarimètre"] } }),
  d({ id: "naltrexone", atc: "N07BB04", label: "Naltrexone", attention: { level: "high", text: "Antagoniste opioïde : les morphiniques sont peu ou pas efficaces tant qu'il agit ; arrêt à planifier et analgésie non opioïde / ALR." } }),
  d({ id: "nalmefene", atc: "N07BB05", label: "Nalméfène", attention: { level: "high", text: "Antagoniste opioïde : les morphiniques sont peu ou pas efficaces tant qu'il agit ; arrêt à planifier et analgésie non opioïde / ALR." } }),
  d({ id: "disulfiram", atc: "N07BB01", label: "Disulfirame", attention: { level: "info", text: "Disulfirame : effet antabuse avec l'alcool (antiseptiques alcooliques, médicaments en solution alcoolique)." } }),
  d({ id: "stimulants", atc: "N06BA", label: "Psychostimulants", attention: { level: "info", text: "Psychostimulant : tachycardie, hypertension ; à gérer selon le prescripteur." } }),
  d({ id: "clozapine", atc: "N05AH02", label: "Clozapine", attention: { level: "medium", text: "Clozapine : ne pas interrompre brutalement ; neutropénie, iléus, hypotension ; taux sanguin modifié par le tabac." } }),
  d({ id: "epo", atc: "B03XA", label: "Agents stimulant l'érythropoïèse", attention: { level: "info", text: "Agent stimulant l'érythropoïèse : risque thrombotique." } }),
  d({ id: "iron", atc: "B03A", label: "Fer", needsRule: false }),
  d({ id: "vitamins", atc: "A11", label: "Vitamines", needsRule: false }),
  d({ id: "laxatives", atc: "A06", label: "Laxatifs", needsRule: false }),
  d({ id: "bisphosphonates", atc: "M05BA", label: "Bisphosphonates", needsRule: false }),
  d({ id: "antihistamines", atc: "R06", label: "Antihistaminiques", needsRule: false }),
  d({ id: "overactive_bladder", atc: "G04BD", label: "Médicaments de la vessie hyperactive", needsRule: false }),
  d({ id: "bph", atc: "G04CB", label: "Inhibiteurs de la 5-alpha-réductase", needsRule: false }),
  d({ id: "hiv", atc: "J05AR", label: "Associations d'antirétroviraux", implies: "hiv", attention: { level: "info", text: "Antirétroviraux : poursuivre sans interruption ; interactions (inhibiteurs de protéase boostés : midazolam, fentanyl…)." } }),
  d({ id: "imids", atc: "L04AX04", label: "Lénalidomide", attention: { level: "medium", text: "Lénalidomide : risque thromboembolique élevé." } }),
  d({ id: "eye_betablockers", atc: "S01ED", label: "Bêtabloquants en collyre", attention: { level: "info", text: "Bêtabloquant en collyre : passage systémique (bradycardie, bronchospasme)." } }),
  d({ id: "st_johns_wort", atc: "N06AX25", label: "Millepertuis", attention: { level: "medium", text: "Millepertuis : inducteur enzymatique (baisse de nombreux médicaments, dont anticoagulants et immunosuppresseurs) et risque sérotoninergique." } }),
  d({ id: "ginkgo", atc: "N06DX02", label: "Ginkgo biloba", attention: { level: "info", text: "Ginkgo : effet antiplaquettaire possible." } }),
  d({ id: "theophylline", atc: "R03DA", label: "Xanthines", attention: { level: "info", text: "Théophylline : marge thérapeutique étroite, arythmies ; interactions." } }),
  d({ id: "vka", atc: "B01AA", label: "Antivitamines K" }),
  d({ id: "xabans", atc: "B01AF", label: "Anti-Xa directs (xabans)" }),
  d({ id: "thrombin_inhibitors", atc: "B01AE", label: "Inhibiteurs directs de la thrombine" }),
  d({ id: "antiplatelets", atc: "B01AC", label: "Antiagrégants plaquettaires" }),
  d({ id: "checkpoint", atc: "L01FF", label: "Immunothérapies (anti-PD-1 / PD-L1)", attention: { level: "medium", text: "Toxicités immunitaires à rechercher : thyroïdite, insuffisance surrénale ou hypophysaire, pneumopathie, myocardite, colite." } }),
  d({ id: "btk", atc: "L01EL", label: "Inhibiteurs de la BTK", attention: { level: "medium", text: "Effet antiplaquettaire : risque hémorragique ; arrêt périopératoire selon vos règles." } }),
  d({ id: "vegf", atc: "L01FG", label: "Anti-VEGF", attention: { level: "medium", text: "Anti-VEGF : cicatrisation retardée, risque hémorragique et thrombotique, HTA ; délai avant chirurgie selon l'oncologue." } }),
  d({ id: "muscle_relaxants", atc: "M03BX", label: "Myorelaxants centraux", attention: { level: "high", text: "Baclofène (surtout en pompe intrathécale) : ne jamais interrompre brutalement (sevrage grave : hyperthermie, convulsions, rhabdomyolyse)." } }),
  d({ id: "antiandrogens", atc: "G03HA", label: "Anti-androgènes", attention: { level: "info", text: "Cyprotérone : risque thromboembolique à intégrer." } }),
  d({ id: "abiraterone", atc: "L02BX03", label: "Abiratérone", attention: { level: "medium", text: "Abiratérone : associée à la prednisone (supplémentation en corticoïdes à discuter), hypokaliémie, HTA." } }),
  d({ id: "rifampicin", atc: "J04AB02", label: "Rifampicine", attention: { level: "medium", text: "Inducteur enzymatique puissant : baisse de nombreux médicaments (anticoagulants oraux, morphiniques, immunosuppresseurs)." } }),
  d({ id: "hemostatics", atc: "B02AA", label: "Antifibrinolytiques", needsRule: false }),
  d({ id: "platelet_reducers", atc: "L01XX35", label: "Anagrélide", implies: "myeloproliferative", attention: { level: "info", text: "Anagrélide : effet antiplaquettaire modeste, QT." } }),
  d({ id: "hydroxyurea", atc: "L01XX05", label: "Hydroxycarbamide", implies: "myeloproliferative" }),
  d({ id: "potassium", atc: "A12B", label: "Potassium", needsRule: false }),
  d({ id: "folates_b12", atc: "B03B", label: "Folates et vitamine B12", needsRule: false }),
  d({ id: "eye_prostaglandins", atc: "S01EE", label: "Prostaglandines en collyre", implies: "glaucoma", needsRule: false }),
  d({ id: "eye_betablockers_glaucoma", atc: "S01E", label: "Antiglaucomateux", implies: "glaucoma" }),
  d({ id: "antiemetics_d2", atc: "A03FA", label: "Prokinétiques antidopaminergiques", attention: { level: "info", text: "Métoclopramide / dompéridone : allongement du QT, contre-indiqués dans la maladie de Parkinson (métoclopramide)." } }),
];

// ---------------------------------------------------------------------------
// Interactions with what anaesthesia may use — well-established ones only
// (SmPC, CBIP). A planned product that matches raises a major alert.
// ---------------------------------------------------------------------------

const ix = (withLabel: string, words: string[], effect: string, level: Interaction["level"] = "medium"): Interaction => ({ with: withLabel, words, effect, level });

const OPIOID_WORDS = ["morphine", "oxycodone", "piritramide", "dipidolor", "sufentanil", "fentanyl", "rémifentanil", "remifentanil", "hydromorphone", "tramadol"];
const NSAID_WORDS = ["kétorolac", "ketorolac", "ibuprofène", "ibuprofene", "diclofénac", "diclofenac", "kétoprofène", "naproxène", "célécoxib", "parécoxib"];
const SEROTONERGIC_WORDS = ["tramadol", "péthidine", "pethidine", "bleu de méthylène", "méthylène", "methylene", "méthadone"];
const QT_WORDS = ["dropéridol", "droperidol", "ondansétron", "ondansetron", "halopéridol", "haloperidol", "granisétron"];
const NMBA_WORDS = ["rocuronium", "vécuronium", "vecuronium", "atracurium", "cisatracurium"];
const SUX_WORDS = ["succinylcholine", "suxaméthonium", "suxamethonium", "célocurine"];

const CLASS_INTERACTIONS: Record<string, Interaction[]> = {
  maoi: [
    ix("éphédrine et sympathomimétiques indirects", ["éphédrine", "ephedrine"], "Crise hypertensive : préférer un vasopresseur direct (phényléphrine, noradrénaline) à faible dose.", "high"),
    ix("péthidine, tramadol, méthadone, bleu de méthylène", SEROTONERGIC_WORDS, "Syndrome sérotoninergique potentiellement mortel : à éviter.", "high"),
  ],
  maoi_a: [
    ix("éphédrine", ["éphédrine", "ephedrine"], "Poussée hypertensive possible : préférer un vasopresseur direct.", "medium"),
    ix("péthidine, tramadol, bleu de méthylène", SEROTONERGIC_WORDS, "Syndrome sérotoninergique : à éviter.", "high"),
  ],
  maoi_b: [ix("péthidine, tramadol, méthadone", SEROTONERGIC_WORDS, "Syndrome sérotoninergique : à éviter.", "medium")],
  ssri: [
    ix("tramadol, péthidine, bleu de méthylène", SEROTONERGIC_WORDS, "Syndrome sérotoninergique (agitation, hyperthermie, myoclonies) : préférer une autre option.", "medium"),
    ix("AINS", NSAID_WORDS, "Risque hémorragique majoré (effet antiplaquettaire des ISRS).", "info"),
  ],
  snri: [ix("tramadol, péthidine, bleu de méthylène", SEROTONERGIC_WORDS, "Syndrome sérotoninergique : préférer une autre option.", "medium")],
  lithium: [
    ix("curares", [...NMBA_WORDS, ...SUX_WORDS], "Effet des curares prolongé : monitorage de la curarisation.", "medium"),
    ix("AINS", NSAID_WORDS, "Lithémie augmentée (toxicité) : éviter les AINS.", "medium"),
  ],
  anticholinesterases: [ix("succinylcholine ; curares non dépolarisants", [...SUX_WORDS, ...NMBA_WORDS], "Succinylcholine prolongée ; curares non dépolarisants moins efficaces : monitorage.", "medium")],
  anticholinesterases_mg: [ix("succinylcholine ; curares non dépolarisants", [...SUX_WORDS, ...NMBA_WORDS], "Résistance à la succinylcholine et sensibilité variable aux non dépolarisants : doses titrées, monitorage.", "high")],
  naltrexone: [ix("morphiniques", OPIOID_WORDS, "Antagoniste opioïde : les morphiniques sont peu ou pas efficaces (et des doses élevées deviennent dangereuses à la levée du blocage).", "high")],
  nalmefene: [ix("morphiniques", OPIOID_WORDS, "Antagoniste opioïde : les morphiniques sont peu ou pas efficaces.", "high")],
  amiodarone: [ix("produits qui allongent le QT", QT_WORDS, "Allongement additif du QT (torsades de pointes) : ECG, éviter l'association si QT long.", "medium")],
  antipsychotics: [ix("produits qui allongent le QT", QT_WORDS, "Allongement additif du QT : ECG, prudence.", "info")],
  digoxin: [ix("succinylcholine", SUX_WORDS, "Arythmies possibles (hyperkaliémie) : éviter si possible, kaliémie.", "info")],
  vka: [ix("AINS", NSAID_WORDS, "Risque hémorragique majoré (et INR modifié).", "medium")],
  xabans: [ix("AINS", NSAID_WORDS, "Risque hémorragique majoré.", "medium")],
  thrombin_inhibitors: [ix("AINS", NSAID_WORDS, "Risque hémorragique majoré.", "medium")],
  antiplatelets: [ix("AINS", NSAID_WORDS, "Risque hémorragique majoré (et effet de l'aspirine diminué par l'ibuprofène).", "info")],
  opioid_substitution: [ix("morphiniques (buprénorphine)", OPIOID_WORDS, "Buprénorphine : agoniste partiel de forte affinité, les autres morphiniques sont moins efficaces ; méthadone : tolérance et QT long. Analgésie multimodale et ALR.", "medium")],
  antiemetics_d2: [ix("dropéridol, ondansétron", QT_WORDS, "Allongement additif du QT.", "info")],
};

/** Treatments with implications of their own (the class is not enough). */
const MEDICATION_EXTRAS: Record<string, Partial<MedicationItem>> = {
  N03AF01: { interactions: [ix("curares non dépolarisants", NMBA_WORDS, "Carbamazépine (inducteur, traitement prolongé) : résistance aux curares non dépolarisants, besoins augmentés : monitorage.", "info")] },
  N03AB02: { interactions: [ix("curares non dépolarisants", NMBA_WORDS, "Phénytoïne au long cours : résistance aux curares non dépolarisants : monitorage.", "info")] },
  N03AA02: { interactions: [ix("curares non dépolarisants, hypnotiques", NMBA_WORDS, "Phénobarbital (inducteur) : besoins en curares augmentés ; sédation additive.", "info")] },
  N07BC02: { attention: { level: "medium", text: "Méthadone : poursuivre la dose habituelle ; tolérance aux opioïdes ; QT long possible (ECG)." }, interactions: [ix("produits qui allongent le QT", QT_WORDS, "Allongement additif du QT : ECG.", "medium")] },
  N07BC01: { attention: { level: "medium", text: "Buprénorphine : poursuivre en général (plan avec le prescripteur) ; analgésie multimodale, ALR ; morphiniques moins efficaces." } },
  L04AX03: { interactions: [ix("protoxyde d'azote, AINS", ["protoxyde", "kétorolac", "ibuprofène", "diclofénac"], "Méthotrexate : toxicité majorée par le protoxyde d'azote (métabolisme des folates) et les AINS (élimination rénale).", "info")] },
};

function surgeryItems(): SurgeryItem[] {
  return SURGERY_CATALOG.map((s) => ({ ...s }));
}

function medicationItems(): MedicationItem[] {
  return MEDICATIONS.map((m) => ({ ...m, id: m.atc, ...MEDICATION_EXTRAS[m.atc] }));
}

function drugClassItems(): DrugClassItem[] {
  return DEFAULT_DRUG_CLASSES.map((k) => (CLASS_INTERACTIONS[k.id] ? { ...k, interactions: CLASS_INTERACTIONS[k.id] } : k));
}

export const DEFAULT_CATALOGS: Catalogs = {
  conditions: DEFAULT_CONDITIONS,
  allergens: DEFAULT_ALLERGENS,
  surgeries: surgeryItems(),
  medications: medicationItems(),
  drugClasses: drugClassItems(),
  values: DEFAULT_VALUE_CHECKS,
};
