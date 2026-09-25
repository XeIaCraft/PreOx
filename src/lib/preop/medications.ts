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
  { prefix: "A10", label: "Antidiabétiques" },
  { prefix: "A10B", label: "Antidiabétiques oraux et injectables non insuliniques" },
  { prefix: "A02BC", label: "Inhibiteurs de la pompe à protons" },
  { prefix: "C01", label: "Médicaments cardiaques (antiarythmiques, digitaliques, nitrés)" },
  { prefix: "C03", label: "Diurétiques" },
  { prefix: "C08", label: "Inhibiteurs calciques" },
  { prefix: "C10", label: "Hypolipémiants" },
  { prefix: "G03", label: "Hormones sexuelles" },
  { prefix: "H03", label: "Médicaments de la thyroïde" },
  { prefix: "L04", label: "Immunosuppresseurs" },
  { prefix: "M01A", label: "Anti-inflammatoires non stéroïdiens" },
  { prefix: "N02A", label: "Opioïdes" },
  { prefix: "N05A", label: "Antipsychotiques" },
  { prefix: "N05B", label: "Anxiolytiques (benzodiazépines)" },
  { prefix: "N05C", label: "Hypnotiques" },
  { prefix: "N06A", label: "Antidépresseurs" },
  { prefix: "N06AB", label: "Inhibiteurs sélectifs de la recapture de la sérotonine" },
  { prefix: "N06DA", label: "Anticholinestérasiques (démence)" },
  { prefix: "N07BC", label: "Traitements de substitution aux opioïdes" },
  { prefix: "R03", label: "Médicaments de l'asthme et de la BPCO" },
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
  // Cardiovasculaire
  { atc: "C08CA01", name: "Amlodipine", brands: ["Amlor", "Norvasc"] },
  { atc: "C08CA13", name: "Lercanidipine", brands: ["Zanidip"] },
  { atc: "C09AA03", name: "Lisinopril", brands: ["Zestril"] },
  { atc: "C09CA07", name: "Telmisartan", brands: ["Micardis"] },
  { atc: "C09CA04", name: "Irbésartan", brands: ["Aprovel"] },
  { atc: "C09DX04", name: "Sacubitril + valsartan", brands: ["Entresto"] },
  { atc: "C03AA03", name: "Hydrochlorothiazide", brands: ["Esidrex"] },
  { atc: "C03BA11", name: "Indapamide", brands: ["Fludex"] },
  { atc: "C03CA01", name: "Furosémide", brands: ["Lasix"] },
  { atc: "C03CA02", name: "Bumétanide", brands: ["Burinex"] },
  { atc: "C03DA01", name: "Spironolactone", brands: ["Aldactone"] },
  { atc: "C03DA04", name: "Éplérénone", brands: ["Inspra"] },
  { atc: "C07AB03", name: "Aténolol", brands: ["Tenormin"] },
  { atc: "C07AB12", name: "Nébivolol", brands: ["Nobiten"] },
  { atc: "C07AG02", name: "Carvédilol", brands: ["Kredex"] },
  { atc: "C07AA07", name: "Sotalol", brands: ["Sotalex"] },
  { atc: "C02AC01", name: "Clonidine", brands: ["Catapressan"] },
  { atc: "C01BD01", name: "Amiodarone", brands: ["Cordarone"] },
  { atc: "C01BC04", name: "Flécaïnide", brands: ["Tambocor"] },
  { atc: "C01AA05", name: "Digoxine", brands: ["Lanoxin"] },
  { atc: "C01EB17", name: "Ivabradine", brands: ["Procoralan"] },
  { atc: "C01DA14", name: "Isosorbide mononitrate", brands: ["Promocard"] },
  { atc: "C01DX16", name: "Nicorandil", brands: ["Adancor"] },
  { atc: "C10AA05", name: "Atorvastatine", brands: ["Lipitor"] },
  { atc: "C10AA07", name: "Rosuvastatine", brands: ["Crestor"] },
  { atc: "C10AA01", name: "Simvastatine", brands: ["Zocor"] },
  { atc: "C10AX09", name: "Ézétimibe", brands: ["Ezetrol"] },
  // Diabète, endocrinologie
  { atc: "A10AB05", name: "Insuline asparte", brands: ["NovoRapid", "Fiasp"] },
  { atc: "A10AB04", name: "Insuline lispro", brands: ["Humalog"] },
  { atc: "A10AE05", name: "Insuline détémir", brands: ["Levemir"] },
  { atc: "A10AE06", name: "Insuline dégludec", brands: ["Tresiba"] },
  { atc: "A10AC01", name: "Insuline humaine isophane (NPH)", brands: ["Insulatard", "Humuline NPH"] },
  { atc: "A10BB09", name: "Gliclazide", brands: ["Uni Diamicron"] },
  { atc: "A10BB12", name: "Glimépiride", brands: ["Amarylle"] },
  { atc: "A10BH01", name: "Sitagliptine", brands: ["Januvia"] },
  { atc: "A10BD07", name: "Sitagliptine + metformine", brands: ["Janumet"] },
  { atc: "A10BJ06", name: "Sémaglutide oral", brands: ["Rybelsus"] },
  { atc: "A10BX16", name: "Tirzépatide", brands: ["Mounjaro"] },
  { atc: "H03AA01", name: "Lévothyroxine", brands: ["L-Thyroxine", "Euthyrox"] },
  { atc: "H03BB02", name: "Thiamazole", brands: ["Strumazol"] },
  { atc: "H02AB09", name: "Hydrocortisone", brands: ["Hydrocortone"] },
  { atc: "H02AB07", name: "Prednisone", brands: ["Deltasone"] },
  { atc: "G03AA", name: "Contraceptif œstroprogestatif", brands: ["pilule", "Yasmin", "Microgynon"] },
  { atc: "G03F", name: "Traitement hormonal de la ménopause", brands: ["THS"] },
  { atc: "L02BA01", name: "Tamoxifène", brands: ["Nolvadex"] },
  // Système nerveux
  { atc: "N06AB06", name: "Sertraline", brands: ["Serlain"] },
  { atc: "N06AB10", name: "Escitalopram", brands: ["Sipralexa"] },
  { atc: "N06AB04", name: "Citalopram", brands: ["Cipramil"] },
  { atc: "N06AB03", name: "Fluoxétine", brands: ["Prozac"] },
  { atc: "N06AB05", name: "Paroxétine", brands: ["Seroxat"] },
  { atc: "N06AX16", name: "Venlafaxine", brands: ["Efexor"] },
  { atc: "N06AX21", name: "Duloxétine", brands: ["Cymbalta"] },
  { atc: "N06AX11", name: "Mirtazapine", brands: ["Remergon"] },
  { atc: "N06AX05", name: "Trazodone", brands: ["Trazolan"] },
  { atc: "N06AA09", name: "Amitriptyline", brands: ["Redomex"] },
  { atc: "N05AN01", name: "Lithium", brands: ["Camcolit", "Maniprex"] },
  { atc: "N05AH04", name: "Quétiapine", brands: ["Seroquel"] },
  { atc: "N05AH03", name: "Olanzapine", brands: ["Zyprexa"] },
  { atc: "N05AX08", name: "Rispéridone", brands: ["Risperdal"] },
  { atc: "N05AD01", name: "Halopéridol", brands: ["Haldol"] },
  { atc: "N05BA12", name: "Alprazolam", brands: ["Xanax"] },
  { atc: "N05BA06", name: "Lorazépam", brands: ["Temesta"] },
  { atc: "N05BA01", name: "Diazépam", brands: ["Valium"] },
  { atc: "N05BA08", name: "Bromazépam", brands: ["Lexotan"] },
  { atc: "N05CD06", name: "Lormétazépam", brands: ["Loramet", "Metatop"] },
  { atc: "N05CF02", name: "Zolpidem", brands: ["Stilnoct"] },
  { atc: "N03AX16", name: "Prégabaline", brands: ["Lyrica"] },
  { atc: "N03AX12", name: "Gabapentine", brands: ["Neurontin"] },
  { atc: "N03AX09", name: "Lamotrigine", brands: ["Lamictal"] },
  { atc: "N03AF01", name: "Carbamazépine", brands: ["Tegretol"] },
  { atc: "N03AX11", name: "Topiramate", brands: ["Topamax"] },
  { atc: "N04BC05", name: "Pramipexole", brands: ["Mirapexin"] },
  { atc: "N04BD02", name: "Rasagiline", brands: ["Azilect"] },
  { atc: "N04BD01", name: "Sélégiline", brands: ["Eldepryl"] },
  { atc: "N06DA02", name: "Donépézil", brands: ["Aricept"] },
  { atc: "N06DA03", name: "Rivastigmine", brands: ["Exelon"] },
  { atc: "N06BA04", name: "Méthylphénidate", brands: ["Rilatine", "Concerta"] },
  { atc: "N07BC02", name: "Méthadone", brands: ["Mephenon"] },
  { atc: "N07BC01", name: "Buprénorphine (substitution)", brands: ["Subutex", "Suboxone"] },
  // Antalgiques
  { atc: "N02BE01", name: "Paracétamol", brands: ["Dafalgan", "Perdolan", "Panadol"] },
  { atc: "N02BB02", name: "Métamizole", brands: ["Novalgine"] },
  { atc: "N02AX02", name: "Tramadol", brands: ["Contramal", "Tradonal"] },
  { atc: "N02AA05", name: "Oxycodone", brands: ["Oxycontin", "Oxynorm", "Targinact"] },
  { atc: "N02AA01", name: "Morphine", brands: ["MS Contin"] },
  { atc: "N02AB03", name: "Fentanyl (patch)", brands: ["Durogesic"] },
  { atc: "N02AX06", name: "Tapentadol", brands: ["Palexia"] },
  { atc: "N02AE01", name: "Buprénorphine (antalgique)", brands: ["Transtec"] },
  { atc: "M01AE01", name: "Ibuprofène", brands: ["Nurofen", "Brufen"] },
  { atc: "M01AB05", name: "Diclofénac", brands: ["Voltaren"] },
  { atc: "M01AE02", name: "Naproxène", brands: ["Aleve", "Apranax"] },
  { atc: "M01AH01", name: "Célécoxib", brands: ["Celebrex"] },
  // Respiratoire, digestif, autres
  { atc: "R03AC02", name: "Salbutamol", brands: ["Ventolin"] },
  { atc: "R03AK07", name: "Budésonide + formotérol", brands: ["Symbicort"] },
  { atc: "R03AK06", name: "Fluticasone + salmétérol", brands: ["Seretide"] },
  { atc: "R03BB04", name: "Tiotropium", brands: ["Spiriva"] },
  { atc: "R03DC03", name: "Montélukast", brands: ["Singulair"] },
  { atc: "A02BC02", name: "Pantoprazole", brands: ["Pantomed"] },
  { atc: "A02BC01", name: "Oméprazole", brands: ["Losec"] },
  { atc: "A02BC05", name: "Ésoméprazole", brands: ["Nexiam"] },
  { atc: "M04AA01", name: "Allopurinol", brands: ["Zyloric"] },
  { atc: "M04AC01", name: "Colchicine", brands: ["Colchicine Opocalcium"] },
  { atc: "M05BA04", name: "Acide alendronique", brands: ["Fosamax"] },
  { atc: "G04CA02", name: "Tamsulosine", brands: ["Omic"] },
  { atc: "G04CB01", name: "Finastéride", brands: ["Proscar"] },
  { atc: "L04AX03", name: "Méthotrexate", brands: ["Ledertrexate", "Metoject"] },
  { atc: "L04AB04", name: "Adalimumab", brands: ["Humira"] },
  { atc: "L04AD02", name: "Tacrolimus", brands: ["Prograft", "Advagraf"] },
  { atc: "L04AD01", name: "Ciclosporine", brands: ["Neoral"] },
  { atc: "L04AA06", name: "Mycophénolate", brands: ["Cellcept"] },
  { atc: "P01BA02", name: "Hydroxychloroquine", brands: ["Plaquenil"] },
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

export function searchMedications(query: string, limit = 8, list: Medication[] = MEDICATIONS): Medication[] {
  const q = fold(query);
  if (!q) return [];
  return list.filter((m) => [m.name, ...(m.brands ?? [])].some((n) => fold(n).startsWith(q) || fold(n).includes(` ${q}`) || (q.length >= 3 && fold(n).includes(q)))).slice(0, limit);
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
