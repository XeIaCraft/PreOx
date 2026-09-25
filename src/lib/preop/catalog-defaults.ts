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
  }),
  a({
    id: "nmba",
    label: "Curares",
    keywords: ["curare", "curares", "rocuronium", "esmeron", "succinylcholine", "suxaméthonium", "celocurine", "atracurium", "cisatracurium", "nimbex", "vécuronium", "mivacurium"],
    drugWords: ["rocuronium", "succinylcholine", "suxaméthonium", "atracurium", "cisatracurium", "vécuronium", "mivacurium"],
    attention: { level: "high", text: "Allergie aux curares : bilan allergologique avant une nouvelle anesthésie ; éviter la molécule en cause et discuter les réactivités croisées." },
  }),
  a({
    id: "betalactams",
    label: "Pénicillines / bêtalactamines",
    keywords: ["pénicilline", "penicilline", "amoxicilline", "augmentin", "clamoxyl", "bêtalactamine", "betalactamine", "flucloxacilline", "pipéracilline", "tazocin"],
    drugWords: ["amoxicilline", "pénicilline", "pipéracilline", "flucloxacilline", "céfazoline", "cefazoline", "céfuroxime", "cefuroxime", "ceftriaxone"],
    attention: { level: "high", text: "Préciser la réaction (immédiate, grave, retardée) ; antibioprophylaxie à adapter." },
  }),
  a({
    id: "cephalosporins",
    label: "Céphalosporines",
    keywords: ["céphalosporine", "céfazoline", "cefazoline", "kefzol", "céfuroxime", "cefuroxime", "zinacef", "ceftriaxone"],
    drugWords: ["céfazoline", "cefazoline", "céfuroxime", "cefuroxime", "ceftriaxone"],
    attention: { level: "high", text: "Antibioprophylaxie alternative à prévoir." },
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
    keywords: ["morphine", "codéine", "codeine", "tramadol", "oxycodone", "opiacé", "opioïde", "piritramide", "dipidolor"],
    drugWords: ["morphine", "codéine", "tramadol", "oxycodone", "piritramide"],
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
