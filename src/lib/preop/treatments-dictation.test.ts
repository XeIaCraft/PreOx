// Treatments as they are dictated at the consultation (Belgian brands,
// INN, abbreviations) are recognised and fall into the right class.
import { expect, it } from "vitest";
import { parseQuickEntry } from "./quick-entry";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import { classesOf } from "./catalog";
const Q: [string, string][] = [
  // Antithrombotiques
  ["Eliquis 5 mg 2x/j", "xabans"], ["apixaban", "xabans"], ["Xarelto 20", "xabans"], ["rivaroxaban", "xabans"], ["Lixiana 60", "xabans"], ["edoxaban", "xabans"], ["Pradaxa 150", "thrombin_inhibitors"], ["dabigatran", "thrombin_inhibitors"],
  ["Marcoumar", "vka"], ["Sintrom", "vka"], ["Marevan", "vka"], ["warfarine", "vka"], ["acénocoumarol", "vka"],
  ["Asaflow 80", "antiplatelets"], ["Cardioaspirine", "antiplatelets"], ["aspirine 100 mg", "antiplatelets"], ["Plavix", "antiplatelets"], ["clopidogrel", "antiplatelets"], ["Brilique", "antiplatelets"], ["ticagrélor", "antiplatelets"], ["Efient", "antiplatelets"], ["prasugrel", "antiplatelets"],
  ["Clexane 40", "heparins"], ["enoxaparine", "heparins"], ["Fraxiparine", "heparins"], ["Fragmin", "heparins"], ["Innohep", "heparins"], ["Arixtra", "fondaparinux"],
  // Cardiovasculaire
  ["bisoprolol 5 mg", "betablockers"], ["Emconcor", "betablockers"], ["métoprolol", "betablockers"], ["Selozok", "betablockers"], ["nébivolol", "betablockers"], ["Nobiten", "betablockers"], ["carvédilol", "betablockers"], ["propranolol", "betablockers"], ["Inderal", "betablockers"],
  ["ramipril", "acei_arb"], ["Tritace", "acei_arb"], ["périndopril", "acei_arb"], ["Coversyl", "acei_arb"], ["lisinopril", "acei_arb"], ["Zestril", "acei_arb"], ["candésartan", "acei_arb"], ["Atacand", "acei_arb"], ["valsartan", "acei_arb"], ["losartan", "acei_arb"], ["Cozaar", "acei_arb"], ["irbésartan", "acei_arb"], ["telmisartan", "acei_arb"], ["Entresto", "acei_arb"], ["olmésartan", "acei_arb"],
  ["amlodipine", "dihydropyridines"], ["Amlor", "dihydropyridines"], ["lercanidipine", "dihydropyridines"], ["Zanidip", "dihydropyridines"], ["nifédipine", "dihydropyridines"], ["diltiazem", "rate_ccb"], ["Tildiem", "rate_ccb"], ["vérapamil", "rate_ccb"], ["Isoptine", "rate_ccb"],
  ["furosémide", "diuretics"], ["Lasix", "diuretics"], ["bumétanide", "diuretics"], ["Burinex", "diuretics"], ["hydrochlorothiazide", "diuretics"], ["indapamide", "diuretics"], ["Fludex", "diuretics"], ["chlortalidone", "diuretics"], ["spironolactone", "mra"], ["Aldactone", "mra"], ["éplérénone", "mra"],
  ["amiodarone", "amiodarone"], ["Cordarone", "amiodarone"], ["sotalol", "betablockers"], ["flécaïnide", "class1c"], ["Tambocor", "class1c"], ["propafénone", "class1c"], ["digoxine", "digoxin"], ["Lanoxin", "digoxin"], ["ivabradine", "ivabradine"], ["Procoralan", "ivabradine"], ["isosorbide mononitrate", "nitrates"], ["molsidomine", "nitrates"], ["Corvaton", "nitrates"], ["clonidine", "central_antihypertensives"], ["Catapressan", "central_antihypertensives"], ["moxonidine", "central_antihypertensives"],
  ["atorvastatine 40", "statins"], ["Lipitor", "statins"], ["rosuvastatine", "statins"], ["Crestor", "statins"], ["simvastatine", "statins"], ["Zocor", "statins"], ["pravastatine", "statins"], ["ézétimibe", "statins"], ["Ezetrol", "statins"],
  // Diabète, endocrinologie
  ["metformine 850 3x/j", "metformin"], ["Glucophage", "metformin"], ["gliclazide", "sulfonylureas"], ["Uni Diamicron", "sulfonylureas"], ["glimépiride", "sulfonylureas"], ["Amarylle", "sulfonylureas"], ["sitagliptine", "dpp4"], ["Januvia", "dpp4"], ["Janumet", "metformin"], ["linagliptine", "dpp4"], ["Trajenta", "dpp4"],
  ["empagliflozine", "sglt2"], ["Jardiance", "sglt2"], ["dapagliflozine", "sglt2"], ["Forxiga", "sglt2"], ["canagliflozine", "sglt2"], ["Synjardy", "sglt2"],
  ["Ozempic", "glp1"], ["sémaglutide", "glp1"], ["Wegovy", "glp1"], ["Rybelsus", "glp1"], ["Trulicity", "glp1"], ["dulaglutide", "glp1"], ["liraglutide", "glp1"], ["Victoza", "glp1"], ["Saxenda", "glp1"], ["Mounjaro", "glp1"], ["tirzépatide", "glp1"],
  ["Lantus", "insulin"], ["insuline glargine", "insulin"], ["Toujeo", "insulin"], ["Tresiba", "insulin"], ["Levemir", "insulin"], ["Novorapid", "insulin"], ["Humalog", "insulin"], ["Fiasp", "insulin"], ["Apidra", "insulin"], ["Novomix", "insulin"],
  ["L-Thyroxine", "thyroid_drugs"], ["lévothyroxine", "thyroid_drugs"], ["Euthyrox", "thyroid_drugs"], ["thiamazole", "antithyroid"], ["Strumazol", "antithyroid"], ["propylthiouracile", "antithyroid"],
  ["Medrol 16", "corticoids"], ["méthylprednisolone", "corticoids"], ["prednisolone", "corticoids"], ["hydrocortisone", "corticoids"], ["dexaméthasone", "corticoids"], ["Fludrocortisone", "mineralocorticoids"],
  // Système nerveux
  ["sertraline", "ssri"], ["Serlain", "ssri"], ["escitalopram", "ssri"], ["Sipralexa", "ssri"], ["citalopram", "ssri"], ["fluoxétine", "ssri"], ["Prozac", "ssri"], ["paroxétine", "ssri"], ["Seroxat", "ssri"], ["venlafaxine", "snri"], ["Efexor", "snri"], ["duloxétine", "snri"], ["Cymbalta", "snri"], ["mirtazapine", "snri"], ["Remergon", "snri"], ["trazodone", "snri"], ["Trazolan", "snri"], ["amitriptyline", "tricyclics"], ["Redomex", "tricyclics"], ["clomipramine", "tricyclics"], ["Anafranil", "tricyclics"], ["moclobémide", "maoi_a"], ["Aurorix", "maoi_a"],
  ["lithium", "lithium"], ["Camcolit", "lithium"], ["Maniprex", "lithium"], ["quétiapine", "antipsychotics"], ["Seroquel", "antipsychotics"], ["olanzapine", "antipsychotics"], ["Zyprexa", "antipsychotics"], ["rispéridone", "antipsychotics"], ["Risperdal", "antipsychotics"], ["aripiprazole", "antipsychotics"], ["Abilify", "antipsychotics"], ["halopéridol", "antipsychotics"], ["Haldol", "antipsychotics"], ["clozapine", "clozapine"], ["Leponex", "clozapine"],
  ["alprazolam", "benzodiazepines"], ["Xanax", "benzodiazepines"], ["lorazépam", "benzodiazepines"], ["Temesta", "benzodiazepines"], ["bromazépam", "benzodiazepines"], ["Lexotan", "benzodiazepines"], ["diazépam", "benzodiazepines"], ["Valium", "benzodiazepines"], ["zolpidem", "hypnotics"], ["Stilnoct", "hypnotics"], ["lormétazépam", "hypnotics"], ["Loramet", "hypnotics"], ["Métatop", "hypnotics"],
  ["lévétiracétam", "antiepileptics"], ["Keppra", "antiepileptics"], ["lamotrigine", "antiepileptics"], ["Lamictal", "antiepileptics"], ["valproate", "valproate"], ["Depakine", "valproate"], ["carbamazépine", "enzyme_inducers"], ["Tegretol", "enzyme_inducers"], ["prégabaline", "gabapentinoids"], ["Lyrica", "gabapentinoids"], ["gabapentine", "gabapentinoids"], ["Neurontin", "gabapentinoids"], ["topiramate", "antiepileptics"], ["phénytoïne", "phenytoin"],
  ["lévodopa", "antiparkinson"], ["Prolopa", "antiparkinson"], ["Sinemet", "antiparkinson"], ["pramipexole", "antiparkinson"], ["Sifrol", "antiparkinson"], ["ropinirole", "antiparkinson"], ["Requip", "antiparkinson"], ["rasagiline", "maoi_b"], ["Azilect", "maoi_b"], ["sélégiline", "maoi_b"],
  ["donépézil", "anticholinesterases"], ["Aricept", "anticholinesterases"], ["rivastigmine", "anticholinesterases"], ["Exelon", "anticholinesterases"], ["galantamine", "anticholinesterases"], ["mémantine", "memantine"], ["Ebixa", "memantine"], ["pyridostigmine", "anticholinesterases_mg"], ["Mestinon", "anticholinesterases_mg"],
  ["méthylphénidate", "stimulants"], ["Rilatine", "stimulants"], ["Concerta", "stimulants"],
  ["tramadol", "opioids"], ["Contramal", "opioids"], ["oxycodone", "opioids"], ["Oxycontin", "opioids"], ["Targinact", "opioids"], ["morphine", "opioids"], ["MS Contin", "opioids"], ["tapentadol", "opioids"], ["Palexia", "opioids"], ["fentanyl patch", "opioids"], ["Durogesic", "opioids"], ["codéine", "opioids"], ["hydromorphone", "opioids"],
  ["méthadone", "opioid_substitution"], ["buprénorphine", "opioid_substitution"], ["Subutex", "opioid_substitution"], ["Suboxone", "opioid_substitution"], ["naltrexone", "naltrexone"], ["disulfirame", "disulfiram"], ["Antabuse", "disulfiram"],
  ["paracétamol", "paracetamol"], ["Dafalgan", "paracetamol"], ["Perdolan", "paracetamol"], ["ibuprofène", "nsaids"], ["Brufen", "nsaids"], ["Nurofen", "nsaids"], ["diclofénac", "nsaids"], ["Voltaren", "nsaids"], ["naproxène", "nsaids"], ["Aleve", "nsaids"], ["célécoxib", "nsaids"], ["Celebrex", "nsaids"], ["étoricoxib", "nsaids"], ["méloxicam", "nsaids"], ["Mobic", "nsaids"],
  // Respiratoire
  ["Ventolin", "inhaled_bronchodilators"], ["salbutamol", "inhaled_bronchodilators"], ["Symbicort", "inhaled_bronchodilators"], ["Seretide", "inhaled_bronchodilators"], ["Spiriva", "inhaled_anticholinergics"], ["tiotropium", "inhaled_anticholinergics"], ["Atrovent", "inhaled_anticholinergics"], ["Incruse", "inhaled_anticholinergics"], ["Trelegy", "inhaled_bronchodilators"], ["Relvar", "inhaled_bronchodilators"], ["Foster", "inhaled_bronchodilators"], ["Anoro", "inhaled_bronchodilators"], ["Pulmicort", "inhaled_steroids"], ["montélukast", "leukotriene"], ["Singulair", "leukotriene"], ["théophylline", "theophylline"],
  // Digestif, urologie
  ["pantoprazole", "ppi"], ["Pantomed", "ppi"], ["oméprazole", "ppi"], ["ésoméprazole", "ppi"], ["Nexiam", "ppi"], ["lansoprazole", "ppi"], ["dompéridone", "antiemetics_d2"], ["Motilium", "antiemetics_d2"], ["métoclopramide", "antiemetics_d2"], ["Primperan", "antiemetics_d2"],
  ["tamsulosine", "alpha_blockers"], ["Omic", "alpha_blockers"], ["alfuzosine", "alpha_blockers"], ["Xatral", "alpha_blockers"], ["finastéride", "bph"], ["dutastéride", "bph"], ["Avodart", "bph"], ["solifénacine", "overactive_bladder"], ["Vesicare", "overactive_bladder"], ["mirabégron", "overactive_bladder"], ["sildénafil", "pde5"], ["Viagra", "pde5"], ["tadalafil", "pde5"], ["Cialis", "pde5"],
  // Immunologie, oncologie, hormones
  ["méthotrexate", "methotrexate"], ["Ledertrexate", "methotrexate"], ["adalimumab", "anti_tnf"], ["Humira", "anti_tnf"], ["infliximab", "anti_tnf"], ["Remicade", "anti_tnf"], ["étanercept", "anti_tnf"], ["Enbrel", "anti_tnf"], ["tofacitinib", "jak_inhibitors"], ["Xeljanz", "jak_inhibitors"], ["baricitinib", "jak_inhibitors"], ["Olumiant", "jak_inhibitors"], ["upadacitinib", "jak_inhibitors"], ["Rinvoq", "jak_inhibitors"], ["ustékinumab", "interleukin_inhibitors"], ["Stelara", "interleukin_inhibitors"], ["sécukinumab", "interleukin_inhibitors"], ["Cosentyx", "interleukin_inhibitors"], ["tacrolimus", "immunosuppressants"], ["Prograft", "immunosuppressants"], ["ciclosporine", "immunosuppressants"], ["mycophénolate", "immunosuppressants"], ["Cellcept", "immunosuppressants"], ["azathioprine", "immunosuppressants"], ["Imuran", "immunosuppressants"], ["hydroxychloroquine", "hydroxychloroquine"], ["Plaquenil", "hydroxychloroquine"],
  ["tamoxifène", "tamoxifen"], ["Nolvadex", "tamoxifen"], ["létrozole", "aromatase_inhibitors"], ["Femara", "aromatase_inhibitors"], ["anastrozole", "aromatase_inhibitors"], ["Arimidex", "aromatase_inhibitors"], ["exémestane", "aromatase_inhibitors"], ["raloxifène", "serms"], ["Evista", "serms"],
  ["pilule contraceptive", "contraceptives"], ["Yasmin", "contraceptives"], ["Microgynon", "contraceptives"], ["Diane 35", "antiandrogens"], ["Nuvaring", "contraceptives"], ["Progynova", "estrogens"], ["Oestrogel", "estrogens"], ["Angeliq", "hrt"], ["Livial", "hrt"], ["bosentan", "pah_drugs"], ["Opsumit", "pah_drugs"], ["Adempas", "pah_drugs"], ["Uptravi", "pah_drugs"], ["Ofev", "antifibrotics"], ["Esbriet", "antifibrotics"], ["Camzyos", "mavacamten"], ["doxazosine", "alpha1_antihypertensives"], ["nicorandil", "nitrates"], ["Revlimid", "imids"], ["doxorubicine", "anthracyclines"], ["bléomycine", "bleomycin"], ["Zoladex", "gnrh"], ["Sandostatine", "somatostatin"], ["Champix", "smoking_cessation"], ["Sativex", "cannabinoids"], ["clarithromycine", "macrolides"], ["ciprofloxacine", "fluoroquinolones"], ["fluconazole", "azoles"], ["Flagyl", "metronidazole"], ["codéine", "opioids"], ["Dafalgan Codéine", "opioids"], ["Temgesic", "opioids"], ["kétorolac", "nsaids"],
  ["alendronate", "bisphosphonates"], ["Fosamax", "bisphosphonates"], ["dénosumab", "denosumab"], ["Prolia", "denosumab"], ["allopurinol", "gout_drugs"], ["Zyloric", "gout_drugs"], ["colchicine", "gout_drugs"], ["fébuxostat", "gout_drugs"],
  ["fer oral", "iron"], ["Tardyferon", "iron"], ["Fero-Gradumet", "iron"], ["sulfate ferreux", "iron"], ["Injectafer", "iron"], ["érythropoïétine", "epo"], ["Aranesp", "epo"], ["acide folique", "folates_b12"], ["vitamine D", "vitamins"], ["D-Cure", "vitamins"],
  ["cétirizine", "antihistamines"], ["Zyrtec", "antihistamines"], ["desloratadine", "antihistamines"], ["Aerius", "antihistamines"], ["millepertuis", "st_johns_wort"], ["ginkgo", "ginkgo"], ["Tanakan", "ginkgo"],
  ["timolol collyre", "eye_betablockers"], ["latanoprost", "eye_prostaglandins"], ["Xalatan", "eye_prostaglandins"], ["acétazolamide", "carbonic_anhydrase"], ["Diamox", "carbonic_anhydrase"],
  ["Ténormine", "betablockers"], ["aténolol", "betablockers"], ["Co-Diovane", "acei_arb"], ["Exforge", "acei_arb"],
];
it("dictated treatments are recognised and classed", () => {
  const bad: string[] = [];
  for (const [q, cls] of Q) {
    const r = parseQuickEntry(`Traitement : ${q}`, DEFAULT_CATALOGS);
    const classes = r.treatments.flatMap((t) => classesOf({ atc: t.atc, catalogId: t.id, components: t.components }, DEFAULT_CATALOGS).map((k) => k.id));
    if (!classes.includes(cls)) bad.push(`${q} → ${r.treatments.map((t) => `${t.name} [${t.atc}]`).join(", ") || "RIEN"} : ${classes.join(", ")} (attendu ${cls})`);
  }
  expect(bad).toEqual([]);
});

it("a dictated treatment line gives each treatment once, and nothing more", () => {
  const cases: [string, number][] = [
    ["Traitement : Asaflow 80, bisoprolol 2,5 mg, Crestor 10, Pantomed 40, Dafalgan si douleur", 5],
    ["Traitement : buprénorphine 8 mg", 1],
    ["Traitement : vitamine D, fer oral", 2],
    ["Traitement : Eliquis 5 mg 2x/j, Lasix 40, Aldactone 25, Emconcor 5", 4],
    ["Traitement : Lantus 20 UI le soir, Novorapid selon schéma, metformine 1 g 2x/j, Jardiance 10", 4],
    ["Traitement : Symbicort 2 bouffées 2x/j, Spiriva, Ventolin si besoin", 3],
  ];
  const bad: string[] = [];
  for (const [q, n] of cases) {
    const r = parseQuickEntry(q, DEFAULT_CATALOGS);
    if (r.treatments.length !== n || r.freeTreatments.length) bad.push(`${q} → ${r.treatments.map((t) => t.name).join(", ")} | libres : ${r.freeTreatments.join(", ")}`);
  }
  expect(bad).toEqual([]);
});
