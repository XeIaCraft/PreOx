// Variants of the same operation — open, laparoscopic, robotic,
// thoracoscopic, endoscopic, percutaneous… — and the procedures proper to
// children and newborns, with what each approach changes for anaesthesia.
// Same conventions as surgeries.ts (grade after the KCE 280 / NICE examples,
// ESC 2022 cardiac risk, bleeding risk, Lee item, ARISCAT incision); the
// approach itself is described after the Manuel pratique d'anesthésie 2020
// (chap. 30: laparoscopy; chap. 19: positions; chap. 26: one-lung
// ventilation; chap. 37: children). Every value stays editable in
// Paramètres › Interventions.

import type { Approach, CatalogSurgery, Population, SurgeryGrade } from "./surgeries";
import type { RiskGrade } from "./dossier";
import type { BleedingRisk } from "./catalog";
import type { SurgeryExamProfile } from "./exams";
import type { Technique } from "./rules/types";

type Incision = CatalogSurgery["incision"];

function slug(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// What an approach changes for anaesthesia
// ---------------------------------------------------------------------------

const MANUAL = "Manuel pratique d'anesthésie 2020";

export const APPROACH_SPECIFICS: Partial<Record<Approach, string[]>> = {
  laparoscopic: [
    "Pneumopéritoine de CO₂ : baisse du retour veineux et du débit cardiaque, HTA et tachycardie, hypercapnie (adapter la ventilation), atélectasies et intubation sélective possible",
    "Réactions vagales à l'insertion des trocarts, à l'insufflation et à la traction des viscères : anesthésie assez profonde, atropine prête",
    "Complications : emphysème sous-cutané ou capnothorax (EtCO₂ ↑, pressions stables), pneumothorax (EtCO₂ ↓, SpO₂ ↓, pressions ↑), embolie gazeuse de CO₂ ; conversion en laparotomie possible",
    "Sonde gastrique pour limiter le risque de perforation gastrique ; curarisation profonde souvent demandée",
  ],
  robotic: [
    "Pneumopéritoine et, en pelvien, Trendelenburg marqué et prolongé : œdème facial et laryngé, pression intraoculaire et intracrânienne ↑, hypoxémie ; restriction liquidienne peropératoire",
    "Robot arrimé : accès au patient très limité, pas de mouvement du patient (curarisation profonde, monitorée) ; plan pour désarrimer vite en cas d'urgence",
    "Bras le long du corps, points d'appui protégés (plexus brachial), yeux protégés",
  ],
  thoracoscopic: [
    "Ventilation unipulmonaire (sonde double lumière ou bloqueur) : hypoxémie, ventilation protectrice du poumon dépendant",
    "Décubitus latéral : points d'appui, billot axillaire ; conversion en thoracotomie possible",
  ],
  endoscopic: ["Voies naturelles : peu douloureux, souvent ambulatoire ; risque de perforation ou de résorption du liquide d'irrigation selon l'organe"],
  arthroscopic: ["Liquide d'irrigation sous pression (épaule : œdème cervical possible) ; garrot au membre inférieur ; hypotension contrôlée parfois demandée à l'épaule, prudence en position assise (perfusion cérébrale)"],
  percutaneous: ["Geste court sous contrôle radiologique : sédation ou anesthésie générale, patient immobile, conversion chirurgicale possible"],
  endovascular: ["Produit de contraste (fonction rénale), héparine peropératoire, rupture ou conversion possible : 2 voies, sang disponible"],
  vaginal: ["Lithotomie : nerf fibulaire, syndrome des loges si prolongée ; rachianesthésie souvent possible"],
  transoral: ["Voies aériennes partagées avec le chirurgien : intubation nasale ou sonde armée, extubation prudente (œdème, saignement)"],
};

export const APPROACH_SOURCE = `${MANUAL}, chap. 30 (laparoscopie), 19 (positions) et 26 (ventilation unipulmonaire)`;

// ---------------------------------------------------------------------------
// Deriving approach, sex, population and family for the existing entries
// ---------------------------------------------------------------------------

const f = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** The approach written in the name or the other names of an entry, if any. */
export function approachFromName(name: string, aka: string[] = []): Approach | undefined {
  const t = f([name, ...aka].join(" "));
  const n = f(name);
  if (/robot|tors\b/.test(n) && !/ou robot/.test(n)) return "robotic";
  if (/c(oe|œ)?lioscop|laparoscop|coelio/.test(n)) return "laparoscopic";
  if (/thoracoscop|\bvats\b/.test(n) || /\bvats\b/.test(t)) return "thoracoscopic";
  if (/arthroscop/.test(n)) return "arthroscopic";
  if (/endoprothese|angioplastie|stenting|\btavi\b|embolisation|thrombectomie cerebrale|percutane.*(fop|cia|auricule|mitra)|mitraclip|coronarographie|chimio-embolisation|tips\b|filtre cave/.test(n)) return "endovascular";
  if (/percutane|vertebroplastie|cyphoplastie|radiofrequence|cryoablation|ponction|biopsie.*scanner|lithotri(psie|tie)/.test(n)) return "percutaneous";
  if (/transuretral|hysteroscop|ureteroscop|uretero-?renoscop|cystoscop|endoscop|endonasale|coloscop|gastroscop|\bcpre\b|\bpoem\b|mucosectomie|bronchoscop|panendoscop|enucleation de prostate|vaporisation prostatique|laser laryng|microchirurgie laryng/.test(n)) return "endoscopic";
  if (/vaginale|voie vaginale/.test(n)) return "vaginal";
  if (/transorale/.test(n)) return "transoral";
  if (/laparotomie|thoracotomie|ouverte|lombotomie|sternotomie|mc ?burney|lichtenstein/.test(n)) return "open";
  return undefined;
}

const MALE = /prostat|orchid|scrotal|circoncision|phimosis|hydrocele|varicocele|vasectomie|hypospade|penien|testicul|cystoprostatectomie/;
const FEMALE = /hysterectom|hysteroscop|ovaire|ovarien|ovocytaire|uterin|uterus|cesarienne|grossesse|cerclage|conisation|vulv|bandelette|prolapsus(?! rectal)|promontofixation|tubaire|delivrance|dechirure perineale|myomectomie|endometriose|travail|version par manoeuvre|kystectomie ovarienne|embolisation uterine|interruption volontaire|aspiration endo-uterine/;

export function sexFromName(name: string, category: string): "M" | "F" | undefined {
  const n = f(name);
  if (category === "B" || category === "J1") return "F";
  const female = FEMALE.test(n);
  const male = MALE.test(n);
  if (female && !male) return "F";
  if (male && !female) return "M";
  return undefined;
}

const CHILD = /de l'enfant|\(enfant\)|pylorotomie|invagination intestinale|fente labio-palatine|hypospade|orchidopexie|frein de langue|aerateurs transtympaniques/;

export function populationFromName(name: string): Population | undefined {
  const n = f(name);
  if (/nouveau-ne|neonat|premature/.test(n)) return "neonate";
  if (CHILD.test(n)) return "child";
  return undefined;
}

/**
 * Families of the existing entries (by id) — the variants of the same
 * operation, to switch approach in one tap. New entries carry their own.
 */
export const EXISTING_FAMILIES: Record<string, string[]> = {
  cholecystectomie: ["cholecystectomie-c-lioscopique"],
  appendicectomie: ["appendicectomie"],
  colectomie: ["colectomie", "hemicolectomie-droite", "sigmoidectomie"],
  "resection-du-rectum": ["resection-du-rectum"],
  "hernie-inguinale": ["cure-de-hernie-inguinale", "hernie-inguinale-par-c-lioscopie", "cure-de-hernie-inguinale-de-l-enfant"],
  eventration: ["cure-d-eventration"],
  gastrectomie: ["gastrectomie", "gastrectomie-totale"],
  hepatectomie: ["hepatectomie", "hepatectomie-majeure", "resection-hepatique-mineure-par-c-lioscopie"],
  splenectomie: ["splenectomie", "splenectomie-par-c-lioscopie"],
  surrenalectomie: ["surrenalectomie", "surrenalectomie-par-c-lioscopie"],
  sophagectomie: ["sophagectomie", "sophagectomie-par-thoracoscopie"],
  prostatectomie: ["prostatectomie-radicale", "prostatectomie-radicale-robot-assistee"],
  "hbp-prostate": ["resection-transuretrale-de-prostate", "enucleation-de-prostate-au-laser", "vaporisation-prostatique-au-laser", "adenomectomie-prostatique"],
  nephrectomie: ["nephrectomie"],
  "nephrectomie-partielle": ["nephrectomie-partielle"],
  cystectomie: ["cystectomie-totale", "cystoprostatectomie-avec-derivation-urinaire"],
  hysterectomie: ["hysterectomie", "hysterectomie-par-c-lioscopie-ou-robot", "hysterectomie-vaginale", "hysterectomie-elargie"],
  myomectomie: ["myomectomie"],
  lobectomie: ["lobectomie-pulmonaire", "lobectomie-par-thoracotomie"],
  thymectomie: ["thymectomie"],
  "aorte-abdominale": ["chirurgie-aortique-ouverte", "endoprothese-aortique", "pontage-aorto-bifemoral", "endoprothese-fenetree-ou-branchee"],
  carotide: ["endarteriectomie-carotidienne", "stenting-carotidien"],
  "valve-aortique": ["remplacement-valvulaire-aortique", "tavi", "chirurgie-valvulaire-mini-invasive"],
  "valve-mitrale": ["chirurgie-de-la-valve-mitrale", "mitraclip-reparation-mitrale-percutanee"],
  amygdalectomie: ["amygdalectomie"],
  "hernie-ombilicale": ["cure-de-hernie-ombilicale"],
  circoncision: ["circoncision", "circoncision-de-l-enfant-ou-cure-de-phimosis"],
  strabisme: ["chirurgie-du-strabisme"],
  "hernie-discale": ["cure-de-hernie-discale", "chirurgie-du-rachis-mini-invasive"],
  "lithiase-urinaire": ["ureteroscopie", "ureterorenoscopie-souple-et-laser", "nephrolithotomie-percutanee", "lithotritie-extracorporelle"],
  pyeloplastie: ["pyeloplastie"],
  "bariatrique-sleeve": ["gastrectomie-longitudinale"],
  "bariatrique-bypass": ["bypass-gastrique"],
  "pancreatectomie-gauche": ["pancreatectomie-gauche"],
  promontofixation: ["promontofixation"],
  pth: ["prothese-totale-de-hanche"],
  ptg: ["prothese-totale-de-genou", "prothese-unicompartimentale-du-genou"],
  "reprise-prothese": ["reprise-de-prothese-de-hanche-ou-de-genou"],
  rectopexie: ["rectopexie"],
  "arthrodese-lombaire": ["arthrodese-rachidienne", "arthrodese-lombaire-etendue"],
  cataracte: ["cataracte"],
  glaucome: ["chirurgie-du-glaucome"],
  "nephro-ureterectomie": ["nephro-ureterectomie"],
  orchidopexie: ["orchidopexie"],
  prolapsus: ["cure-de-prolapsus"],
  annexes: ["annexectomie-par-c-lioscopie", "kystectomie-ovarienne"],
  hydrocephalie: ["derivation-ventriculo-peritoneale"],
  emphyseme: ["reduction-de-volume-pulmonaire"],
  hpp: ["hysterectomie-d-hemostase"],
  "acces-vasculaire": ["pose-de-chambre-implantable"],
  main: ["chirurgie-de-la-main"],
  "voies-biliaires": ["chirurgie-des-voies-biliaires"],
};

/** Specifics of existing entries (by id). */
export const EXISTING_SPECIFICS: Record<string, string[]> = {
  pylorotomie: ["Sténose du pylore : urgence médicale, pas chirurgicale — corriger d'abord l'alcalose hypochlorémique", "Estomac plein : aspiration gastrique, induction à séquence rapide"],
  "invagination-intestinale": ["Estomac plein, déshydratation : remplissage avant l'induction, séquence rapide"],
  "fente-labio-palatine": ["Voies aériennes partagées, sonde préformée (RAE) ; PROSPECT 2024 : bloc du nerf maxillaire suprazygomatique (ou bloc palatin), dexmédétomidine, paracétamol et AINS"],
  "prostatectomie-radicale-robot-assistee": ["Trendelenburg marqué prolongé : œdème facial et laryngé, restriction liquidienne peropératoire, protection oculaire"],
  "cesarienne-programmee": ["Rachianesthésie avec morphine intrathécale 50–100 µg ; phényléphrine en perfusion prophylactique"],
};

// ---------------------------------------------------------------------------
// New entries: the other approaches, and children's and newborns' surgery
// ---------------------------------------------------------------------------

interface V {
  approach?: Approach;
  family?: string;
  population?: Population;
  sex?: "M" | "F";
  aka?: string[];
  h?: number;
  t?: Technique[];
  pos?: string;
  profile?: SurgeryExamProfile;
  closed?: boolean;
  specifics?: string[];
}

function v(name: string, category: string, grade: SurgeryGrade, cardiacRisk: RiskGrade, bleedingRisk: BleedingRisk, rcriHighRisk: boolean, incision: Incision, o: V = {}): CatalogSurgery {
  return {
    id: slug(name),
    name,
    category,
    grade,
    cardiacRisk,
    bleedingRisk,
    rcriHighRisk,
    incision,
    position: o.pos,
    aka: o.aka,
    durationHours: o.h,
    techniques: o.t,
    closedSpace: o.closed,
    examProfile: o.profile,
    approach: o.approach,
    family: o.family,
    population: o.population,
    sex: o.sex,
    specifics: o.specifics,
  };
}

const P = "peripheral" as const;
const UA = "upper_abdominal" as const;
const IT = "intrathoracic" as const;
const G: Technique[] = ["general"];
const GR: Technique[] = ["general", "neuraxial"];
const GB: Technique[] = ["general", "superficial_block"];
const GD: Technique[] = ["general", "deep_block"];
const SP: Technique[] = ["neuraxial"];
const SED: Technique[] = ["sedation"];
const DORSAL = "Décubitus dorsal";
const TREND = "Décubitus dorsal, Trendelenburg";
const LITHO_TREND = "Lithotomie, Trendelenburg marqué";
const LATERAL = "Décubitus latéral";
const LOMBO = "Décubitus latéral, billot (lombotomie)";

// Anaesthesia specifics of children (Manuel 2020, chap. 37) — added to every child entry.
export const CHILD_SPECIFICS = [
  "Enfant : jeûne selon l'ESAIC 2022 (liquides clairs jusqu'à 1 h), doses et matériel au poids, induction inhalatoire ou IV, prévention de l'hypothermie",
  "Laryngospasme et bronchospasme plus fréquents (infection des voies aériennes récente) : fiches de crise au bloc",
];
export const NEONATE_SPECIFICS = [
  "Nouveau-né : hypothermie, hypoglycémie, apnées postopératoires (prématuré : surveillance 12–24 h), ventilation délicate, doses au poids",
  "Centre de référence pédiatrique ; parents et néonatologue associés",
];

export const VARIANT_SURGERIES: CatalogSurgery[] = [
  // --- Digestif : les autres voies ------------------------------------------------------
  v("Cholécystectomie par laparotomie", "A", "major", "intermediate", "high", true, UA, { approach: "open", family: "cholecystectomie", aka: ["cholécystectomie ouverte", "conversion"], h: 2, t: G, pos: DORSAL }),
  v("Appendicectomie par cœlioscopie", "A", "intermediate", "intermediate", "low", true, P, { approach: "laparoscopic", family: "appendicectomie", aka: ["appendicite"], h: 0.75, t: G, pos: TREND }),
  v("Appendicectomie par laparotomie", "A", "intermediate", "intermediate", "low", true, P, { approach: "open", family: "appendicectomie", aka: ["Mc Burney", "appendicite"], h: 1, t: G, pos: DORSAL }),
  v("Colectomie par cœlioscopie", "A", "major", "intermediate", "high", true, UA, { approach: "laparoscopic", family: "colectomie", aka: ["hémicolectomie cœlioscopique", "sigmoïdectomie cœlioscopique"], h: 3, t: G, pos: "Décubitus dorsal, Trendelenburg ou proclive selon le segment", profile: "major_digestive" }),
  v("Colectomie robot-assistée", "A", "major", "intermediate", "high", true, UA, { approach: "robotic", family: "colectomie", h: 3.5, t: G, pos: "Décubitus dorsal, Trendelenburg", profile: "major_digestive" }),
  v("Colectomie par laparotomie", "A", "major", "intermediate", "high", true, UA, { approach: "open", family: "colectomie", h: 3, t: GR, pos: DORSAL, profile: "major_digestive" }),
  v("Résection du rectum par cœlioscopie", "A", "major", "intermediate", "high", true, UA, { approach: "laparoscopic", family: "resection-du-rectum", aka: ["proctectomie", "TME"], h: 4, t: G, pos: LITHO_TREND, profile: "major_digestive" }),
  v("Résection du rectum robot-assistée", "A", "major", "intermediate", "high", true, UA, { approach: "robotic", family: "resection-du-rectum", aka: ["proctectomie robot"], h: 4.5, t: G, pos: LITHO_TREND, profile: "major_digestive" }),
  v("Cure d'éventration par cœlioscopie", "A", "intermediate", "intermediate", "low", true, UA, { approach: "laparoscopic", family: "eventration", aka: ["hernie incisionnelle"], h: 1.5, t: G, pos: DORSAL }),
  v("Cure de hernie ombilicale par cœlioscopie", "A", "intermediate", "intermediate", "low", true, P, { approach: "laparoscopic", family: "hernie-ombilicale", h: 1, t: G, pos: DORSAL }),
  v("Gastrectomie par cœlioscopie", "A", "major", "intermediate", "high", true, UA, { approach: "laparoscopic", family: "gastrectomie", h: 4, t: G, pos: "Décubitus dorsal, proclive", profile: "major_digestive" }),
  v("Hépatectomie par laparotomie", "A", "major", "high", "high", true, UA, { approach: "open", family: "hepatectomie", aka: ["résection hépatique ouverte"], h: 4, t: GR, pos: DORSAL, profile: "hepatobiliary" }),
  v("Hépatectomie robot-assistée", "A", "major", "high", "high", true, UA, { approach: "robotic", family: "hepatectomie", h: 4, t: G, pos: "Décubitus dorsal, proclive", profile: "hepatobiliary" }),
  v("Pancréatectomie gauche par cœlioscopie", "A", "major", "high", "high", true, UA, { approach: "laparoscopic", family: "pancreatectomie-gauche", aka: ["splénopancréatectomie gauche"], h: 3.5, t: G, pos: "Décubitus dorsal, proclive", profile: "hepatobiliary" }),
  v("Duodénopancréatectomie céphalique robot-assistée", "A", "major", "high", "high", true, UA, { approach: "robotic", family: "duodenopancreatectomie", aka: ["Whipple robot"], h: 7, t: G, pos: DORSAL, profile: "hepatobiliary" }),
  v("Œsophagectomie robot-assistée", "A", "major", "high", "high", true, IT, { approach: "robotic", family: "sophagectomie", aka: ["RAMIE"], h: 7, t: GD, pos: "Décubitus ventral ou latéral gauche puis dorsal", profile: "major_digestive" }),
  v("Fundoplicature robot-assistée", "A", "intermediate", "intermediate", "low", true, UA, { approach: "robotic", family: "fundoplicature", aka: ["Nissen", "hernie hiatale"], h: 2.5, t: G, pos: "Décubitus dorsal, proclive" }),
  v("Bypass gastrique robot-assisté", "A", "major", "intermediate", "high", true, UA, { approach: "robotic", family: "bariatrique-bypass", h: 2.5, t: G, pos: "Décubitus dorsal, proclive", profile: "bariatric" }),
  v("Thyroïdectomie par voie endoscopique", "A", "major", "low", "high", false, P, { approach: "endoscopic", family: "thyroidectomie", aka: ["TOETVA", "thyroïdectomie transorale"], h: 2.5, t: G, pos: "Décubitus dorsal, cou en extension", profile: "thyroid" }),

  // --- Urologie ------------------------------------------------------------------------
  v("Prostatectomie radicale par cœlioscopie", "J2", "major", "intermediate", "high", true, P, { approach: "laparoscopic", family: "prostatectomie", sex: "M", h: 3.5, t: G, pos: LITHO_TREND }),
  v("Prostatectomie radicale par voie ouverte", "J2", "major", "intermediate", "high", false, P, { approach: "open", family: "prostatectomie", sex: "M", aka: ["prostatectomie rétropubienne"], h: 3, t: GR, pos: "Décubitus dorsal, table cassée" }),
  v("Néphrectomie par cœlioscopie", "J2", "major", "intermediate", "high", true, UA, { approach: "laparoscopic", family: "nephrectomie", aka: ["néphrectomie élargie cœlioscopique"], h: 3, t: G, pos: LATERAL }),
  v("Néphrectomie par lombotomie", "J2", "major", "intermediate", "high", false, UA, { approach: "open", family: "nephrectomie", aka: ["néphrectomie ouverte"], h: 2.5, t: GR, pos: LOMBO }),
  v("Néphrectomie partielle robot-assistée", "J2", "major", "intermediate", "high", true, UA, { approach: "robotic", family: "nephrectomie-partielle", aka: ["tumorectomie rénale robot"], h: 3, t: G, pos: LATERAL }),
  v("Néphrectomie partielle par cœlioscopie", "J2", "major", "intermediate", "high", true, UA, { approach: "laparoscopic", family: "nephrectomie-partielle", h: 3, t: G, pos: LATERAL }),
  v("Néphrectomie partielle par lombotomie", "J2", "major", "intermediate", "high", false, UA, { approach: "open", family: "nephrectomie-partielle", h: 2.5, t: GR, pos: LOMBO }),
  v("Cystectomie robot-assistée", "J2", "major", "high", "high", true, P, { approach: "robotic", family: "cystectomie", aka: ["cystoprostatectomie robot"], h: 6, t: G, pos: LITHO_TREND }),
  v("Pyéloplastie robot-assistée", "J2", "intermediate", "intermediate", "low", true, UA, { approach: "robotic", family: "pyeloplastie", aka: ["syndrome de la jonction"], h: 2.5, t: G, pos: LATERAL }),
  v("Promontofixation robot-assistée", "J1", "major", "intermediate", "low", true, P, { approach: "robotic", family: "promontofixation", sex: "F", h: 3, t: G, pos: LITHO_TREND }),

  // --- Gynécologie -----------------------------------------------------------------------
  v("Hystérectomie robot-assistée", "J1", "major", "intermediate", "high", true, P, { approach: "robotic", family: "hysterectomie", sex: "F", h: 2.5, t: G, pos: LITHO_TREND }),
  v("Hystérectomie par laparotomie", "J1", "major", "intermediate", "high", true, P, { approach: "open", family: "hysterectomie", sex: "F", aka: ["hystérectomie abdominale"], h: 2, t: GR, pos: DORSAL }),
  v("Myomectomie par cœlioscopie", "J1", "major", "intermediate", "high", true, P, { approach: "laparoscopic", family: "myomectomie", sex: "F", h: 2, t: G, pos: LITHO_TREND }),
  v("Myomectomie par hystéroscopie", "J1", "minor", "low", "low", false, P, { approach: "endoscopic", family: "myomectomie", sex: "F", aka: ["résection hystéroscopique"], h: 0.75, t: G, pos: "Lithotomie", specifics: ["Liquide de distension : bilan entrées-sorties, surcharge ou hyponatrémie selon le liquide"] }),
  v("Annexectomie par cœlioscopie", "J1", "intermediate", "intermediate", "low", true, P, { approach: "laparoscopic", family: "annexes", sex: "F", aka: ["salpingectomie", "ovariectomie", "torsion d'annexe"], h: 1, t: G, pos: LITHO_TREND }),

  // --- Thorax ---------------------------------------------------------------------------
  v("Lobectomie robot-assistée", "G", "major", "intermediate", "high", true, IT, { approach: "robotic", family: "lobectomie", aka: ["RATS"], h: 3.5, t: GD, pos: LATERAL, profile: "lung_resection" }),
  v("Pneumonectomie par thoracoscopie", "G", "major", "high", "high", true, IT, { approach: "thoracoscopic", family: "pneumonectomie", h: 3.5, t: GD, pos: LATERAL, profile: "pneumonectomy" }),
  v("Segmentectomie ou wedge par thoracotomie", "G", "major", "intermediate", "high", true, IT, { approach: "open", family: "segmentectomie", h: 2.5, t: GD, pos: LATERAL, profile: "lung_resection" }),
  v("Thymectomie par thoracoscopie ou robot", "G", "intermediate", "intermediate", "low", true, IT, { approach: "thoracoscopic", family: "thymectomie", aka: ["thymectomie robot"], h: 2.5, t: G, pos: "Décubitus dorsal, hémithorax surélevé" }),
  v("Thymectomie par sternotomie", "G", "major", "intermediate", "high", true, IT, { approach: "open", family: "thymectomie", h: 2.5, t: G, pos: DORSAL }),

  // --- ORL ------------------------------------------------------------------------------
  v("Chirurgie transorale robot-assistée (TORS)", "C", "major", "intermediate", "high", false, P, { approach: "robotic", family: "oropharynx", aka: ["TORS", "base de langue"], h: 3, t: G, pos: "Décubitus dorsal, bouche ouverte (écarteur)" }),

  // --- Enfant ----------------------------------------------------------------------------
  v("Appendicectomie de l'enfant", "A", "intermediate", "low", "low", false, P, { approach: "laparoscopic", family: "appendicectomie", population: "child", h: 1, t: G, pos: DORSAL }),
  v("Amygdalectomie de l'enfant", "C", "intermediate", "low", "high", false, P, { family: "amygdalectomie", population: "child", aka: ["amygdalectomie SAOS", "adéno-amygdalectomie"], h: 0.5, t: G, pos: "Décubitus dorsal, tête en extension (ouvre-bouche)", specifics: ["SAOS de l'enfant : sensibilité aux opioïdes, surveillance respiratoire postopératoire", "Hémorragie secondaire possible (J0 et J5–J10) : fiche de crise"] }),
  v("Chirurgie du strabisme de l'enfant", "I", "intermediate", "low", "minimal", false, P, { family: "strabisme", population: "child", h: 1, t: G, pos: DORSAL, specifics: ["Réflexe oculocardiaque (traction sur les muscles) : atropine prête", "NVPO très fréquentes : double prévention"] }),
  v("Cure de hernie ombilicale de l'enfant", "A", "minor", "low", "low", false, P, { family: "hernie-ombilicale", population: "child", h: 0.5, t: GB, pos: DORSAL }),
  v("Cure de hernie inguinale du nourrisson ou du prématuré", "A", "intermediate", "low", "low", false, P, { family: "hernie-inguinale", population: "neonate", aka: ["ancien prématuré"], h: 0.75, t: ["general", "neuraxial"], pos: DORSAL, specifics: ["Ancien prématuré de moins de 60 semaines d'âge post-conceptionnel : apnées postopératoires, surveillance monitorée ; rachianesthésie seule possible"] }),
  v("Fracture supracondylienne de l'humérus (enfant)", "K", "intermediate", "low", "low", false, P, { family: "fracture-humerus-enfant", population: "child", aka: ["broche", "coude enfant"], h: 1, t: G, pos: "Décubitus dorsal, bras sur table", specifics: ["Surveiller l'ischémie et le syndrome des loges : bloc à discuter avec le chirurgien"] }),
  v("Réduction de fracture de l'avant-bras (enfant)", "K", "minor", "low", "minimal", false, P, { family: "fracture-avant-bras-enfant", population: "child", h: 0.5, t: G, pos: "Décubitus dorsal, bras sur table" }),
  v("Arthrodèse pour scoliose de l'adolescent", "K", "major", "intermediate", "high", false, P, { family: "scoliose", population: "child", aka: ["scoliose idiopathique"], h: 5, t: G, pos: "Décubitus ventral", closed: true, specifics: ["Potentiels évoqués (TIVA, curares à l'induction seulement), saignement important (acide tranexamique, cell saver), analgésie : morphine intrathécale ou péridurale selon l'équipe"] }),
  v("Craniosténose", "D", "major", "intermediate", "high", false, P, { family: "craniostenose", population: "child", aka: ["craniosynostose", "remodelage crânien"], h: 4, t: G, pos: "Décubitus dorsal ou ventral", specifics: ["Saignement majeur rapporté au volume sanguin de l'enfant, embolie gazeuse : 2 voies, cathéter artériel, sang en salle"] }),
  v("Réimplantation urétérale (reflux)", "J2", "intermediate", "low", "low", false, P, { family: "reflux-uretero", population: "child", aka: ["reflux vésico-urétéral", "Cohen"], h: 2, t: GR, pos: DORSAL }),
  v("Pyéloplastie de l'enfant", "J2", "intermediate", "low", "low", false, UA, { family: "pyeloplastie", population: "child", aka: ["jonction pyélo-urétérale"], h: 2, t: GR, pos: LATERAL }),
  v("Corps étranger bronchique (enfant)", "G", "intermediate", "low", "minimal", false, IT, { approach: "endoscopic", family: "corps-etranger", population: "child", aka: ["bronchoscopie rigide enfant", "inhalation de corps étranger"], h: 0.75, t: G, pos: DORSAL, specifics: ["Voies aériennes partagées : ventilation spontanée ou contrôlée selon l'équipe, obstruction complète possible, bronchospasme"] }),
  v("Endoscopie digestive de l'enfant", "X", "minor", "low", "minimal", false, P, { approach: "endoscopic", family: "endoscopie-digestive", population: "child", aka: ["gastroscopie enfant", "corps étranger œsophagien", "pile bouton"], h: 0.5, t: G, pos: "Décubitus latéral gauche" }),
  v("Maladie de Hirschsprung (abaissement colique)", "A", "major", "intermediate", "high", true, UA, { family: "hirschsprung", population: "child", h: 3, t: GR, pos: "Lithotomie ou décubitus dorsal" }),
  v("Malformation anorectale", "A", "major", "intermediate", "low", false, P, { family: "malformation-anorectale", population: "neonate", aka: ["anoplastie", "imperforation anale"], h: 2.5, t: GR, pos: "Décubitus ventral ou lithotomie" }),

  // --- Nouveau-né ------------------------------------------------------------------------
  v("Atrésie de l'œsophage", "G", "major", "intermediate", "low", true, IT, { family: "atresie-oesophage", population: "neonate", aka: ["fistule œso-trachéale"], h: 3, t: G, pos: "Décubitus latéral gauche", specifics: ["Fistule œso-trachéale : ventilation au masque prudente (distension gastrique), sonde placée sous la fistule"] }),
  v("Hernie diaphragmatique congénitale", "A", "major", "high", "low", true, UA, { family: "hernie-diaphragmatique", population: "neonate", h: 3, t: G, pos: DORSAL, specifics: ["Hypoplasie pulmonaire et HTAP : ventilation douce, pas de ventilation au masque vigoureuse, chirurgie après stabilisation"] }),
  v("Laparoschisis ou omphalocèle", "A", "major", "intermediate", "low", true, UA, { family: "paroi-abdominale-nn", population: "neonate", aka: ["gastroschisis"], h: 2, t: G, pos: DORSAL, specifics: ["Pertes hydriques et thermiques importantes ; syndrome du compartiment abdominal à la fermeture (pressions de ventilation, diurèse)"] }),
  v("Entérocolite ulcéronécrosante", "A", "major", "high", "high", true, UA, { family: "ecun", population: "neonate", aka: ["ECUN", "NEC"], h: 2, t: G, pos: DORSAL, specifics: ["Prématuré en choc septique, CIVD : souvent opéré en néonatologie, produits sanguins prêts"] }),
  v("Myéloméningocèle", "D", "major", "intermediate", "high", false, P, { family: "myelomeningocele", population: "neonate", aka: ["spina bifida"], h: 2, t: G, pos: "Décubitus ventral", closed: true, specifics: ["Intubation en décubitus latéral ou sur appui (protéger la poche) ; allergie au latex à prévenir d'emblée"] }),
  v("Valves de l'urètre postérieur", "J2", "minor", "low", "minimal", false, P, { approach: "endoscopic", family: "valves-uretre", population: "neonate", sex: "M", h: 0.75, t: G, pos: "Lithotomie" }),
  // --- Compléments du catalogue, par spécialité ---------------------------------------
  // Orthopédie
  v("Arthroscopie de cheville", "K", "intermediate", "low", "low", false, P, { approach: "arthroscopic", family: "arthroscopie-cheville", h: 1, t: GB, pos: DORSAL }),
  v("Arthroscopie du poignet", "K", "minor", "low", "minimal", false, P, { approach: "arthroscopic", family: "arthroscopie-poignet", h: 1, t: ["superficial_block"], pos: "Décubitus dorsal, bras sur table (traction)" }),
  v("Prothèse trapézo-métacarpienne (rhizarthrose)", "K", "intermediate", "low", "low", false, P, { family: "rhizarthrose", aka: ["trapézectomie", "rhizarthrose"], h: 1, t: ["superficial_block"], pos: "Décubitus dorsal, bras sur table" }),
  v("Fracture du scaphoïde (vissage)", "K", "minor", "low", "minimal", false, P, { family: "scaphoide", h: 0.75, t: ["superficial_block"], pos: "Décubitus dorsal, bras sur table" }),
  v("Fracture de la rotule", "K", "intermediate", "low", "low", false, P, { family: "rotule", aka: ["patella", "haubanage"], h: 1.25, t: ["neuraxial", "general"], pos: DORSAL }),
  v("Fracture du calcanéum", "K", "intermediate", "low", "low", false, P, { family: "calcaneum", h: 2, t: GB, pos: LATERAL }),
  v("Fracture des deux os de l'avant-bras", "K", "intermediate", "low", "low", false, P, { family: "avant-bras", h: 1.5, t: GB, pos: "Décubitus dorsal, bras sur table" }),
  v("Luxation acromio-claviculaire", "K", "intermediate", "low", "low", false, P, { family: "acromio-claviculaire", h: 1.25, t: GB, pos: "Semi-assise (beach chair)" }),
  v("Stabilisation de rotule (MPFL)", "K", "intermediate", "low", "low", false, P, { family: "rotule-instabilite", aka: ["luxation de rotule", "ligament patello-fémoral médial"], h: 1.25, t: GB, pos: DORSAL }),
  v("Ostéotomie tibiale de valgisation", "K", "intermediate", "low", "high", false, P, { family: "osteotomie", aka: ["OTV"], h: 1.5, t: ["neuraxial", "general"], pos: DORSAL }),
  v("Bursectomie (olécrâne, prépatellaire)", "K", "minor", "low", "minimal", false, P, { family: "bursectomie", aka: ["hygroma"], h: 0.5, t: ["superficial_block", "general"], pos: DORSAL }),
  v("Kyste synovial ou ténosynovite (De Quervain)", "K", "minor", "low", "minimal", false, P, { family: "kyste-synovial", aka: ["kyste arthrosynovial", "De Quervain", "doigt à ressaut"], h: 0.5, t: ["superficial_block"], pos: "Décubitus dorsal, bras sur table" }),
  v("Pied diabétique : débridement ou amputation mineure", "K", "minor", "intermediate", "low", false, P, { family: "pied-diabetique", aka: ["ostéite", "mal perforant", "amputation d'orteil"], h: 0.75, t: ["superficial_block", "sedation"], pos: DORSAL }),
  v("Prothèse totale de hanche par voie antérieure", "K", "major", "intermediate", "high", false, P, { family: "pth", aka: ["PTH voie antérieure", "DAA"], h: 1.5, t: ["neuraxial", "general"], pos: "Décubitus dorsal, table orthopédique ou jambe libre" }),
  // Digestif
  v("Intervention de Hartmann", "A", "major", "intermediate", "high", true, UA, { approach: "open", family: "colectomie", aka: ["sigmoïdite perforée", "diverticulite compliquée"], h: 2.5, t: G, pos: DORSAL }),
  v("Volvulus : détorsion ou colectomie", "A", "major", "intermediate", "high", true, UA, { family: "occlusion", aka: ["volvulus du sigmoïde"], h: 2, t: G, pos: DORSAL, specifics: ["Occlusion : estomac plein, induction à séquence rapide, déshydratation"] }),
  v("Abcès ou collection de paroi : drainage", "A", "minor", "low", "low", false, P, { family: "abces", h: 0.5, t: G, pos: "Selon la localisation" }),
  v("Adénectomie (biopsie ganglionnaire)", "A", "minor", "low", "low", false, P, { family: "ganglion", aka: ["exérèse ganglionnaire", "biopsie de ganglion"], h: 0.5, t: G, pos: DORSAL }),
  v("Ablation d'anneau gastrique", "A", "intermediate", "intermediate", "low", true, UA, { approach: "laparoscopic", family: "bariatrique-anneau", h: 1.5, t: G, pos: "Décubitus dorsal, proclive", profile: "bariatric" }),
  v("Transplantation pancréatique", "A", "major", "high", "high", true, UA, { family: "transplantation-pancreas", aka: ["greffe rein-pancréas"], h: 6, t: G, pos: DORSAL }),
  v("Cervicotomie exploratrice", "A", "intermediate", "low", "high", false, P, { family: "thyroidectomie", h: 1.5, t: G, pos: "Décubitus dorsal, cou en extension" }),
  // Vasculaire
  v("Traitement endoveineux des varices", "A", "minor", "low", "minimal", false, P, { approach: "percutaneous", family: "varices", aka: ["laser endoveineux", "radiofréquence veineuse", "crossectomie"], h: 1, t: ["sedation"], pos: DORSAL }),
  v("Anévrisme poplité", "A", "intermediate", "high", "high", false, P, { family: "poplite", h: 3, t: ["general", "neuraxial"], pos: "Décubitus ventral ou dorsal" }),
  v("Pontage axillo-fémoral ou fémoro-fémoral croisé", "A", "major", "high", "high", false, P, { family: "pontage-extra-anatomique", h: 3, t: G, pos: DORSAL }),
  v("Thrombectomie veineuse ou désobstruction de FAV", "A", "minor", "low", "low", false, P, { family: "fav", aka: ["thrombose de FAV"], h: 1, t: ["superficial_block", "sedation"], pos: "Décubitus dorsal, bras sur table" }),
  // Urologie
  v("Torsion testiculaire", "J2", "minor", "low", "low", false, P, { family: "torsion-testicule", sex: "M", aka: ["détorsion", "orchidopexie en urgence"], h: 0.5, t: G, pos: DORSAL, specifics: ["Urgence (ischémie testiculaire) : souvent estomac plein chez l'adolescent"] }),
  v("Néphrostomie percutanée", "J2", "minor", "low", "low", false, P, { approach: "percutaneous", family: "derivation-urinaire", h: 0.5, t: ["sedation", "general"], pos: "Décubitus ventral" }),
  v("Lithotritie ou cystolithotomie vésicale", "J2", "minor", "low", "low", false, P, { approach: "endoscopic", family: "lithiase-vesicale", aka: ["calcul vésical"], h: 0.75, t: SP, pos: "Lithotomie" }),
  v("Néphrectomie de l'enfant (tumeur de Wilms)", "J2", "major", "intermediate", "high", true, UA, { family: "nephrectomie", population: "child", aka: ["néphroblastome", "Wilms"], h: 3, t: GR, pos: DORSAL }),
  // Gynécologie
  v("Kyste ou abcès de la glande de Bartholin", "J1", "minor", "low", "minimal", false, P, { family: "bartholin", sex: "F", aka: ["marsupialisation"], h: 0.33, t: G, pos: "Lithotomie" }),
  v("Hystérectomie élargie robot-assistée", "J1", "major", "intermediate", "high", true, P, { approach: "robotic", family: "hysterectomie", sex: "F", aka: ["Wertheim robot", "cancer du col"], h: 4, t: G, pos: LITHO_TREND }),
  v("Curetage évacuateur (fausse couche)", "J1", "minor", "low", "low", false, P, { approach: "endoscopic", family: "aspiration-uterine", sex: "F", aka: ["fausse couche", "rétention"], h: 0.25, t: G, pos: "Lithotomie" }),
  // ORL
  v("Mastoïdectomie", "C", "intermediate", "low", "low", false, P, { family: "oreille", aka: ["cholestéatome", "tympanoplastie en technique fermée"], h: 2.5, t: G, pos: "Décubitus dorsal, tête tournée" }),
  v("Otoplastie", "C", "minor", "low", "low", false, P, { family: "otoplastie", aka: ["oreilles décollées"], h: 1.25, t: G, pos: DORSAL }),
  v("Épistaxis : tamponnement ou ligature", "C", "minor", "low", "high", false, P, { family: "epistaxis", aka: ["ligature de l'artère sphénopalatine"], h: 1, t: G, pos: "Décubitus dorsal, proclive", specifics: ["Sang dégluti : estomac plein ; patient souvent hypertendu, anticoagulé"] }),
  v("Réduction de fracture des os propres du nez", "C", "minor", "low", "low", false, P, { family: "nez", h: 0.25, t: G, pos: DORSAL }),
  v("Kyste du tractus thyréoglosse", "C", "intermediate", "low", "low", false, P, { family: "cou-enfant", population: "child", aka: ["Sistrunk"], h: 1.25, t: G, pos: "Décubitus dorsal, cou en extension" }),
  v("Glossectomie partielle", "C", "intermediate", "intermediate", "high", false, P, { family: "cavite-buccale", aka: ["pelvi-glossectomie"], h: 2, t: G, pos: DORSAL }),
  // Thorax et cardiaque
  v("Correction de pectus excavatum (Nuss)", "G", "major", "low", "low", false, IT, { approach: "thoracoscopic", family: "pectus", population: "child", aka: ["thorax en entonnoir"], h: 1.5, t: GD, pos: DORSAL, specifics: ["Douleur postopératoire intense : péridurale thoracique, blocs (ESP, paravertébral) ou cryoanalgésie selon l'équipe"] }),
  v("Chirurgie des cardiopathies congénitales de l'enfant", "F", "major", "high", "high", true, IT, { family: "cardiopathie-congenitale", population: "child", aka: ["CIV", "CIA", "tétralogie de Fallot", "canal artériel"], h: 4, t: G, pos: DORSAL, profile: "cardiac_cpb" }),
  v("Pleurectomie ou pleurodèse chirurgicale", "G", "major", "intermediate", "low", true, IT, { approach: "thoracoscopic", family: "pneumothorax", h: 1.5, t: GD, pos: LATERAL }),
  // Plastique
  v("Lipofilling", "L", "minor", "low", "low", false, P, { family: "lipofilling", aka: ["greffe de graisse"], h: 1.5, t: G, pos: "Selon la localisation" }),
  v("Ablation ou changement de prothèses mammaires", "L", "minor", "low", "low", false, P, { family: "prothese-mammaire", sex: "F", aka: ["capsulectomie"], h: 1.25, t: G, pos: "Décubitus dorsal, semi-assis" }),
  v("Blépharoplastie", "L", "minor", "low", "minimal", false, P, { family: "paupieres", aka: ["paupières"], h: 1, t: SED, pos: DORSAL }),
  // --- Deuxième passe : voies manquantes --------------------------------------------------
  v("Sigmoïdectomie par cœlioscopie", "A", "major", "intermediate", "high", true, UA, { approach: "laparoscopic", family: "colectomie", aka: ["diverticulite", "résection sigmoïdienne"], h: 3, t: G, pos: TREND }),
  v("Hémicolectomie droite par cœlioscopie", "A", "major", "intermediate", "high", true, UA, { approach: "laparoscopic", family: "colectomie", aka: ["colectomie droite coelio"], h: 2.5, t: G, pos: TREND }),
  v("Gastrectomie robot-assistée", "A", "major", "intermediate", "high", true, UA, { approach: "robotic", family: "gastrectomie", h: 4.5, t: G, pos: "Décubitus dorsal, proclive", profile: "major_digestive" }),
  v("Bypass gastrique en oméga (mini-bypass)", "A", "major", "intermediate", "high", true, UA, { approach: "laparoscopic", family: "bariatrique-bypass", aka: ["OAGB", "mini gastric bypass"], h: 2, t: G, pos: "Décubitus dorsal, proclive", profile: "bariatric" }),
  v("Pose d'anneau gastrique", "A", "intermediate", "intermediate", "low", true, UA, { approach: "laparoscopic", family: "bariatrique-anneau", aka: ["anneau gastrique ajustable"], h: 1.25, t: G, pos: "Décubitus dorsal, proclive", profile: "bariatric" }),
  v("Cure de hernie inguinale robot-assistée", "A", "intermediate", "low", "low", true, P, { approach: "robotic", family: "hernie-inguinale", aka: ["TAPP robot", "rTAPP"], h: 1.5, t: G, pos: TREND }),
  v("Cure d'éventration robot-assistée", "A", "intermediate", "intermediate", "low", true, UA, { approach: "robotic", family: "eventration", aka: ["TAR robot", "rétro-musculaire robot"], h: 3, t: G, pos: DORSAL }),
  v("Cure d'éventration complexe (séparation des composants)", "A", "major", "intermediate", "high", true, UA, { approach: "open", family: "eventration", aka: ["TAR", "Rives-Stoppa", "perte de domicile"], h: 4, t: GR, pos: DORSAL, specifics: ["Perte de domicile : pressions de ventilation et hyperpression abdominale à la fermeture (diurèse, pressions de plateau)", "Péridurale thoracique ou blocs de paroi (TAP, rectus) en analgésie"] }),
  v("Pancréatectomie gauche robot-assistée", "A", "major", "high", "high", true, UA, { approach: "robotic", family: "pancreatectomie-gauche", h: 4, t: G, pos: "Décubitus latéral droit partiel", profile: "major_digestive" }),
  v("Surrénalectomie robot-assistée", "A", "major", "high", "high", true, UA, { approach: "robotic", family: "surrenalectomie", aka: ["phéochromocytome robot"], h: 2.5, t: G, pos: LATERAL }),
  v("Cure de prolapsus rectal par voie périnéale", "A", "intermediate", "low", "low", false, P, { approach: "open", family: "rectopexie", aka: ["Delorme", "Altemeier"], h: 1.5, t: GR, pos: "Lithotomie ou décubitus ventral jackknife" }),
  v("Rectopexie par cœlioscopie ou robot", "A", "intermediate", "intermediate", "low", true, P, { approach: "laparoscopic", family: "rectopexie", aka: ["rectopexie ventrale", "Orr-Loygue"], h: 2.5, t: G, pos: LITHO_TREND }),
  v("Exérèse de condylomes anaux ou génitaux", "A", "minor", "low", "minimal", false, P, { family: "proctologie", aka: ["condylomes", "HPV"], h: 0.5, t: GR, pos: "Lithotomie" }),
  v("Maladie de Verneuil : exérèse", "L", "intermediate", "low", "low", false, P, { family: "verneuil", aka: ["hidradénite suppurée"], h: 1.5, t: G, pos: "Selon la localisation" }),
  v("Drainage biliaire percutané", "X", "minor", "low", "low", false, P, { approach: "percutaneous", family: "voies-biliaires", aka: ["DBTH", "drainage biliaire transhépatique"], h: 1, t: ["sedation", "general"], pos: DORSAL, specifics: ["Angiocholite : sepsis, bactériémie au geste ; douleur intense à la dilatation"] }),
  v("Diverticule de Zenker (voie endoscopique)", "C", "minor", "low", "minimal", false, P, { approach: "endoscopic", family: "zenker", aka: ["diverticulotomie", "Zenker"], h: 0.75, t: G, pos: "Décubitus dorsal, tête en extension", specifics: ["Régurgitation du contenu du diverticule : séquence rapide, tête surélevée, aspiration prête"] }),
  // Urologie et gynécologie : voies manquantes
  v("Cystectomie par cœlioscopie", "J2", "major", "high", "high", true, P, { approach: "laparoscopic", family: "cystectomie", h: 5, t: G, pos: LITHO_TREND }),
  v("Néphro-urétérectomie par cœlioscopie ou robot", "J2", "major", "intermediate", "high", true, UA, { approach: "laparoscopic", family: "nephro-ureterectomie", aka: ["tumeur de la voie excrétrice", "néphro-urétérectomie robot"], h: 3.5, t: G, pos: LATERAL }),
  v("Pyéloplastie par cœlioscopie", "J2", "intermediate", "intermediate", "low", true, UA, { approach: "laparoscopic", family: "pyeloplastie", aka: ["syndrome de la jonction"], h: 2.5, t: G, pos: LATERAL }),
  v("Adénomectomie prostatique robot-assistée", "J2", "major", "intermediate", "high", true, P, { approach: "robotic", family: "hbp-prostate", sex: "M", aka: ["adénomectomie robot"], h: 2.5, t: G, pos: LITHO_TREND }),
  v("Orchidopexie par cœlioscopie (testicule non palpable)", "J2", "intermediate", "low", "low", true, P, { approach: "laparoscopic", family: "orchidopexie", population: "child", sex: "M", aka: ["Fowler-Stephens", "cryptorchidie"], h: 1.5, t: GB, pos: TREND }),
  v("Chirurgie de la maladie de La Peyronie", "J2", "intermediate", "low", "low", false, P, { family: "verge", sex: "M", aka: ["courbure de verge", "Nesbit", "plicature"], h: 1.5, t: GR, pos: DORSAL }),
  v("Fistule vésico-vaginale : cure", "J1", "intermediate", "low", "low", false, P, { family: "fistule-uro-gyneco", sex: "F", h: 2.5, t: GR, pos: "Lithotomie" }),
  v("Salpingectomie ou kystectomie ovarienne par cœlioscopie", "J1", "intermediate", "low", "low", true, P, { approach: "laparoscopic", family: "annexes", sex: "F", aka: ["kyste de l'ovaire coelio", "salpingectomie"], h: 1, t: G, pos: TREND }),
  v("Torsion d'annexe", "J1", "intermediate", "low", "low", true, P, { approach: "laparoscopic", family: "annexes", sex: "F", aka: ["détorsion ovarienne", "torsion ovarienne"], h: 1, t: G, pos: TREND, specifics: ["Urgence (ischémie ovarienne), souvent jeune femme ou adolescente : estomac plein possible, test de grossesse"] }),
  v("Myomectomie robot-assistée", "J1", "major", "intermediate", "high", true, P, { approach: "robotic", family: "myomectomie", sex: "F", h: 3, t: G, pos: LITHO_TREND }),
  v("Cure de prolapsus par voie vaginale", "J1", "intermediate", "low", "low", false, P, { approach: "vaginal", family: "prolapsus", sex: "F", aka: ["colporraphie", "sacrospinofixation", "Richter"], h: 1.5, t: GR, pos: "Lithotomie" }),
  v("Extraction instrumentale (forceps, ventouse)", "B", "minor", "low", "high", false, P, { approach: "vaginal", family: "accouchement", sex: "F", aka: ["forceps", "ventouse", "spatules"], h: 0.5, t: SP, pos: "Lithotomie", profile: "obstetric", specifics: ["Renforcer la péridurale du travail en place ; sinon rachianesthésie ou AG à séquence rapide selon l'urgence", "Hémorragie du post-partum : fiche de crise, ocytocine prête"] }),
  v("Hémorragie du post-partum : embolisation ou chirurgie", "B", "major", "high", "high", false, P, { family: "hpp", sex: "F", aka: ["HPP", "embolisation des artères utérines", "ligature vasculaire", "B-Lynch"], h: 1.5, t: G, pos: "Lithotomie ou décubitus dorsal", profile: "obstetric", specifics: ["Choc hémorragique : protocole transfusionnel massif, acide tranexamique 1 g, fibrinogène > 2 g/L (CNGOF/SFAR 2022)"] }),
  // Orthopédie : adulte et enfant
  v("Prothèse totale de genou robot-assistée", "K", "major", "intermediate", "high", false, P, { approach: "robotic", family: "ptg", aka: ["Mako", "ROSA", "PTG robot"], h: 2, t: ["neuraxial", "general"], pos: DORSAL }),
  v("Maladie de Dupuytren : aponévrectomie", "K", "minor", "low", "minimal", false, P, { family: "main", aka: ["Dupuytren", "aponévrotomie"], h: 1, t: ["superficial_block"], pos: "Décubitus dorsal, bras sur table" }),
  v("Arthroscopie du coude", "K", "minor", "low", "minimal", false, P, { approach: "arthroscopic", family: "arthroscopie-coude", h: 1.25, t: GB, pos: "Décubitus latéral ou ventral, bras suspendu" }),
  v("Fracture de vertèbre : ostéosynthèse percutanée", "K", "intermediate", "low", "low", false, P, { approach: "percutaneous", family: "rachis-fracture", aka: ["vissage percutané", "fracture thoraco-lombaire"], h: 1.5, t: G, pos: "Décubitus ventral", closed: true }),
  v("Fracture périprothétique", "K", "major", "intermediate", "high", false, P, { family: "reprise-prothese", aka: ["Vancouver"], h: 2.5, t: ["neuraxial", "general"], pos: "Décubitus latéral ou dorsal", profile: "arthroplasty" }),
  v("Épiphysiolyse fémorale supérieure : vissage", "K", "intermediate", "low", "low", false, P, { family: "hanche-enfant", population: "child", aka: ["épiphysiolyse", "adolescent obèse"], h: 1, t: G, pos: "Décubitus dorsal, table orthopédique" }),
  v("Luxation congénitale de hanche : réduction et plâtre", "K", "minor", "low", "minimal", false, P, { family: "hanche-enfant", population: "child", aka: ["dysplasie de hanche", "arthrographie", "plâtre pelvi-pédieux"], h: 1, t: G, pos: DORSAL }),
  v("Ostéotomie pelvienne ou fémorale de l'enfant", "K", "major", "low", "high", false, P, { family: "hanche-enfant", population: "child", aka: ["Salter", "ostéotomie de varisation"], h: 3, t: GR, pos: DORSAL, specifics: ["Péridurale caudale ou lombaire en analgésie ; saignement à surveiller rapporté au poids"] }),
  v("Chirurgie multisite de la paralysie cérébrale", "K", "major", "intermediate", "high", false, P, { family: "paralysie-cerebrale", population: "child", aka: ["IMC", "allongements tendineux", "SEMLS"], h: 4, t: GR, pos: "Décubitus dorsal puis ventral", specifics: ["Reflux, troubles de déglutition, épilepsie, hypothermie, dénutrition ; succinylcholine non contre-indiquée mais sensibilité aux curares variable", "Péridurale en analgésie ; spasmes musculaires postopératoires (diazépam)"] }),
  v("Arthrodèse pour scoliose neuromusculaire", "K", "major", "high", "high", false, P, { family: "scoliose", population: "child", aka: ["scoliose neuromusculaire", "Duchenne", "amyotrophie spinale"], h: 6, t: G, pos: "Décubitus ventral", closed: true, specifics: ["Fonction respiratoire et cardiaque (Duchenne : cardiomyopathie, pas de succinylcholine ni d'halogénés), saignement plus important que dans la scoliose idiopathique"] }),
  v("Fracture du fémur de l'enfant (embrochage)", "K", "intermediate", "low", "low", false, P, { family: "femur-enfant", population: "child", aka: ["ECMES", "embrochage centromédullaire"], h: 1.5, t: GB, pos: "Décubitus dorsal, table orthopédique" }),
  v("Ostéomyélite ou arthrite septique de l'enfant", "K", "minor", "low", "low", false, P, { family: "infection-os-enfant", population: "child", aka: ["arthrite septique", "lavage articulaire enfant"], h: 1, t: G, pos: DORSAL, specifics: ["Sepsis possible : hémocultures avant antibiotiques si l'état le permet"] }),
  v("Syndactylie ou polydactylie", "L", "intermediate", "low", "minimal", false, P, { family: "main-enfant", population: "child", h: 1.5, t: GB, pos: "Décubitus dorsal, bras sur table" }),
  // Neurochirurgie
  v("Malformation de Chiari : décompression", "D", "major", "intermediate", "high", false, P, { family: "chiari", aka: ["Chiari", "décompression sous-occipitale"], h: 2.5, t: G, pos: "Décubitus ventral, tête fixée", closed: true, profile: "neurosurgery" }),
  v("Dérivation ventriculo-péritonéale de l'enfant", "D", "intermediate", "low", "high", false, P, { family: "hydrocephalie", population: "child", aka: ["valve", "hydrocéphalie", "révision de valve"], h: 1.5, t: G, pos: "Décubitus dorsal, tête tournée", specifics: ["Dysfonction de valve : hypertension intracrânienne, estomac plein (vomissements) — séquence rapide"] }),
  v("Moelle attachée : libération", "D", "intermediate", "low", "high", false, P, { family: "moelle-attachee", population: "child", aka: ["lipome du cône", "filum terminale"], h: 3, t: G, pos: "Décubitus ventral", specifics: ["Monitorage neurophysiologique : TIVA, pas de curare après l'induction"] }),
  v("Arthrodèse lombaire par voie antérieure", "D", "major", "intermediate", "high", false, UA, { approach: "open", family: "arthrodese-lombaire", aka: ["ALIF", "arthrodèse intersomatique antérieure"], h: 3, t: G, pos: DORSAL, specifics: ["Voie rétropéritonéale : traction des gros vaisseaux (plaie veineuse iliaque), iléus"] }),
  v("Laminoplastie cervicale", "D", "major", "intermediate", "high", false, P, { family: "rachis-cervical", aka: ["myélopathie cervicarthrosique"], h: 3, t: G, pos: "Décubitus ventral, tête fixée", closed: true, specifics: ["Myélopathie : intubation rachis en rectitude (vidéolaryngoscope ou fibroscope), PAM maintenue pour la perfusion médullaire"] }),
  v("Dérivation lombo-péritonéale", "D", "intermediate", "low", "high", false, P, { family: "hydrocephalie", aka: ["hypertension intracrânienne idiopathique"], h: 1.5, t: G, pos: LATERAL }),
  v("Radiochirurgie ou pose de cadre stéréotaxique", "D", "minor", "low", "minimal", false, P, { family: "stereotaxie", aka: ["gamma knife", "cadre de Leksell"], h: 1, t: SED, pos: DORSAL, specifics: ["Cadre fixé à la tête : clé de démontage à portée pour l'accès aux voies aériennes"] }),
  // ORL, ophtalmologie, maxillo-facial
  v("Laryngomalacie : supraglottoplastie", "C", "minor", "low", "minimal", false, P, { approach: "endoscopic", family: "larynx-enfant", population: "neonate", aka: ["laryngomalacie", "stridor du nourrisson"], h: 0.75, t: G, pos: "Décubitus dorsal, laryngoscope en suspension", specifics: ["Voies aériennes partagées : ventilation spontanée sous propofol ou sévoflurane, oxygénation apnéique ; laryngospasme"] }),
  v("Sténose sous-glottique : dilatation ou laryngotrachéoplastie", "C", "intermediate", "low", "low", false, P, { approach: "endoscopic", family: "larynx-enfant", population: "child", aka: ["dilatation au ballonnet", "sténose laryngée"], h: 1.5, t: G, pos: DORSAL, specifics: ["Voies aériennes partagées, sonde plus petite que pour l'âge ; œdème postopératoire (dexaméthasone)"] }),
  v("Cataracte de l'enfant", "I", "intermediate", "low", "minimal", false, P, { family: "cataracte", population: "child", aka: ["cataracte congénitale"], h: 1, t: G, pos: DORSAL, specifics: ["Rechercher un syndrome associé (trisomie 21, rubéole congénitale, métabolique)"] }),
  v("Rétinopathie du prématuré : laser", "I", "minor", "low", "minimal", false, P, { family: "rop", population: "neonate", aka: ["ROP", "photocoagulation"], h: 1, t: ["general", "sedation"], pos: DORSAL, specifics: ["Ancien prématuré, dysplasie bronchopulmonaire, apnées : souvent en néonatologie, ventilation postopératoire possible"] }),
  v("Glaucome congénital", "I", "intermediate", "low", "minimal", false, P, { family: "glaucome", population: "child", aka: ["goniotomie", "trabéculotomie", "examen sous AG"], h: 1, t: G, pos: DORSAL, specifics: ["La kétamine et la succinylcholine augmentent la pression intraoculaire : mesure avant l'intubation"] }),
  v("Ptérygion ou chalazion", "I", "minor", "low", "minimal", false, P, { family: "surface-oculaire", aka: ["ptérygion", "chalazion"], h: 0.5, t: SED, pos: DORSAL }),
  v("Génioplastie ou ostéotomie de Le Fort I", "E", "intermediate", "low", "high", false, P, { family: "orthognathique", aka: ["génioplastie", "Le Fort I"], h: 2.5, t: G, pos: DORSAL, specifics: ["Intubation nasotrachéale, hypotension contrôlée, blocage maxillo-mandibulaire possible : pinces coupantes au réveil"] }),
  // Thorax, cardiaque, vasculaire
  v("Valves endobronchiques (réduction de volume)", "G", "minor", "low", "minimal", false, IT, { approach: "endoscopic", family: "emphyseme", aka: ["Zephyr", "valves endobronchiques"], h: 1, t: G, pos: DORSAL, specifics: ["Emphysème sévère : pneumothorax post-geste fréquent (drain à portée), hyperinflation dynamique"] }),
  v("Résection de bulles d'emphysème", "G", "major", "intermediate", "low", true, IT, { approach: "thoracoscopic", family: "emphyseme", aka: ["bullectomie"], h: 2, t: GD, pos: LATERAL, specifics: ["Pas de N₂O ; pressions de ventilation basses (rupture de bulle, pneumothorax sous tension)"] }),
  v("Malformation pulmonaire congénitale : lobectomie", "G", "major", "intermediate", "low", true, IT, { approach: "thoracoscopic", family: "lobectomie", population: "child", aka: ["MAKP", "CPAM", "séquestration pulmonaire"], h: 2.5, t: GD, pos: LATERAL, specifics: ["Exclusion pulmonaire de l'enfant : bloqueur bronchique ou intubation sélective"] }),
  v("Ligature du canal artériel", "F", "intermediate", "high", "low", true, IT, { family: "canal-arteriel", population: "neonate", aka: ["canal artériel persistant", "prématuré"], h: 1.5, t: G, pos: "Décubitus latéral droit", specifics: ["Grand prématuré souvent opéré en néonatologie ; hémorragie brutale possible, sang en salle"] }),
  v("Chirurgie de la valve tricuspide", "F", "major", "high", "high", true, IT, { family: "valve-tricuspide", aka: ["annuloplastie tricuspide"], h: 4, t: G, pos: DORSAL, profile: "cardiac_valve" }),
  v("Tamponnade postopératoire : reprise", "F", "major", "high", "high", true, IT, { family: "reprise-cardiaque", aka: ["tamponnade", "reprise pour saignement", "sternotomie de reprise"], h: 1.5, t: G, pos: DORSAL, specifics: ["Tamponnade : induction en ventilation spontanée ou prudente, maintenir précharge et fréquence ; champ et chirurgien prêts avant l'induction"] }),
  v("Canulation d'ECMO", "F", "intermediate", "high", "high", false, P, { approach: "percutaneous", family: "ecmo", aka: ["ECMO veino-artérielle", "ECMO veino-veineuse", "ECLS"], h: 1.5, t: G, pos: DORSAL, specifics: ["Patient en choc ou en hypoxémie réfractaire : anticoagulation, transfusion, embolie gazeuse à la canulation"] }),
  v("Syndrome du défilé thoraco-brachial", "A", "intermediate", "low", "low", false, P, { family: "defile", aka: ["résection de la première côte"], h: 2, t: G, pos: "Décubitus latéral ou dorsal" }),
  // Plastique et autres
  v("Gynécomastie", "L", "minor", "low", "low", false, P, { family: "gynecomastie", sex: "M", aka: ["mastectomie sous-cutanée"], h: 1.5, t: G, pos: "Décubitus dorsal, bras en abduction" }),
  v("Chirurgie d'affirmation de genre", "L", "major", "intermediate", "high", false, P, { family: "genre", aka: ["vaginoplastie", "phalloplastie", "mastectomie de torse"], h: 5, t: G, pos: "Lithotomie ou décubitus dorsal", specifics: ["Hormonothérapie : œstrogènes (risque thromboembolique, arrêt selon l'équipe) ou testostérone (hématocrite)", "Utiliser le prénom et le genre choisis par la personne"] }),
  v("Lambeau pour escarre", "L", "intermediate", "intermediate", "high", false, P, { family: "escarre", aka: ["escarre sacrée", "escarre ischiatique", "paraplégique"], h: 2.5, t: G, pos: "Décubitus ventral", specifics: ["Paraplégie ou tétraplégie : pas de succinylcholine, hyperréflexie autonome si lésion au-dessus de T6"] }),
  v("Hémangiome ou malformation vasculaire de l'enfant : exérèse ou laser", "L", "minor", "low", "low", false, P, { family: "angiome-enfant", population: "child", aka: ["angiome", "laser à colorant pulsé"], h: 0.75, t: G, pos: "Selon la localisation" }),
  v("Pose de PICC line ou de chambre implantable (enfant)", "X", "minor", "low", "low", false, P, { approach: "percutaneous", family: "acces-vasculaire", population: "child", aka: ["Broviac", "cathéter central enfant", "PAC enfant"], h: 0.75, t: G, pos: DORSAL }),
  v("Cathétérisme cardiaque de l'enfant", "X", "intermediate", "high", "low", false, P, { approach: "endovascular", family: "cardiopathie-congenitale", population: "child", aka: ["Rashkind", "dilatation valvulaire percutanée", "fermeture de canal artériel"], h: 2, t: G, pos: DORSAL, specifics: ["Cardiopathie : shunt et équilibre des résistances (FiO₂, CO₂) selon la lésion, sur avis du cardiopédiatre"] }),
  v("Biopsie hépatique transjugulaire", "X", "minor", "low", "low", false, P, { approach: "endovascular", family: "biopsie-hepatique", h: 0.75, t: SED, pos: DORSAL }),
  v("Drainage d'abcès du sein", "A", "minor", "low", "low", false, P, { family: "sein", aka: ["abcès mammaire", "mastite abcédée"], h: 0.33, t: G, pos: DORSAL }),
  v("Atrésie des voies biliaires (intervention de Kasai)", "A", "major", "intermediate", "high", true, UA, { family: "voies-biliaires-enfant", population: "neonate", aka: ["Kasai", "hépato-porto-entérostomie", "atrésie biliaire"], h: 4, t: GR, pos: DORSAL, specifics: ["Nourrisson de 1–2 mois ictérique : coagulation (vitamine K), hypoglycémie, saignement ; péridurale caudale ou thoracique selon l'équipe"] }),
  // Enfant (compléments)
  v("Ponction lombaire ou myélogramme (enfant)", "X", "minor", "low", "minimal", false, P, { approach: "percutaneous", family: "sedation-enfant", population: "child", aka: ["sédation hémato-oncologie", "chimiothérapie intrathécale"], h: 0.25, t: SED, pos: "Décubitus latéral" }),
  v("Pied bot : ténotomie d'Achille (nourrisson)", "K", "minor", "low", "minimal", false, P, { family: "pied-bot", population: "neonate", aka: ["Ponseti"], h: 0.25, t: G, pos: DORSAL }),
];
