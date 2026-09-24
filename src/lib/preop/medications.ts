// Patients' usual treatments — a starter catalogue, indexed by ATC code
// (WHO classification), limited to the classes that matter most around
// anaesthesia. Rules target an ATC code or a whole ATC group ("B01AF" =
// every direct factor Xa inhibitor), so a rule written for "les xabans"
// applies to each of them without listing them.
//
// To be replaced by an import of the Belgian reference (CBIP / SAM, which
// also carry the SmPC of each product): same fields, many more products.

export interface Medication {
  /** WHO ATC code of the substance. */
  atc: string;
  /** International non-proprietary name, in French. */
  name: string;
  /** Belgian brand names, searched but not displayed. */
  brands?: string[];
}

export interface AtcGroup {
  prefix: string;
  label: string;
}

/** ATC groups used by rules and by the "missing rule" detection. */
export const ATC_GROUPS: AtcGroup[] = [
  { prefix: "B01", label: "Antithrombotiques" },
  { prefix: "B01AA", label: "Antivitamines K" },
  { prefix: "B01AB", label: "Héparines (HNF, HBPM)" },
  { prefix: "B01AC", label: "Antiagrégants plaquettaires" },
  { prefix: "B01AE", label: "Inhibiteurs directs de la thrombine" },
  { prefix: "B01AF", label: "Inhibiteurs directs du facteur Xa (xabans)" },
  { prefix: "B01AX", label: "Autres antithrombotiques" },
  { prefix: "A10A", label: "Insulines" },
  { prefix: "A10BA", label: "Biguanides" },
  { prefix: "A10BJ", label: "Agonistes du GLP-1" },
  { prefix: "A10BK", label: "Inhibiteurs du SGLT2" },
  { prefix: "C07", label: "Bêtabloquants" },
  { prefix: "C09", label: "IEC et sartans" },
  { prefix: "H02AB", label: "Corticoïdes systémiques" },
  { prefix: "N03", label: "Antiépileptiques" },
  { prefix: "N04B", label: "Dopaminergiques (antiparkinsoniens)" },
  { prefix: "N06AF", label: "IMAO non sélectifs" },
];

export const MEDICATIONS: Medication[] = [
  { atc: "B01AF01", name: "Rivaroxaban", brands: ["Xarelto"] },
  { atc: "B01AF02", name: "Apixaban", brands: ["Eliquis"] },
  { atc: "B01AF03", name: "Edoxaban", brands: ["Lixiana"] },
  { atc: "B01AE07", name: "Dabigatran", brands: ["Pradaxa"] },
  { atc: "B01AA07", name: "Acénocoumarol", brands: ["Sintrom"] },
  { atc: "B01AA04", name: "Phenprocoumone", brands: ["Marcoumar"] },
  { atc: "B01AA03", name: "Warfarine", brands: ["Marevan"] },
  { atc: "B01AB05", name: "Énoxaparine", brands: ["Clexane"] },
  { atc: "B01AB06", name: "Nadroparine", brands: ["Fraxiparine", "Fraxodi"] },
  { atc: "B01AB10", name: "Tinzaparine", brands: ["Innohep"] },
  { atc: "B01AB04", name: "Daltéparine", brands: ["Fragmin"] },
  { atc: "B01AX05", name: "Fondaparinux", brands: ["Arixtra"] },
  { atc: "B01AC06", name: "Acide acétylsalicylique", brands: ["Asaflow", "Cardioaspirine", "Aspirine"] },
  { atc: "B01AC04", name: "Clopidogrel", brands: ["Plavix"] },
  { atc: "B01AC22", name: "Prasugrel", brands: ["Efient"] },
  { atc: "B01AC24", name: "Ticagrélor", brands: ["Brilique"] },
  { atc: "A10BA02", name: "Metformine", brands: ["Glucophage", "Metformax"] },
  { atc: "A10BK01", name: "Dapagliflozine", brands: ["Forxiga"] },
  { atc: "A10BK02", name: "Canagliflozine", brands: ["Invokana"] },
  { atc: "A10BK03", name: "Empagliflozine", brands: ["Jardiance"] },
  { atc: "A10BK04", name: "Ertugliflozine", brands: ["Steglatro"] },
  { atc: "A10BJ02", name: "Liraglutide", brands: ["Victoza", "Saxenda"] },
  { atc: "A10BJ05", name: "Dulaglutide", brands: ["Trulicity"] },
  { atc: "A10BJ06", name: "Sémaglutide", brands: ["Ozempic", "Wegovy", "Rybelsus"] },
  { atc: "A10AE04", name: "Insuline glargine", brands: ["Lantus", "Toujeo", "Abasaglar"] },
  { atc: "C07AB07", name: "Bisoprolol", brands: ["Emconcor"] },
  { atc: "C07AB02", name: "Métoprolol", brands: ["Selozok", "Lopresor"] },
  { atc: "C09AA05", name: "Ramipril", brands: ["Tritace"] },
  { atc: "C09AA04", name: "Périndopril", brands: ["Coversyl"] },
  { atc: "C09AA02", name: "Énalapril", brands: ["Renitec"] },
  { atc: "C09CA01", name: "Losartan", brands: ["Cozaar", "Loortan"] },
  { atc: "C09CA03", name: "Valsartan", brands: ["Diovane"] },
  { atc: "C09CA06", name: "Candésartan", brands: ["Atacand"] },
  { atc: "H02AB04", name: "Méthylprednisolone", brands: ["Medrol"] },
  { atc: "H02AB06", name: "Prednisolone" },
  { atc: "N03AX14", name: "Lévétiracétam", brands: ["Keppra"] },
  { atc: "N03AG01", name: "Acide valproïque", brands: ["Depakine"] },
  { atc: "N04BA02", name: "Lévodopa + inhibiteur de la décarboxylase", brands: ["Prolopa", "Sinemet"] },
];

/** Does an ATC code belong to a code or group (prefix)? */
export function atcMatches(code: string, target: string): boolean {
  return code.toUpperCase().startsWith(target.toUpperCase());
}

/** Most specific group label for a code or prefix ("B01AF01" → "Inhibiteurs directs du facteur Xa"). */
export function atcLabel(codeOrPrefix: string): string {
  const exact = MEDICATIONS.find((m) => m.atc === codeOrPrefix);
  if (exact) return exact.name;
  const group = [...ATC_GROUPS].sort((a, b) => b.prefix.length - a.prefix.length).find((g) => atcMatches(codeOrPrefix, g.prefix));
  return group?.label ?? codeOrPrefix;
}

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function searchMedications(query: string, limit = 8): Medication[] {
  const q = fold(query);
  if (!q) return [];
  return MEDICATIONS.filter((m) => [m.name, ...(m.brands ?? [])].some((n) => fold(n).startsWith(q) || fold(n).includes(` ${q}`) || (q.length >= 3 && fold(n).includes(q)))).slice(0, limit);
}

/**
 * Words used in guideline texts for a whole class, mapped to ATC targets —
 * used when turning a written rule into a structured one.
 */
export const CLASS_WORDS: { pattern: RegExp; atc: string[] }[] = [
  { pattern: /\bxabans?\b|anti-?xa\s+direct/i, atc: ["B01AF"] },
  { pattern: /\b(AOD|ACOD|NACO|DOAC|anticoagulants? oraux directs?)\b/i, atc: ["B01AF", "B01AE"] },
  { pattern: /\b(AVK|antivitamines? K)\b/i, atc: ["B01AA"] },
  { pattern: /\b(HBPM|LMWH|héparines? de bas poids)\b/i, atc: ["B01AB"] },
  { pattern: /\b(antiagrégants?|antiplaquettaires?|P2Y12)\b/i, atc: ["B01AC"] },
  { pattern: /\b(SGLT-?2|gliflozines?)\b/i, atc: ["A10BK"] },
  { pattern: /\b(GLP-?1|glutides?)\b/i, atc: ["A10BJ"] },
];
