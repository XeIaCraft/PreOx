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
  /**
   * Other ATC codes it counts as, so rules and implications on them apply:
   * each substance of a fixed combination (Janumet → metformin), or the
   * class it acts like (tirzépatide → GLP-1 agonists).
   */
  components?: string[];
  /** From the CBIP export: chapter code, and the CBIP page (amppid) of each brand. */
  cbip?: { chapter: string; pages: Record<string, number> };
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
  { prefix: "A10BB", label: "Sulfamides hypoglycémiants" },
  { prefix: "A10BF", label: "Inhibiteurs des alpha-glucosidases (acarbose)" },
  { prefix: "A08A", label: "Anorexigènes (coupe-faim)" },
  { prefix: "C10AA", label: "Statines" },
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
  { prefix: "A10BD", label: "Associations d'antidiabétiques oraux" },
  { prefix: "B03", label: "Antianémiques (fer, érythropoïétine)" },
  { prefix: "C08D", label: "Inhibiteurs calciques bradycardisants (vérapamil, diltiazem)" },
  { prefix: "G04BE", label: "Inhibiteurs de la phosphodiestérase 5" },
  { prefix: "N06AG", label: "IMAO-A (moclobémide)" },
  { prefix: "N04BD", label: "IMAO-B (antiparkinsoniens)" },
  { prefix: "N07AA", label: "Anticholinestérasiques (myasthénie)" },
  { prefix: "N07BB", label: "Traitements de la dépendance à l'alcool" },
  { prefix: "N06BA", label: "Psychostimulants" },
  { prefix: "L04AB", label: "Anti-TNF" },
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
  { atc: "B01AC06", name: "Acide acétylsalicylique", brands: ["Asaflow", "Cardioaspirine", "Aspirine", "Kardegic", "Aspégic", "Acétylsalicylate de lysine"] },
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
  { atc: "C09DX04", name: "Sacubitril + valsartan", brands: ["Entresto"], components: ["C09CA03"] },
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
  { atc: "A10BD07", name: "Sitagliptine + metformine", brands: ["Janumet"], components: ["A10BH01", "A10BA02"] },
  // Dual GIP / GLP-1 agonist: counts as a GLP-1 agonist (gastric emptying).
  { atc: "A10BX16", name: "Tirzépatide", brands: ["Mounjaro"], components: ["A10BJ"] },
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
  // --- Added: antithrombotiques -----------------------------------------------------
  { atc: "B01AB01", name: "Héparine non fractionnée", brands: ["Héparine", "Calciparine"] },
  { atc: "B01AC07", name: "Dipyridamole", brands: ["Persantine"] },
  { atc: "B01AC30", name: "Dipyridamole + acide acétylsalicylique", brands: ["Aggrenox"], components: ["B01AC07", "B01AC06"] },
  { atc: "B01AC23", name: "Cilostazol", brands: ["Pletal"] },
  // --- Cardiovasculaire ----------------------------------------------------------------
  { atc: "C09AA01", name: "Captopril", brands: ["Capoten"] },
  { atc: "C09AA06", name: "Quinapril", brands: ["Accupril"] },
  { atc: "C09AA10", name: "Trandolapril", brands: ["Gopten"] },
  { atc: "C09CA08", name: "Olmésartan", brands: ["Belsar", "Olmetec"] },
  { atc: "C09BA04", name: "Périndopril + indapamide", brands: ["Coversyl Plus", "Preterax"], components: ["C09AA04", "C03BA11"] },
  { atc: "C09BB04", name: "Périndopril + amlodipine", brands: ["Coveram"], components: ["C09AA04", "C08CA01"] },
  { atc: "C09DA01", name: "Losartan + hydrochlorothiazide", brands: ["Cozaar Plus", "Loortan Plus"], components: ["C09CA01", "C03AA03"] },
  { atc: "C09DA03", name: "Valsartan + hydrochlorothiazide", brands: ["Co-Diovane"], components: ["C09CA03", "C03AA03"] },
  { atc: "C09DA07", name: "Telmisartan + hydrochlorothiazide", brands: ["MicardisPlus"], components: ["C09CA07", "C03AA03"] },
  { atc: "C09DB01", name: "Amlodipine + valsartan", brands: ["Exforge"], components: ["C08CA01", "C09CA03"] },
  { atc: "C08CA05", name: "Nifédipine", brands: ["Adalat"] },
  { atc: "C08CA02", name: "Félodipine", brands: ["Plendil"] },
  { atc: "C08DA01", name: "Vérapamil", brands: ["Isoptine", "Lodixal"] },
  { atc: "C08DB01", name: "Diltiazem", brands: ["Tildiem"] },
  { atc: "C07AA05", name: "Propranolol", brands: ["Inderal"] },
  { atc: "C07AB08", name: "Céliprolol", brands: ["Selectol"] },
  { atc: "C03CA04", name: "Torasémide", brands: ["Torrem"] },
  { atc: "C03BA04", name: "Chlortalidone", brands: ["Hygroton"] },
  { atc: "C02CA04", name: "Doxazosine", brands: ["Cardura"] },
  { atc: "C02AB01", name: "Méthyldopa", brands: ["Aldomet"] },
  { atc: "C01BC03", name: "Propafénone", brands: ["Rytmonorm"] },
  { atc: "C01DA02", name: "Nitroglycérine", brands: ["Nitrolingual", "Nitroderm", "Trinipatch"] },
  { atc: "C01DA08", name: "Isosorbide dinitrate", brands: ["Cedocard"] },
  { atc: "C01DX12", name: "Molsidomine", brands: ["Corvaton"] },
  { atc: "C01EB18", name: "Ranolazine", brands: ["Ranexa"] },
  { atc: "C10AA03", name: "Pravastatine", brands: ["Pravasine"] },
  { atc: "C10AB05", name: "Fénofibrate", brands: ["Lipanthyl"] },
  { atc: "C10AX13", name: "Évolocumab", brands: ["Repatha"] },
  { atc: "C10AX14", name: "Alirocumab", brands: ["Praluent"] },
  { atc: "C10BA02", name: "Simvastatine + ézétimibe", brands: ["Inegy"], components: ["C10AA01", "C10AX09"] },
  { atc: "C10BA05", name: "Atorvastatine + ézétimibe", brands: ["Atozet"], components: ["C10AA05", "C10AX09"] },
  // --- Diabète ---------------------------------------------------------------------------
  { atc: "A10AB01", name: "Insuline humaine rapide", brands: ["Actrapid", "Humuline Regular"] },
  { atc: "A10AB06", name: "Insuline glulisine", brands: ["Apidra"] },
  { atc: "A10AD04", name: "Insuline lispro biphasique", brands: ["Humalog Mix"] },
  { atc: "A10AD05", name: "Insuline asparte biphasique", brands: ["NovoMix"] },
  { atc: "A10AE54", name: "Insuline glargine + lixisénatide", brands: ["Suliqua"], components: ["A10AE04", "A10BJ03"] },
  { atc: "A10AE56", name: "Insuline dégludec + liraglutide", brands: ["Xultophy"], components: ["A10AE06", "A10BJ02"] },
  { atc: "A10BB01", name: "Glibenclamide", brands: ["Daonil"] },
  { atc: "A10BF01", name: "Acarbose", brands: ["Glucobay"] },
  { atc: "A10BG03", name: "Pioglitazone", brands: ["Actos"] },
  { atc: "A10BH02", name: "Vildagliptine", brands: ["Galvus"] },
  { atc: "A10BH05", name: "Linagliptine", brands: ["Trajenta"] },
  { atc: "A10BD08", name: "Vildagliptine + metformine", brands: ["Eucreas"], components: ["A10BH02", "A10BA02"] },
  { atc: "A10BD15", name: "Dapagliflozine + metformine", brands: ["Xigduo"], components: ["A10BK01", "A10BA02"] },
  { atc: "A10BD19", name: "Linagliptine + empagliflozine", brands: ["Glyxambi"], components: ["A10BH05", "A10BK03"] },
  { atc: "A10BD20", name: "Empagliflozine + metformine", brands: ["Synjardy"], components: ["A10BK03", "A10BA02"] },
  { atc: "A10BJ01", name: "Exénatide", brands: ["Byetta", "Bydureon"] },
  // --- Endocrinologie, hormones ----------------------------------------------------------
  { atc: "H02AB02", name: "Dexaméthasone" },
  { atc: "H02AA02", name: "Fludrocortisone" },
  { atc: "H01BA02", name: "Desmopressine", brands: ["Minirin"] },
  { atc: "H03BA02", name: "Propylthiouracile" },
  { atc: "G03AC09", name: "Désogestrel (pilule progestative)", brands: ["Cerazette"] },
  { atc: "G03CA03", name: "Estradiol", brands: ["Estrogel", "Oestrogel", "Progynova"] },
  { atc: "G03XC01", name: "Raloxifène", brands: ["Evista"] },
  { atc: "L02BG03", name: "Anastrozole", brands: ["Arimidex"] },
  { atc: "L02BG04", name: "Létrozole", brands: ["Femara"] },
  { atc: "M05BX04", name: "Dénosumab", brands: ["Prolia", "Xgeva"] },
  // --- Sang ------------------------------------------------------------------------------
  { atc: "B03AA07", name: "Fer oral (sulfate ferreux)", brands: ["Fero-Grad", "Ferogradumet"] },
  { atc: "B03AC", name: "Fer injectable", brands: ["Injectafer", "Venofer", "Monofer"] },
  { atc: "B03XA01", name: "Érythropoïétine", brands: ["Eprex", "Aranesp", "Binocrit"] },
  // --- Système nerveux ------------------------------------------------------------------
  { atc: "N06AA04", name: "Clomipramine", brands: ["Anafranil"] },
  { atc: "N06AA10", name: "Nortriptyline", brands: ["Nortrilen"] },
  { atc: "N06AG02", name: "Moclobémide", brands: ["Aurorix"] },
  { atc: "N06AX12", name: "Bupropion", brands: ["Wellbutrin", "Zyban"] },
  { atc: "N06AX22", name: "Agomélatine", brands: ["Valdoxan"] },
  { atc: "N06AX26", name: "Vortioxétine", brands: ["Brintellix"] },
  { atc: "N06AX25", name: "Millepertuis", brands: ["Hyperiplant", "millepertuis"] },
  { atc: "N05AH02", name: "Clozapine", brands: ["Leponex"] },
  { atc: "N05AX12", name: "Aripiprazole", brands: ["Abilify"] },
  { atc: "N05AX13", name: "Palipéridone", brands: ["Xeplion", "Invega"] },
  { atc: "N05AA02", name: "Lévomépromazine", brands: ["Nozinan"] },
  { atc: "N05AL01", name: "Sulpiride", brands: ["Dogmatil"] },
  { atc: "N05BA04", name: "Oxazépam", brands: ["Seresta"] },
  { atc: "N05BA09", name: "Clobazam", brands: ["Frisium"] },
  { atc: "N05BB01", name: "Hydroxyzine", brands: ["Atarax"] },
  { atc: "N05CF01", name: "Zopiclone", brands: ["Imovane"] },
  { atc: "N05CH01", name: "Mélatonine", brands: ["Circadin"] },
  { atc: "N03AE01", name: "Clonazépam", brands: ["Rivotril"] },
  { atc: "N03AB02", name: "Phénytoïne", brands: ["Diphantoïne"] },
  { atc: "N03AF02", name: "Oxcarbazépine", brands: ["Trileptal"] },
  { atc: "N03AX18", name: "Lacosamide", brands: ["Vimpat"] },
  { atc: "N03AX23", name: "Brivaracétam", brands: ["Briviact"] },
  { atc: "N03AA02", name: "Phénobarbital", brands: ["Gardénal"] },
  { atc: "N04BC04", name: "Ropinirole", brands: ["Requip"] },
  { atc: "N04BC09", name: "Rotigotine (patch)", brands: ["Neupro"] },
  { atc: "N04BA03", name: "Lévodopa + carbidopa + entacapone", brands: ["Stalevo"] },
  { atc: "N04BX02", name: "Entacapone", brands: ["Comtan"] },
  { atc: "N04BB01", name: "Amantadine", brands: ["Amantan"] },
  { atc: "N04BD03", name: "Safinamide", brands: ["Xadago"] },
  { atc: "N06DA04", name: "Galantamine", brands: ["Reminyl"] },
  { atc: "N06DX01", name: "Mémantine", brands: ["Ebixa"] },
  { atc: "N07AA02", name: "Pyridostigmine", brands: ["Mestinon"] },
  { atc: "N07BB01", name: "Disulfirame", brands: ["Antabuse"] },
  { atc: "N07BB03", name: "Acamprosate", brands: ["Campral"] },
  { atc: "N07BB04", name: "Naltrexone", brands: ["Nalorex"] },
  { atc: "N07BB05", name: "Nalméfène", brands: ["Selincro"] },
  { atc: "A08AA62", name: "Naltrexone + bupropion", brands: ["Mysimba"], components: ["N07BB04", "N06AX12"] },
  { atc: "N07BA01", name: "Nicotine (substitution)", brands: ["Nicorette", "Nicotinell"] },
  { atc: "N06BA09", name: "Atomoxétine", brands: ["Strattera"] },
  { atc: "N06BA12", name: "Lisdexamfétamine", brands: ["Elvanse"] },
  { atc: "N02CC01", name: "Sumatriptan", brands: ["Imitrex"] },
  // --- Antalgiques ----------------------------------------------------------------------
  { atc: "N02AJ13", name: "Tramadol + paracétamol", brands: ["Zaldiar"], components: ["N02AX02", "N02BE01"] },
  { atc: "N02AJ06", name: "Codéine + paracétamol", brands: ["Dafalgan Codéine"], components: ["N02BE01"] },
  { atc: "N02AA03", name: "Hydromorphone", brands: ["Palladone"] },
  { atc: "M01AC06", name: "Méloxicam", brands: ["Mobic"] },
  { atc: "M01AH05", name: "Étoricoxib", brands: ["Arcoxia"] },
  // --- Respiratoire -----------------------------------------------------------------------
  { atc: "R03BA02", name: "Budésonide inhalé", brands: ["Pulmicort"] },
  { atc: "R03BA05", name: "Fluticasone inhalée", brands: ["Flixotide"] },
  { atc: "R03BB01", name: "Ipratropium", brands: ["Atrovent"] },
  { atc: "R03AK10", name: "Fluticasone furoate + vilantérol", brands: ["Relvar"] },
  { atc: "R03AL03", name: "Uméclidinium + vilantérol", brands: ["Anoro"] },
  { atc: "R03AL06", name: "Tiotropium + olodatérol", brands: ["Spiolto"] },
  { atc: "R03AL08", name: "Fluticasone + uméclidinium + vilantérol", brands: ["Trelegy"] },
  { atc: "R03DA04", name: "Théophylline", brands: ["Theolair"] },
  { atc: "R03DX05", name: "Omalizumab", brands: ["Xolair"] },
  { atc: "R03DX09", name: "Mépolizumab", brands: ["Nucala"] },
  // --- Digestif ---------------------------------------------------------------------------
  { atc: "A03FA01", name: "Métoclopramide", brands: ["Primperan"] },
  { atc: "A03FA03", name: "Dompéridone", brands: ["Motilium"] },
  { atc: "A07EC01", name: "Sulfasalazine", brands: ["Salazopyrine"] },
  { atc: "A07EC02", name: "Mésalazine", brands: ["Pentasa", "Asacol"] },
  { atc: "A05AA02", name: "Acide ursodésoxycholique", brands: ["Ursochol"] },
  { atc: "A06AD65", name: "Macrogol", brands: ["Movicol", "Forlax"] },
  // --- Urologie ---------------------------------------------------------------------------
  { atc: "G04CA01", name: "Alfuzosine", brands: ["Xatral"] },
  { atc: "G04CA04", name: "Silodosine", brands: ["Urorec"] },
  { atc: "G04CB02", name: "Dutastéride", brands: ["Avodart"] },
  { atc: "G04BD08", name: "Solifénacine", brands: ["Vesicare"] },
  { atc: "G04BD12", name: "Mirabégron", brands: ["Betmiga"] },
  { atc: "G04BE03", name: "Sildénafil", brands: ["Viagra", "Revatio"] },
  { atc: "G04BE08", name: "Tadalafil", brands: ["Cialis"] },
  // --- Immunologie, rhumatologie, divers ---------------------------------------------------
  { atc: "L04AB01", name: "Étanercept", brands: ["Enbrel"] },
  { atc: "L04AB02", name: "Infliximab", brands: ["Remicade", "Inflectra"] },
  { atc: "L04AC07", name: "Tocilizumab", brands: ["RoActemra"] },
  { atc: "L04AX01", name: "Azathioprine", brands: ["Imuran"] },
  { atc: "L04AX04", name: "Lénalidomide", brands: ["Revlimid"] },
  { atc: "J05AR20", name: "Bictégravir + emtricitabine + ténofovir alafénamide", brands: ["Biktarvy"] },
  { atc: "M04AA03", name: "Fébuxostat", brands: ["Adenuric"] },
  { atc: "S01ED01", name: "Timolol (collyre)", brands: ["Timoptol"] },
  { atc: "S01EC01", name: "Acétazolamide", brands: ["Diamox"] },
  { atc: "N06DX02", name: "Ginkgo biloba", brands: ["Tanakan", "ginkgo"] },
  { atc: "A11CC05", name: "Colécalciférol (vitamine D)", brands: ["D-Cure"] },
  // --- Added (2) --------------------------------------------------------------------
  { atc: "C02AC05", name: "Moxonidine", brands: ["Moxon"] },
  { atc: "C02CA06", name: "Urapidil", brands: ["Ebrantil"] },
  { atc: "C09AA15", name: "Zofénopril", brands: ["Zopranol"] },
  { atc: "C01BD07", name: "Dronédarone", brands: ["Multaq"] },
  { atc: "C01CA17", name: "Midodrine", brands: ["Gutron"] },
  { atc: "C01DX22", name: "Vériciguat", brands: ["Verquvo"] },
  { atc: "C01EB15", name: "Trimétazidine", brands: ["Vastarel"] },
  { atc: "C10AX15", name: "Acide bempédoïque", brands: ["Nilemdo"] },
  { atc: "C10AX16", name: "Inclisiran", brands: ["Leqvio"] },
  { atc: "A10AE07", name: "Insuline icodec (hebdomadaire)", brands: ["Awiqli"] },
  { atc: "A10BX02", name: "Répaglinide", brands: ["NovoNorm"] },
  { atc: "A07EA06", name: "Budésonide oral", brands: ["Entocort", "Budenofalk"] },
  { atc: "R03DX07", name: "Roflumilast", brands: ["Daxas"] },
  { atc: "R03DX10", name: "Benralizumab", brands: ["Fasenra"] },
  { atc: "D11AH05", name: "Dupilumab", brands: ["Dupixent"] },
  { atc: "R03BB05", name: "Aclidinium", brands: ["Eklira", "Bretaris"] },
  { atc: "R03BB06", name: "Glycopyrronium inhalé", brands: ["Seebri"] },
  { atc: "R03AK08", name: "Béclométasone + formotérol", brands: ["Foster", "Inuvair"] },
  { atc: "R03AC18", name: "Indacatérol", brands: ["Onbrez"] },
  { atc: "N03AX15", name: "Zonisamide", brands: ["Zonegran"] },
  { atc: "N03AX22", name: "Pérampanel", brands: ["Fycompa"] },
  { atc: "N03AX25", name: "Cénobamate", brands: ["Ontozry"] },
  { atc: "N03AA03", name: "Primidone", brands: ["Mysoline"] },
  { atc: "M03BX01", name: "Baclofène", brands: ["Lioresal"] },
  { atc: "M03BX02", name: "Tizanidine", brands: ["Sirdalud"] },
  { atc: "M03CA01", name: "Dantrolène", brands: ["Dantrium"] },
  { atc: "N07XX02", name: "Riluzole", brands: ["Rilutek"] },
  { atc: "N07XX07", name: "Fampridine", brands: ["Fampyra"] },
  { atc: "N02CD01", name: "Érénumab", brands: ["Aimovig"] },
  { atc: "N06AX27", name: "Eskétamine", brands: ["Spravato"] },
  { atc: "N06AX14", name: "Tianeptine", brands: ["Stablon"] },
  { atc: "N05BA11", name: "Prazépam", brands: ["Lysanxia"] },
  { atc: "N05AH06", name: "Clotiapine", brands: ["Etumine"] },
  { atc: "N05AD05", name: "Pipampérone", brands: ["Dipiperon"] },
  { atc: "N05AX15", name: "Cariprazine", brands: ["Reagila"] },
  { atc: "N02AX01", name: "Tilidine", brands: ["Valtran"] },
  { atc: "M01AE03", name: "Kétoprofène", brands: ["Rofenid"] },
  { atc: "M01AC01", name: "Piroxicam", brands: ["Feldene"] },
  { atc: "A07DA03", name: "Lopéramide", brands: ["Imodium"] },
  { atc: "L04AC05", name: "Ustékinumab", brands: ["Stelara"] },
  { atc: "L04AC10", name: "Sécukinumab", brands: ["Cosentyx"] },
  { atc: "G04BD04", name: "Oxybutynine", brands: ["Ditropan"] },
  { atc: "M05BX06", name: "Romosozumab", brands: ["Evenity"] },
  { atc: "M05BA07", name: "Risédronate", brands: ["Actonel"] },
  { atc: "M05BA08", name: "Acide zolédronique", brands: ["Aclasta", "Zometa"] },
  { atc: "G03BA03", name: "Testostérone", brands: ["Androgel", "Sustanon", "Nebido"] },
  { atc: "G03DA04", name: "Progestérone", brands: ["Utrogestan"] },
  { atc: "G03DB08", name: "Diénogest", brands: ["Visanne"] },
  { atc: "G03HA01", name: "Cyprotérone", brands: ["Androcur"] },
  { atc: "L02AE02", name: "Leuproréline", brands: ["Eligard", "Lucrin"] },
  { atc: "L02BB03", name: "Bicalutamide", brands: ["Casodex"] },
  { atc: "L02BB04", name: "Enzalutamide", brands: ["Xtandi"] },
  { atc: "L02BX03", name: "Abiratérone", brands: ["Zytiga"] },
  { atc: "L01BC06", name: "Capécitabine", brands: ["Xeloda"] },
  { atc: "L01EA01", name: "Imatinib", brands: ["Glivec"] },
  { atc: "L01EL01", name: "Ibrutinib", brands: ["Imbruvica"] },
  { atc: "L01EF01", name: "Palbociclib", brands: ["Ibrance"] },
  { atc: "L01XK01", name: "Olaparib", brands: ["Lynparza"] },
  { atc: "L01FG01", name: "Bévacizumab", brands: ["Avastin"] },
  { atc: "L01FF02", name: "Pembrolizumab", brands: ["Keytruda"] },
  { atc: "L01FF01", name: "Nivolumab", brands: ["Opdivo"] },
  { atc: "J05AJ03", name: "Dolutégravir", brands: ["Tivicay", "Triumeq", "Dovato"] },
  { atc: "J05AF10", name: "Entécavir", brands: ["Baraclude"] },
  { atc: "J04AB02", name: "Rifampicine", brands: ["Rifadine"] },
  { atc: "J01EE01", name: "Cotrimoxazole", brands: ["Bactrim", "Eusaprim"] },
  { atc: "L01XX05", name: "Hydroxycarbamide", brands: ["Hydrea"] },
  { atc: "L01XX35", name: "Anagrélide", brands: ["Xagrid"] },
  { atc: "B02BX05", name: "Eltrombopag", brands: ["Revolade"] },
  { atc: "B02BX06", name: "Émicizumab", brands: ["Hemlibra"] },
  { atc: "B02AA02", name: "Acide tranexamique", brands: ["Exacyl"] },
  { atc: "B03BB01", name: "Acide folique", brands: ["Folavit"] },
  { atc: "B03BA01", name: "Vitamine B12", brands: ["cyanocobalamine"] },
  { atc: "A12BA01", name: "Chlorure de potassium", brands: ["Kaleorid", "Steropotassium"] },
  { atc: "R06AE07", name: "Cétirizine", brands: ["Zyrtec"] },
  { atc: "R06AX27", name: "Desloratadine", brands: ["Aerius"] },
  { atc: "S01EE01", name: "Latanoprost (collyre)", brands: ["Xalatan"] },
];

/** Does an ATC code belong to a code or group (prefix)? */
export function atcMatches(code: string, target: string): boolean {
  return code.toUpperCase().startsWith(target.toUpperCase());
}

/**
 * Does a patient's treatment belong to a code or group — itself, or one of
 * the substances of a fixed combination (Janumet → metformin too)?
 */
export function treatmentMatches(t: { atc: string; components?: string[] }, target: string): boolean {
  if (!t.atc && !t.components?.length) return false;
  if (t.atc && atcMatches(t.atc, target)) return true;
  const parts = t.components ?? MEDICATIONS.find((m) => m.atc === t.atc && m.components)?.components ?? [];
  return parts.some((a) => atcMatches(a, target));
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

/**
 * Search for a substance on the CBIP site (monograph, specialties and their
 * RCP/SmPC). The address pattern could not be checked from PreOx's build
 * environment: if it changes, update it here.
 */
export function cbipSearchUrl(name: string): string {
  return `https://www.cbip.be/fr/search?q=${encodeURIComponent(name)}`;
}
