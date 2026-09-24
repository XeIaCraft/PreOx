// Nomenclature of the official carnet (Commission d'agrément en
// Anesthésie-Réanimation, FWB) — the "Relevé des prestations" legend
// (column 6: category + degree, e.g. "BP2") and the "Rapport d'activité"
// table, which is finer-grained than the legend (J split into gynécologie /
// urologie, regional techniques split by type, technical acts, other
// activity domains). Codes are what gets stored and exported; labels are
// what the screens show.

export interface Option<T extends string = string> {
  code: T;
  label: string;
  short?: string;
}

/** Surgical category (column 6, first letter). "H" (children under 4) is a separate flag, as in the carnet: those cases also count in their own category. */
export const OPERATION_CATEGORIES: Option[] = [
  { code: "A", label: "Chirurgie générale (y.c. vasculaire non thoracique)", short: "Chir. générale" },
  { code: "B", label: "Obstétrique", short: "Obstétrique" },
  { code: "C", label: "ORL – tête et cou", short: "ORL" },
  { code: "D", label: "Neurochirurgie", short: "Neurochir." },
  { code: "E", label: "Stomatologie, dentisterie, maxillo-faciale", short: "Stomato / MF" },
  { code: "F", label: "Chirurgie cardiaque", short: "Cardiaque" },
  { code: "G", label: "Autres opérations intrathoraciques", short: "Thoracique" },
  { code: "I", label: "Ophtalmologie", short: "Ophtalmo" },
  { code: "J1", label: "Gynécologie", short: "Gynéco" },
  { code: "J2", label: "Urologie", short: "Urologie" },
  { code: "K", label: "Orthopédie", short: "Orthopédie" },
  { code: "L", label: "Chirurgie plastique", short: "Plastique" },
  { code: "X", label: "Anesthésie pour autres procédures (endoscopie, radiologie…)", short: "Autres proc." },
];

/** Regional technique types, as split in the "Rapport d'activité". Péridurales export as "P" in column 6 (legend), every other type as "O". */
export const REGIONAL_TYPES: Option[] = [
  { code: "plexus_brachial", label: "Plexus brachial" },
  { code: "membre_inferieur", label: "Bloc crural / fémoral / poplité / cheville", short: "Bloc membre inf." },
  { code: "caudale", label: "Caudale" },
  { code: "peridurale", label: "Péridurale / séquentielle", short: "Péridurale" },
  { code: "alriv", label: "ALRIV (Bier)", short: "ALRIV" },
  { code: "rachianesthesie", label: "Rachianesthésie", short: "Rachi" },
  { code: "autre_alr", label: "Autre ALR" },
];

/** Technical acts and advanced airway / ultrasound skills counted in the "Rapport d'activité". */
export const TECHNICAL_ACTS: Option[] = [
  { code: "voie_centrale", label: "Voie centrale" },
  { code: "echo_vasculaire", label: "Échographie – accès vasculaire", short: "Écho vasculaire" },
  { code: "echo_cardiaque", label: "Échographie cardiaque", short: "Écho cardiaque" },
  { code: "fibroscopie", label: "Intubation difficile – fibroscopie", short: "Fibroscopie" },
  { code: "videolaryngoscope", label: "Intubation difficile – vidéolaryngoscope (Glidescope)", short: "Vidéolaryngo" },
  { code: "intubation_difficile_autre", label: "Intubation difficile – autre technique", short: "ID autre" },
  { code: "autre_acte", label: "Autre acte technique" },
];

export const PARTICIPATION_DEGREES: { code: 1 | 2 | 3; label: string; short: string }[] = [
  { code: 1, label: "Participation passive", short: "Passive" },
  { code: 2, label: "Participation supervisée", short: "Supervisée" },
  { code: 3, label: "Responsabilité directe", short: "Responsable" },
];

export const DUTY_TYPES: { code: "on_site" | "on_call"; label: string }[] = [
  { code: "on_site", label: "Garde sur place" },
  { code: "on_call", label: "Garde à domicile (rappelable)" },
];

export const ABSENCE_CATEGORIES: Option[] = [
  { code: "A", label: "Maladie" },
  { code: "B", label: "Congé de maternité" },
  { code: "C", label: "Congés scientifiques" },
  { code: "D", label: "Congés de circonstance (mariage, décès…)" },
  { code: "E", label: "Journées de travail effectives (ouvrables et fériés)" },
  { code: "F", label: "Autres absences" },
];

/** "Autres domaines d'activité" of the rapport d'activité — not derivable from the case log, entered per training year. */
export const ACTIVITY_COUNTERS: { code: string; domain: string; label: string }[] = [
  { code: "soins_intensifs", domain: "Soins intensifs", label: "Patients pris en charge" },
  { code: "smur", domain: "SMUR", label: "Nombre de sorties" },
  { code: "smur_intra", domain: "SMUR intrahospitalier", label: "Patients réanimés" },
  { code: "urgences_extra", domain: "Urgences extrahospitalières", label: "Patients accueillis" },
  { code: "analgesie_aigue", domain: "Analgésie aiguë (POPS, APS)", label: "Patients suivis 48 h ou plus" },
  { code: "uspa", domain: "USPA (PACU) et postopératoire", label: "Patients suivis" },
  { code: "algologie", domain: "Algologie", label: "Consultations" },
  { code: "consultations_preop", domain: "Consultations préopératoires", label: "Consultations" },
];

/** Stage "Activité" presets for the cover page table (free text still allowed). */
export const STAGE_ACTIVITIES = ["Anesthésie", "Soins intensifs", "Urgences / SMUR", "Algologie", "Recherche", "Autre"];

/**
 * Evaluation grid of the "Stages hospitaliers" pages, filled by hand by the
 * maître de stage — only ever printed (blank body, pre-filled header).
 */
export const EVALUATION_GRID: { title: string; items: string[]; overall: string }[] = [
  {
    title: "CONNAISSANCES PRATIQUES ET MÉDICALES",
    items: [
      "Le MSF a des connaissances médicales de base",
      "Le MSF réalise une mise au point préopératoire correcte (y compris l'adaptation du traitement médical)",
      "Le MSF propose un plan d'anesthésie prenant en compte des spécificités du patient et de la procédure",
      "Le MSF assure une analgésie adéquate et un suivi postopératoire est anticipé",
      "Le MSF a des connaissances théoriques en anesthésie en concordance avec son niveau de formation",
      "Le MSF a des compétences pratiques en anesthésie en concordance avec son niveau de formation",
      "Le MSF met régulièrement à jour son savoir au cours du stage et discute de la littérature en lien avec son secteur d'activité",
      "Le MSF a de l'ordre et du soin de l'équipement",
      "Le MSF connaît et applique les référentiels du service : procédures, consignes préopératoires",
    ],
    overall: "Appréciation globale des connaissances",
  },
  {
    title: "COMPORTEMENT",
    items: [
      "Avec le personnel et ses collègues",
      "Avec les patients",
      "Gestion du stress",
      "Capacité d'adaptation",
      "Esprit d'initiative",
      "Dynamisme",
      "Disponibilité",
      "Fiabilité",
      "Ponctualité",
      "Politesse, présentation",
    ],
    overall: "Appréciation globale du comportement",
  },
  {
    title: "PRISE EN CHARGE DE SA FORMATION",
    items: [
      "Le MSF est présent aux staffs",
      "Le MSF a présenté un staff estimé au niveau scientifique comme (contenu et forme)",
      "Le MSF s'investit dans sa formation : lecture, discussion multidisciplinaire…",
      "Le MSF connaît les exigences de sa formation pour son agrément et pour la faculté",
      "Le MSF s'investit dans les travaux de formation qui lui sont proposés : PBLD, travail de publication, de master",
    ],
    overall: "Appréciation globale de la prise en charge de sa formation",
  },
];

export const COMPETENCE_LEVELS = ["1re année : Questions", "2e année : Propositions", "3e année : Affirmation", "4e année : Délégation", "5e année : Supervision"];

function labelOf(options: Option[], code: string | null | undefined): string {
  return options.find((o) => o.code === code)?.label ?? code ?? "";
}

export const operationCategoryLabel = (code: string) => labelOf(OPERATION_CATEGORIES, code);
export const regionalTypeLabel = (code: string | null) => labelOf(REGIONAL_TYPES, code);
export const technicalActLabel = (code: string | null) => labelOf(TECHNICAL_ACTS, code);

/**
 * Column 6 of the official "Relevé des prestations": surgical category,
 * then technique letters, then the degree — e.g. a supervised caesarean
 * under epidural is "BP2" (the carnet's own example), a knee arthroscopy
 * under general anaesthesia plus a femoral block done alone is "KNO3",
 * a child under 4 adds "H" right after the category ("AHN2").
 */
export function caseCode(c: {
  operation_category: string;
  pediatric_under_4: boolean;
  general_anesthesia: boolean;
  regional_type: string | null;
  technical_act: string | null;
  participation: number;
}): string {
  let code = c.operation_category;
  if (c.pediatric_under_4) code += "H";
  if (c.general_anesthesia) code += "N";
  if (c.regional_type) code += c.regional_type === "peridurale" ? "P" : "O";
  if (c.technical_act && !c.general_anesthesia && !c.regional_type) code += "T";
  return `${code}${c.participation}`;
}

export function supervisorName(s: { first_name: string; last_name: string } | null | undefined): string {
  if (!s) return "";
  return [s.first_name, s.last_name].filter(Boolean).join(" ");
}
