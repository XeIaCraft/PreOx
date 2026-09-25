// Default allergens and treatment-class implications, and the assembled
// default catalogues. Editable in Paramètres.

import type { AllergenItem, Catalogs, DrugClassItem, MedicationItem, SurgeryItem } from "./catalog";
import { DEFAULT_CONDITIONS } from "./catalog-conditions";
import { MEDICATIONS } from "./medications";
import { SURGERY_CATALOG } from "./surgeries";

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
  d({ id: "antiemetics_d2", atc: "A03FA", label: "Prokinétiques antidopaminergiques", attention: { level: "info", text: "Métoclopramide / dompéridone : allongement du QT, contre-indiqués dans la maladie de Parkinson (métoclopramide)." } }),
];

function surgeryItems(): SurgeryItem[] {
  return SURGERY_CATALOG.map((s) => ({ ...s }));
}

function medicationItems(): MedicationItem[] {
  return MEDICATIONS.map((m) => ({ ...m, id: m.atc }));
}

export const DEFAULT_CATALOGS: Catalogs = {
  conditions: DEFAULT_CONDITIONS,
  allergens: DEFAULT_ALLERGENS,
  surgeries: surgeryItems(),
  medications: medicationItems(),
  drugClasses: DEFAULT_DRUG_CLASSES,
};
