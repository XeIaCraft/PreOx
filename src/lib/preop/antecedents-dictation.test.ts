// Antecedents as they are dictated at the consultation are recognised.
import { expect, it } from "vitest";
import { parseQuickEntry } from "./quick-entry";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
const Q: [string, string][] = [
  ["HTA", "hypertension"], ["hypertendu", "hypertension"], ["IDM en 2019", "coronary"], ["infarctus il y a 2 mois", "coronary"], ["IDM récent", "recent_mi"], ["angor stable", "stable_angina"], ["stent actif 2023", "coronary_stent"], ["pontage aorto-coronarien", "cabg"], ["insuffisance cardiaque FEVG 35 %", "heart_failure"], ["FA sous apixaban", "arrhythmia"], ["ACFA", "arrhythmia"], ["flutter", "arrhythmia"], ["RA serré", "aortic_stenosis"], ["valve mécanique mitrale", "mechanical_valve"], ["TAVI 2022", "bioprosthetic_valve"], ["pacemaker", "pacemaker"], ["défibrillateur implantable", "pacemaker"], ["AOMI", "pad"], ["artériopathie des membres inférieurs", "pad"], ["anévrisme de l'aorte abdominale", "aortic_aneurysm"], ["phlébite", "vte"], ["embolie pulmonaire", "vte"], ["TVP", "vte"], ["HTAP", "pulmonary_hypertension"], ["cardiomyopathie hypertrophique", "hcm"],
  ["BPCO", "copd"], ["emphysème", "copd"], ["asthme", "asthma"], ["asthmatique", "asthma"], ["SAOS appareillé", "osa"], ["SAS", "osa"], ["apnées du sommeil", "osa"], ["oxygène à domicile", "home_o2"], ["fibrose pulmonaire", "restrictive"], ["mucoviscidose", "cystic_fibrosis"], ["bronchite récente", "recent_uri"], ["rhume", "recent_uri"], ["COVID il y a 3 semaines", "covid_recent"],
  ["diabète de type 2", "diabetes_oral"], ["DT2", "diabetes_oral"], ["DNID", "diabetes_oral"], ["diabète insulinodépendant", "diabetes_insulin"], ["DT1", "diabetes_insulin"], ["hypothyroïdie", "hypothyroidism"], ["Basedow", "hyperthyroidism"], ["hyperthyroïdie", "hyperthyroidism"], ["insuffisance surrénalienne", "adrenal_insufficiency"], ["Addison", "adrenal_insufficiency"], ["phéochromocytome", "pheochromocytoma"], ["dénutrition", "malnutrition"],
  ["insuffisance rénale chronique", "ckd"], ["IRC", "ckd"], ["hémodialysé", "dialysis"], ["dialyse", "dialysis"], ["greffé rénal", "kidney_transplant"], ["greffe de rein", "kidney_transplant"],
  ["cirrhose", "cirrhosis"], ["cirrhose éthylique", "cirrhosis"], ["hépatite C", "viral_hepatitis"], ["hépatite B", "viral_hepatitis"], ["RGO", "gerd"], ["hernie hiatale", "gerd"], ["reflux", "gerd"], ["Crohn", "ibd"], ["RCH", "ibd"], ["ulcère gastrique", "peptic_ulcer"], ["éthylisme chronique", "alcohol_dependence"], ["alcoolisme", "alcohol_dependence"], ["gastroparésie", "gastroparesis"],
  ["AVC", "stroke"], ["AIT", "stroke"], ["épilepsie", "epilepsy"], ["épileptique", "epilepsy"], ["Parkinson", "parkinson"], ["SEP", "multiple_sclerosis"], ["sclérose en plaques", "multiple_sclerosis"], ["démence", "cognitive"], ["Alzheimer", "cognitive"], ["myasthénie", "myasthenia"], ["SLA", "als"], ["Steinert", "myotonic_dystrophy"], ["paraplégique", "spinal_cord_injury"], ["tétraplégie", "spinal_cord_injury"], ["hémiplégie", "hemiplegia"], ["migraine", "migraine"], ["neuropathie diabétique", "neuropathy"],
  ["anémie", "anemia"], ["drépanocytose", "sickle_cell"], ["hémophilie A", "hemophilia"], ["Willebrand", "von_willebrand"], ["thrombopénie", "thrombocytopenia"], ["TIH", "hit_history"], ["thrombophilie", "thrombophilia"], ["facteur V Leiden", "thrombophilia"], ["SAPL", "antiphospholipid"], ["lymphome", "leukemia_lymphoma"], ["Témoin de Jéhovah", "transfusion_refusal"],
  ["dépression", "depression"], ["bipolaire", "bipolar"], ["schizophrénie", "psychosis"], ["anorexie mentale", "eating_disorder"], ["autisme", "autism"], ["cocaïne", "cocaine"], ["méthadone", "opioid_use_disorder"], ["TDAH", "adhd"],
  ["polyarthrite rhumatoïde", "rheumatoid"], ["PR", "rheumatoid"], ["spondylarthrite ankylosante", "ankylosing"], ["lupus", "lupus"], ["sclérodermie", "scleroderma"], ["trisomie 21", "down_syndrome"], ["VIH", "hiv"], ["enceinte de 12 SA", "pregnancy"], ["grossesse", "pregnancy"], ["allaitement", "breastfeeding"], ["cancer du sein", "cancer"], ["chimiothérapie en cours", "chemotherapy"], ["greffe hépatique", "liver_transplant"], ["BMR", "mdro"], ["Marfan", "marfan"],
  ["obèse morbide", "obesity"], ["diabète gestationnel", "gestational_diabetes"], ["placenta accreta", "placenta_accreta"], ["épidermolyse bulleuse", "epidermolysis_bullosa"], ["hypotension orthostatique", "autonomic_dysfunction"], ["myocardite", "myocarditis"],
  ["intubation difficile", "difficult_airway"], ["hyperthermie maligne", "malignant_hyperthermia"], ["NVPO", "ponv"], ["mal des transports", "ponv"], ["réveil difficile", "delayed_emergence"], ["déficit en pseudocholinestérase", "pseudocholinesterase"], ["choc anaphylactique au bloc", "anaesthetic_allergy"],
  ["bypass gastrique", "bariatric_history"], ["sleeve", "bariatric_history"], ["prothèse de hanche", "joint_prosthesis"], ["césarienne", "prior_caesarean"], ["laryngectomie", "tracheostomy"], ["splénectomie", "asplenia"], ["arthrodèse lombaire", "scoliosis"],
];
it("dictated antecedents are recognised", () => {
  const bad: string[] = [];
  for (const [q, id] of Q) {
    const r = parseQuickEntry(q, DEFAULT_CATALOGS);
    const ids = r.conditions.map((c) => c.id);
    if (!ids.includes(id)) bad.push(`${q} → ${ids.join(", ") || "RIEN"} (attendu ${id})`);
  }
  expect(bad).toEqual([]);
});

it("ASA classes follow the examples of the ASA classification (2020 update)", async () => {
  const { DEFAULT_CONDITIONS } = await import("./catalog-conditions");
  const cls = (id: string, q?: "recent" | "severe" | "poorlyControlled") => {
    const c = DEFAULT_CONDITIONS.find((x) => x.id === id)!;
    return (q && c.asaIf?.[q]) ?? c.asa;
  };
  // ASA II
  expect([cls("hypertension"), cls("diabetes_oral"), cls("pregnancy"), cls("obesity")]).toEqual([2, 2, 2, 2]);
  // ASA III
  expect([cls("hypertension", "poorlyControlled"), cls("diabetes_insulin", "poorlyControlled"), cls("copd"), cls("obesity", "severe"), cls("viral_hepatitis", "severe"), cls("alcohol_dependence"), cls("pacemaker"), cls("dialysis"), cls("coronary"), cls("coronary_stent"), cls("stroke"), cls("preeclampsia"), cls("ex_premature")]).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
  // ASA IV
  expect([cls("recent_mi"), cls("coronary", "recent"), cls("coronary_stent", "recent"), cls("stroke", "recent"), cls("stable_angina", "poorlyControlled"), cls("valve", "severe"), cls("heart_failure", "severe"), cls("septic_shock"), cls("ckd", "severe"), cls("preeclampsia", "severe")]).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
});
