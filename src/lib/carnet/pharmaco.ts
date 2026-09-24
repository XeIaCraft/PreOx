// Optional detail of a case — drugs given (and how) and procedures done —
// for the candidate's own records only; never part of the official carnet.
// Catalog grouped the way an anaesthetist thinks about a case (induction,
// analgesia, relaxation, regional, haemodynamics, prophylaxis…), with the
// usual route of each drug pre-selected and common Belgian brand names
// searchable. Free text is always allowed: anything not listed can be typed.

export interface DrugClass {
  code: string;
  label: string;
}

export interface DrugRoute {
  code: string;
  label: string;
  short: string;
}

export interface CatalogDrug {
  name: string;
  class: string;
  /** Route pre-selected when the drug is added (code of DRUG_ROUTES). */
  route: string;
  /** Brand names and synonyms, searched but not displayed. */
  aka?: string[];
}

export const DRUG_ROUTES: DrugRoute[] = [
  { code: "bolus_iv", label: "Bolus IV direct", short: "IVD" },
  { code: "pse", label: "Pousse-seringue (PSE)", short: "PSE" },
  { code: "aivoc", label: "AIVOC / TCI", short: "AIVOC" },
  { code: "perfusion", label: "Perfusion", short: "Perf." },
  { code: "inhale", label: "Inhalé", short: "Inhalé" },
  { code: "perinerveux", label: "Périnerveux", short: "Périnerv." },
  { code: "intrathecal", label: "Intrathécal", short: "IT" },
  { code: "peridural", label: "Péridural", short: "Péri." },
  { code: "infiltration", label: "Infiltration / local", short: "Infiltr." },
  { code: "iv_regional", label: "IV régionale (Bier)", short: "ALRIV" },
  { code: "sc", label: "Sous-cutané", short: "SC" },
  { code: "im", label: "Intramusculaire", short: "IM" },
  { code: "po", label: "Per os", short: "PO" },
  { code: "intranasal", label: "Intranasal", short: "IN" },
  { code: "rectal", label: "Intrarectal", short: "IR" },
  { code: "aerosol", label: "Aérosol / nébulisation", short: "Aérosol" },
];

export const DRUG_CLASSES: DrugClass[] = [
  { code: "hypnotique", label: "Hypnotiques" },
  { code: "halogene", label: "Halogénés / gaz" },
  { code: "morphinique", label: "Morphiniques" },
  { code: "curare", label: "Curares" },
  { code: "antagoniste", label: "Antagonistes / reversal" },
  { code: "antalgique", label: "Antalgiques & co-analgésiques" },
  { code: "anesthesique_local", label: "Anesthésiques locaux" },
  { code: "adjuvant_alr", label: "Adjuvants ALR / neuraxiaux" },
  { code: "vasopresseur", label: "Vasopresseurs & inotropes" },
  { code: "antihypertenseur", label: "Antihypertenseurs & antiarythmiques" },
  { code: "antibiotique", label: "Antibiotiques" },
  { code: "antiemetique", label: "Antiémétiques" },
  { code: "hemostase", label: "Hémostase & transfusion" },
  { code: "uterotonique", label: "Utérotoniques & tocolytiques" },
  { code: "autre", label: "Autres" },
];

const d = (name: string, klass: string, route: string, aka?: string[]): CatalogDrug => ({ name, class: klass, route, aka });

export const DRUG_CATALOG: CatalogDrug[] = [
  // Hypnotiques
  d("Propofol", "hypnotique", "bolus_iv", ["Diprivan"]),
  d("Étomidate", "hypnotique", "bolus_iv", ["Hypnomidate", "Etomidate-Lipuro"]),
  d("Kétamine", "hypnotique", "bolus_iv", ["Ketalar"]),
  d("Eskétamine", "hypnotique", "bolus_iv", ["Esketamine", "Ketanest"]),
  d("Thiopental", "hypnotique", "bolus_iv", ["Pentothal", "Nesdonal"]),
  d("Midazolam", "hypnotique", "bolus_iv", ["Dormicum"]),
  d("Rémimazolam", "hypnotique", "bolus_iv", ["Byfavo"]),
  d("Dexmédétomidine", "hypnotique", "pse", ["Dexdor"]),
  // Halogénés / gaz
  d("Sévoflurane", "halogene", "inhale", ["Sevorane"]),
  d("Desflurane", "halogene", "inhale", ["Suprane"]),
  d("Isoflurane", "halogene", "inhale", ["Forane"]),
  d("Protoxyde d'azote (N₂O)", "halogene", "inhale", ["MEOPA", "Kalinox", "Entonox"]),
  // Morphiniques
  d("Sufentanil", "morphinique", "bolus_iv", ["Sufenta"]),
  d("Rémifentanil", "morphinique", "aivoc", ["Ultiva"]),
  d("Fentanyl", "morphinique", "bolus_iv"),
  d("Alfentanil", "morphinique", "bolus_iv", ["Rapifen"]),
  d("Morphine", "morphinique", "bolus_iv"),
  d("Piritramide", "morphinique", "bolus_iv", ["Dipidolor"]),
  d("Oxycodone", "morphinique", "po", ["Oxycontin", "Oxynorm"]),
  d("Hydromorphone", "morphinique", "bolus_iv", ["Palladone"]),
  d("Méthadone", "morphinique", "bolus_iv"),
  d("Tramadol", "morphinique", "perfusion", ["Contramal", "Tradonal"]),
  d("Tapentadol", "morphinique", "po", ["Palexia"]),
  // Curares
  d("Rocuronium", "curare", "bolus_iv", ["Esmeron"]),
  d("Cisatracurium", "curare", "bolus_iv", ["Nimbex"]),
  d("Atracurium", "curare", "bolus_iv", ["Tracrium"]),
  d("Succinylcholine", "curare", "bolus_iv", ["Suxaméthonium", "Célocurine", "Lysthenon"]),
  d("Mivacurium", "curare", "bolus_iv", ["Mivacron"]),
  d("Vécuronium", "curare", "bolus_iv", ["Norcuron"]),
  // Antagonistes / reversal
  d("Sugammadex", "antagoniste", "bolus_iv", ["Bridion"]),
  d("Néostigmine", "antagoniste", "bolus_iv", ["Prostigmine"]),
  d("Glycopyrrolate", "antagoniste", "bolus_iv", ["Robinul"]),
  d("Naloxone", "antagoniste", "bolus_iv", ["Narcan"]),
  d("Flumazénil", "antagoniste", "bolus_iv", ["Anexate"]),
  d("Dantrolène", "antagoniste", "bolus_iv", ["Dantrium"]),
  d("Intralipid 20 %", "antagoniste", "bolus_iv", ["Émulsion lipidique"]),
  // Antalgiques & co-analgésiques
  d("Paracétamol", "antalgique", "perfusion", ["Perfusalgan", "Dafalgan"]),
  d("Métamizole", "antalgique", "perfusion", ["Novalgine", "Dipyrone"]),
  d("Kétorolac", "antalgique", "bolus_iv", ["Taradyl"]),
  d("Diclofénac", "antalgique", "perfusion", ["Voltaren"]),
  d("Ibuprofène", "antalgique", "po", ["Brufen", "Nurofen"]),
  d("Parécoxib", "antalgique", "bolus_iv", ["Dynastat"]),
  d("Néfopam", "antalgique", "perfusion", ["Acupan"]),
  d("Lidocaïne IV", "antalgique", "pse"),
  d("Magnésium sulfate", "antalgique", "perfusion"),
  d("Kétamine (analgésie)", "antalgique", "pse"),
  d("Clonidine", "antalgique", "bolus_iv", ["Catapressan"]),
  d("Dexaméthasone", "antalgique", "bolus_iv", ["Aacidexam", "Decadron"]),
  d("Gabapentine", "antalgique", "po", ["Neurontin"]),
  d("Prégabaline", "antalgique", "po", ["Lyrica"]),
  // Anesthésiques locaux
  d("Lidocaïne", "anesthesique_local", "infiltration", ["Xylocaïne", "Linisol"]),
  d("Lidocaïne adrénalinée", "anesthesique_local", "infiltration"),
  d("Ropivacaïne", "anesthesique_local", "perinerveux", ["Naropin"]),
  d("Bupivacaïne", "anesthesique_local", "perinerveux", ["Marcaine"]),
  d("Bupivacaïne hyperbare", "anesthesique_local", "intrathecal", ["Marcaine Spinal Heavy"]),
  d("Lévobupivacaïne", "anesthesique_local", "perinerveux", ["Chirocaine"]),
  d("Prilocaïne hyperbare", "anesthesique_local", "intrathecal", ["Prilotekal"]),
  d("Chloroprocaïne", "anesthesique_local", "intrathecal", ["Ampres", "Clorotekal"]),
  d("Mépivacaïne", "anesthesique_local", "perinerveux", ["Scandicaine", "Carbocaine"]),
  d("EMLA", "anesthesique_local", "infiltration", ["Lidocaïne-prilocaïne crème"]),
  // Adjuvants ALR / neuraxiaux
  d("Sufentanil intrathécal", "adjuvant_alr", "intrathecal"),
  d("Morphine intrathécale", "adjuvant_alr", "intrathecal"),
  d("Sufentanil péridural", "adjuvant_alr", "peridural"),
  d("Clonidine périnerveuse", "adjuvant_alr", "perinerveux"),
  d("Dexaméthasone périnerveuse", "adjuvant_alr", "perinerveux"),
  d("Adrénaline (adjuvant AL)", "adjuvant_alr", "perinerveux"),
  // Vasopresseurs & inotropes
  d("Éphédrine", "vasopresseur", "bolus_iv"),
  d("Phényléphrine", "vasopresseur", "bolus_iv", ["Néosynéphrine"]),
  d("Noradrénaline", "vasopresseur", "pse", ["Norépinéphrine", "Levophed"]),
  d("Adrénaline", "vasopresseur", "bolus_iv", ["Épinéphrine"]),
  d("Vasopressine", "vasopresseur", "pse", ["Terlipressine"]),
  d("Dobutamine", "vasopresseur", "pse"),
  d("Dopamine", "vasopresseur", "pse"),
  d("Milrinone", "vasopresseur", "pse", ["Corotrope"]),
  d("Lévosimendan", "vasopresseur", "pse", ["Simdax"]),
  d("Isoprénaline", "vasopresseur", "pse", ["Isuprel"]),
  d("Atropine", "vasopresseur", "bolus_iv"),
  d("Bleu de méthylène", "vasopresseur", "bolus_iv"),
  // Antihypertenseurs & antiarythmiques
  d("Urapidil", "antihypertenseur", "bolus_iv", ["Ebrantil"]),
  d("Labétalol", "antihypertenseur", "bolus_iv", ["Trandate"]),
  d("Esmolol", "antihypertenseur", "bolus_iv", ["Brevibloc"]),
  d("Métoprolol", "antihypertenseur", "bolus_iv", ["Seloken"]),
  d("Nicardipine", "antihypertenseur", "pse", ["Loxen", "Rydene"]),
  d("Clévidipine", "antihypertenseur", "pse", ["Cleviprex"]),
  d("Nitroglycérine", "antihypertenseur", "pse", ["Trinitrine", "Nitrolingual"]),
  d("Amiodarone", "antihypertenseur", "perfusion", ["Cordarone"]),
  d("Adénosine", "antihypertenseur", "bolus_iv", ["Adenocor"]),
  d("Digoxine", "antihypertenseur", "bolus_iv", ["Lanoxin"]),
  // Antibiotiques
  d("Céfazoline", "antibiotique", "bolus_iv", ["Cefazoline", "Kefzol"]),
  d("Céfuroxime", "antibiotique", "bolus_iv", ["Zinacef"]),
  d("Amoxicilline-clavulanate", "antibiotique", "bolus_iv", ["Augmentin"]),
  d("Clindamycine", "antibiotique", "perfusion", ["Dalacin"]),
  d("Vancomycine", "antibiotique", "perfusion"),
  d("Métronidazole", "antibiotique", "perfusion", ["Flagyl"]),
  d("Gentamicine", "antibiotique", "perfusion", ["Geomycine"]),
  d("Amikacine", "antibiotique", "perfusion", ["Amukin"]),
  d("Ceftriaxone", "antibiotique", "bolus_iv", ["Rocephine"]),
  d("Pipéracilline-tazobactam", "antibiotique", "perfusion", ["Tazocin"]),
  d("Méropénem", "antibiotique", "perfusion", ["Meronem"]),
  d("Ciprofloxacine", "antibiotique", "perfusion", ["Ciproxine"]),
  d("Témocilline", "antibiotique", "perfusion", ["Negaban"]),
  // Antiémétiques
  d("Ondansétron", "antiemetique", "bolus_iv", ["Zofran"]),
  d("Granisétron", "antiemetique", "bolus_iv", ["Kytril"]),
  d("Dropéridol", "antiemetique", "bolus_iv", ["Dehydrobenzperidol", "DHBP"]),
  d("Alizapride", "antiemetique", "bolus_iv", ["Litican"]),
  d("Métoclopramide", "antiemetique", "bolus_iv", ["Primperan"]),
  d("Dexaméthasone (PONV)", "antiemetique", "bolus_iv"),
  d("Aprépitant", "antiemetique", "po", ["Emend"]),
  d("Scopolamine", "antiemetique", "sc", ["Scopoderm", "Buscopan"]),
  // Hémostase & transfusion
  d("Acide tranexamique", "hemostase", "bolus_iv", ["Exacyl", "Cyklokapron"]),
  d("Héparine", "hemostase", "bolus_iv"),
  d("Enoxaparine", "hemostase", "sc", ["Clexane", "HBPM"]),
  d("Protamine", "hemostase", "bolus_iv"),
  d("Fibrinogène", "hemostase", "perfusion", ["Haemocomplettan", "RiaSTAP"]),
  d("Complexe prothrombinique (CCP)", "hemostase", "perfusion", ["Confidex", "Octaplex", "Kcentra"]),
  d("Vitamine K", "hemostase", "perfusion", ["Konakion"]),
  d("Desmopressine", "hemostase", "perfusion", ["Minirin", "DDAVP"]),
  d("Culot globulaire (CGR)", "hemostase", "perfusion", ["Concentré érythrocytaire"]),
  d("Plasma (PFC / Octaplas)", "hemostase", "perfusion"),
  d("Plaquettes", "hemostase", "perfusion"),
  d("Albumine", "hemostase", "perfusion"),
  // Utérotoniques & tocolytiques
  d("Oxytocine", "uterotonique", "perfusion", ["Syntocinon"]),
  d("Carbétocine", "uterotonique", "bolus_iv", ["Pabal", "Duratocin"]),
  d("Méthylergométrine", "uterotonique", "im", ["Methergin"]),
  d("Sulprostone", "uterotonique", "pse", ["Nalador"]),
  d("Misoprostol", "uterotonique", "rectal", ["Cytotec"]),
  d("Atosiban", "uterotonique", "perfusion", ["Tractocile"]),
  d("Nitroglycérine (relaxation utérine)", "uterotonique", "bolus_iv"),
  // Autres
  d("Salbutamol", "autre", "aerosol", ["Ventolin"]),
  d("Ipratropium", "autre", "aerosol", ["Atrovent"]),
  d("Hydrocortisone", "autre", "bolus_iv", ["Solu-Cortef"]),
  d("Méthylprednisolone", "autre", "bolus_iv", ["Solu-Medrol"]),
  d("Furosémide", "autre", "bolus_iv", ["Lasix"]),
  d("Mannitol", "autre", "perfusion"),
  d("Sérum salé hypertonique", "autre", "perfusion"),
  d("Insuline", "autre", "pse", ["Actrapid"]),
  d("Glucose 30 %", "autre", "bolus_iv"),
  d("Calcium (chlorure / gluconate)", "autre", "bolus_iv"),
  d("Bicarbonate de sodium", "autre", "perfusion"),
  d("Potassium (KCl)", "autre", "perfusion"),
  d("Pantoprazole", "autre", "bolus_iv", ["Pantomed"]),
  d("Citrate de sodium", "autre", "po"),
  d("Lévétiracétam", "autre", "perfusion", ["Keppra"]),
  d("Clémastine", "autre", "bolus_iv", ["Tavegyl"]),
  d("Cristalloïdes (Plasmalyte / RL)", "autre", "perfusion", ["Ringer lactate", "Hartmann", "Plasma-Lyte", "NaCl 0,9 %"]),
  d("Colloïdes (gélatines)", "autre", "perfusion", ["Geloplasma", "Gelofusine"]),
];

export interface ProcedureGroup {
  code: string;
  label: string;
  items: { code: string; label: string }[];
}

/** Procedures worth tracking, grouped by moment of the anaesthetic. */
export const PROCEDURE_GROUPS: ProcedureGroup[] = [
  {
    code: "induction",
    label: "Induction",
    items: [
      { code: "induction_iv", label: "IV" },
      { code: "induction_inhalatoire", label: "Inhalatoire" },
      { code: "isr", label: "Séquence rapide (ISR)" },
      { code: "induction_aivoc", label: "AIVOC" },
    ],
  },
  {
    code: "airway",
    label: "Voies aériennes",
    items: [
      { code: "masque_facial", label: "Masque facial" },
      { code: "masque_larynge", label: "Masque laryngé" },
      { code: "iot", label: "Intubation orotrachéale" },
      { code: "int_nasotracheale", label: "Intubation nasotrachéale" },
      { code: "videolaryngoscope", label: "Vidéolaryngoscope" },
      { code: "fibro_vigile", label: "Fibroscopie vigile" },
      { code: "double_lumiere", label: "Double lumière / bloqueur" },
      { code: "oxygenation_haut_debit", label: "Oxygénation haut débit" },
      { code: "tracheotomie", label: "Trachéotomie / canule" },
    ],
  },
  {
    code: "entretien",
    label: "Entretien",
    items: [
      { code: "entretien_halogene", label: "Halogéné" },
      { code: "tiva", label: "TIVA / AIVOC" },
      { code: "sedation", label: "Sédation" },
      { code: "vs", label: "Ventilation spontanée" },
      { code: "ventilation_protectrice", label: "Ventilation protectrice" },
    ],
  },
  {
    code: "monitorage",
    label: "Monitorage & accès",
    items: [
      { code: "vvp", label: "VVP" },
      { code: "ktart", label: "Cathéter artériel" },
      { code: "kt_central", label: "Cathéter central" },
      { code: "bis", label: "BIS / profondeur" },
      { code: "tof", label: "Curamètre (TOF)" },
      { code: "debit_cardiaque", label: "Débit cardiaque" },
      { code: "nirs", label: "NIRS" },
      { code: "ett", label: "ETO / ETT" },
      { code: "sonde_gastrique", label: "Sonde gastrique" },
      { code: "sonde_urinaire", label: "Sonde urinaire" },
      { code: "rechauffement", label: "Réchauffement actif" },
    ],
  },
  {
    code: "alr",
    label: "ALR",
    items: [
      { code: "alr_echo", label: "Échoguidée" },
      { code: "alr_neurostim", label: "Neurostimulation" },
      { code: "alr_reperes", label: "Repères anatomiques" },
      { code: "alr_single_shot", label: "Injection unique" },
      { code: "alr_catheter", label: "Cathéter" },
      { code: "rachi_peri_combinee", label: "Rachi-péri combinée" },
      { code: "alr_echec", label: "Échec / conversion AG" },
    ],
  },
  {
    code: "postop",
    label: "Postopératoire",
    items: [
      { code: "pca", label: "PCA" },
      { code: "pcea", label: "PCEA" },
      { code: "kt_analgesique", label: "Cathéter analgésique" },
      { code: "infiltration_chir", label: "Infiltration chirurgicale" },
      { code: "extubation_salle", label: "Extubé en salle" },
      { code: "transfert_si", label: "Transfert SI" },
    ],
  },
];

export const PROCEDURE_LABELS: Map<string, string> = new Map(PROCEDURE_GROUPS.flatMap((g) => g.items.map((i) => [i.code, i.label] as [string, string])));

export function routeShort(code: string): string {
  return DRUG_ROUTES.find((r) => r.code === code)?.short ?? code;
}

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export interface DrugSuggestion {
  name: string;
  class: string | null;
  route: string;
  /** Times this drug was recorded in past cases. */
  uses: number;
}

/**
 * Drugs matching what's typed (name, brand or synonym, accent-insensitive),
 * the ones already used most often first — then catalog order. With an
 * empty query: the most used ones (or the start of the catalog, filtered
 * by class if one is picked). Drugs typed freely in past cases are
 * suggested too, with the route used last time.
 */
export function drugSuggestions(query: string, history: { name: string; route: string }[], opts: { klass?: string | null; exclude?: string[]; limit?: number } = {}): DrugSuggestion[] {
  const limit = opts.limit ?? 8;
  const exclude = new Set((opts.exclude ?? []).map(fold));
  const uses = new Map<string, { count: number; name: string; route: string }>();
  for (const h of history) {
    const key = fold(h.name);
    if (!key) continue;
    const entry = uses.get(key);
    if (entry) {
      entry.count++;
      entry.route = h.route;
    } else uses.set(key, { count: 1, name: h.name.trim(), route: h.route });
  }
  const q = fold(query);
  const candidates = new Map<string, DrugSuggestion>();
  for (const drug of DRUG_CATALOG) {
    if (opts.klass && drug.class !== opts.klass) continue;
    const key = fold(drug.name);
    const haystack = [drug.name, ...(drug.aka ?? [])].map(fold);
    if (q && !haystack.some((h) => h.startsWith(q) || h.includes(` ${q}`) || (q.length >= 3 && h.includes(q)))) continue;
    const used = uses.get(key);
    candidates.set(key, { name: drug.name, class: drug.class, route: used?.route ?? drug.route, uses: used?.count ?? 0 });
  }
  if (!opts.klass) {
    for (const [key, used] of uses) {
      if (candidates.has(key) || DRUG_CATALOG.some((dr) => fold(dr.name) === key)) continue;
      if (q && !(key.startsWith(q) || key.includes(` ${q}`) || (q.length >= 3 && key.includes(q)))) continue;
      candidates.set(key, { name: used.name, class: null, route: used.route, uses: used.count });
    }
  }
  const catalogIndex = new Map(DRUG_CATALOG.map((dr, i) => [fold(dr.name), i]));
  return [...candidates.entries()]
    .filter(([key]) => !exclude.has(key))
    .filter(([, s]) => q || opts.klass || s.uses > 0)
    .sort((a, b) => b[1].uses - a[1].uses || (catalogIndex.get(a[0]) ?? 1e9) - (catalogIndex.get(b[0]) ?? 1e9))
    .slice(0, limit)
    .map(([, s]) => s);
}

/** Default route of a drug typed by name (catalog match), else IV bolus. */
export function defaultRoute(name: string): string {
  const key = fold(name);
  return DRUG_CATALOG.find((dr) => fold(dr.name) === key)?.route ?? "bolus_iv";
}

export function drugClassOf(name: string): string | null {
  const key = fold(name);
  return DRUG_CATALOG.find((dr) => fold(dr.name) === key)?.class ?? null;
}
