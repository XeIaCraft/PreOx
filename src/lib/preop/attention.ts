// Points of attention generated from the whole consultation: what this
// patient's antecedents, treatments, scores and intervention call for. They
// are reminders of well-established precautions, not prescriptions — no
// dose, no timing that belongs to a guideline (those come from your rules).
// Each can carry equipment and a "risk + conduct" pair that the case
// preparation adds to the plan in one tap.

import { atcMatches } from "./medications";
import { has, qualified } from "./history";
import { bpLabel } from "./derive";
import type { ConsultationScores } from "./consultation-scores";
import type { ConsultationState } from "./dossier";
import type { ProtocolContent, ProtocolRisk } from "./protocols";

export type AttentionLevel = "high" | "medium" | "info";

export interface AttentionPoint {
  id: string;
  level: AttentionLevel;
  title: string;
  detail: string;
  /** Equipment / monitoring to add to the plan. */
  material?: string[];
  risk?: ProtocolRisk;
}

const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function attentionPoints(c: ConsultationState, scores: ConsultationScores, plan?: ProtocolContent): AttentionPoint[] {
  const out: AttentionPoint[] = [];
  const add = (p: AttentionPoint) => out.push(p);
  const cond = scores.conditions;
  const r = scores.results;
  const t = c.treatments;
  const allergies = fold(c.patient.allergies ?? "");
  const p = c.patient;

  // --- Anaesthetic history and allergies ---------------------------------------
  if (has(cond, "malignant_hyperthermia"))
    add({
      id: "mh",
      level: "high",
      title: "Hyperthermie maligne (patient ou famille)",
      detail: "Anesthésie sans halogénés ni succinylcholine ; machine préparée (purge ou filtres à charbon actif) ; dantrolène disponible.",
      material: ["Dantrolène disponible en salle", "Machine purgée / filtres à charbon actif"],
      risk: { title: "Crise d'hyperthermie maligne", conduct: "Arrêt des halogénés, appel à l'aide, dantrolène selon le protocole du service, refroidissement, traitement de l'hyperkaliémie." },
    });
  if (has(cond, "pseudocholinesterase")) add({ id: "pche", level: "high", title: "Déficit en pseudocholinestérase", detail: "Éviter la succinylcholine et le mivacurium ; monitorer la curarisation.", material: ["Curarimètre"] });
  if (has(cond, "anaesthetic_allergy"))
    add({ id: "allergy-anaes", level: "high", title: "Allergie per-anesthésique", detail: "Récupérer le bilan allergologique ; éviter les produits en cause ; en l'absence de bilan, le demander avant une chirurgie programmée." });
  if (/latex/.test(allergies)) add({ id: "latex", level: "high", title: "Allergie au latex", detail: "Salle et matériel sans latex, patient en premier du programme si possible.", material: ["Salle sans latex"] });
  if (plan && allergies) {
    for (const d of plan.drugs) {
      const name = fold(d.name).split(" ")[0];
      if (name.length >= 4 && allergies.includes(name)) add({ id: `allergy-${d.id}`, level: "high", title: `Allergie déclarée : ${d.name} figure au plan`, detail: `Allergies notées : « ${c.patient.allergies} ». Revoir ce produit.` });
    }
    if (/penicil|amoxicil|beta.?lactam|cephalospor/.test(allergies) && plan.drugs.some((d) => /cef|cefaz|cefur|amoxi/.test(fold(d.name))))
      add({ id: "allergy-betalactam", level: "high", title: "Allergie aux bêtalactamines et bêtalactamine au plan", detail: "Préciser le type de réaction et vérifier l'antibioprophylaxie prévue." });
  }

  // --- Airway ---------------------------------------------------------------------
  if (has(cond, "difficult_airway") || r.airway.level === "high")
    add({
      id: "airway",
      level: "high",
      title: "Intubation difficile prévisible",
      detail: "Stratégie décidée à l'avance selon l'algorithme du service ; préoxygénation optimisée ; matériel en salle.",
      material: ["Vidéolaryngoscope", "Chariot d'intubation difficile", "Dispositifs supraglottiques"],
      risk: { title: "Intubation difficile", conduct: "Appel à l'aide précoce, plan B supraglottique, plan C oxygénation, plan D abord cervical selon l'algorithme." },
    });
  else if (r.mask.level === "high") add({ id: "mask", level: "medium", title: "Ventilation au masque difficile prévisible", detail: "Préoxygénation optimisée, canule oropharyngée et ventilation à deux mains prêtes.", material: ["Canules oropharyngées"] });
  if (has(cond, "gerd") || has(cond, "pregnancy"))
    add({ id: "aspiration", level: "medium", title: "Risque d'inhalation", detail: "Évaluer le jeûne et discuter une induction en séquence rapide." });

  // --- Respiratory ----------------------------------------------------------------
  if (has(cond, "osa") || r.stopBang.level === "high")
    add({
      id: "osa",
      level: "medium",
      title: has(cond, "osa") ? "SAOS connu" : "Risque élevé de SAOS (STOP-BANG)",
      detail: `Épargne morphinique, ALR si possible, surveillance de la SpO₂ au réveil${has(cond, "osa") && !qualified(cond, "osa", "poorlyControlled") ? " ; PPC du patient à apporter" : ""}.`,
      material: has(cond, "osa") && !qualified(cond, "osa", "poorlyControlled") ? ["PPC du patient"] : undefined,
    });
  if (qualified(cond, "asthma", "poorlyControlled")) add({ id: "asthma", level: "high", title: "Asthme mal contrôlé", detail: "Optimiser le traitement avant une chirurgie programmée ; bronchodilatateur disponible." });
  if (has(cond, "copd") || has(cond, "home_o2") || r.ariscat.level === "high")
    add({
      id: "lung",
      level: r.ariscat.level === "high" ? "high" : "medium",
      title: "Risque de complications pulmonaires",
      detail: "Ventilation protectrice, kinésithérapie respiratoire, analgésie épargnant les morphiniques, traitement inhalé poursuivi.",
    });

  // --- Cardiovascular -----------------------------------------------------------
  if ((p.sbp ?? 0) >= 180 || (p.dbp ?? 0) >= 110)
    add({ id: "bp", level: "high", title: bpLabel(p.sbp, p.dbp), detail: "Contrôler la mesure ; hypertension non contrôlée : discuter l'optimisation, voire le report d'une chirurgie programmée." });
  if (qualified(cond, "coronary", "recent") || qualified(cond, "coronary", "severe"))
    add({ id: "coronary-recent", level: "high", title: "Événement coronarien récent ou ischémie active", detail: "Avis cardiologique : délai de la chirurgie et gestion des antiagrégants à décider ensemble ; ne pas interrompre une double antiagrégation sans cet avis." });
  if (qualified(cond, "stroke", "recent")) add({ id: "stroke-recent", level: "high", title: "AVC / AIT de moins de 3 mois", detail: "Discuter le report d'une chirurgie non urgente ; maintenir la pression de perfusion." });
  if (qualified(cond, "heart_failure", "severe") || qualified(cond, "valve", "severe"))
    add({ id: "heart", level: "high", title: "Cardiopathie sévère", detail: "Échocardiographie récente et avis cardiologique ; monitorage hémodynamique adapté.", material: ["Pression artérielle invasive (à discuter)"] });
  if (has(cond, "pacemaker"))
    add({
      id: "pacemaker",
      level: "high",
      title: "Pacemaker / DAI",
      detail: "Date du dernier contrôle, dépendance au stimulateur ; programmation périopératoire (thérapies du DAI) selon la procédure du service ; bistouri bipolaire si possible.",
      material: ["Aimant", "Défibrillateur avec électrodes"],
    });
  if (has(cond, "murmur")) add({ id: "murmur", level: "medium", title: "Souffle non exploré", detail: "Échocardiographie avant une chirurgie à risque." });
  if (r.rcri.value >= 2 || (scores.results.dasi.missing === 0 && scores.results.dasi.mets < 4 && c.surgery.cardiacRisk !== "low"))
    add({ id: "cardiac-risk", level: "medium", title: "Risque cardiaque augmenté", detail: "Évaluation selon ESC 2022 : ECG, biomarqueurs, échocardiographie selon la capacité fonctionnelle (voir les examens)." });

  // --- Metabolic, renal, hepatic, haematology ----------------------------------------
  if (has(cond, "diabetes_insulin")) add({ id: "insulin", level: "medium", title: "Diabète insulinotraité", detail: "Protocole de gestion de l'insuline, glycémies capillaires périopératoires ; en début de programme si possible.", material: ["Glycémies capillaires"] });
  else if (has(cond, "diabetes_oral")) add({ id: "diabetes", level: "info", title: "Diabète", detail: "Glycémies périopératoires ; gestion des antidiabétiques oraux selon vos règles." });
  if (has(cond, "dialysis")) add({ id: "dialysis", level: "medium", title: "Dialyse", detail: "Séance la veille, kaliémie du jour, bras de la fistule protégé (ni brassard ni perfusion).", material: ["Protéger le bras de la fistule"] });
  else if (has(cond, "ckd")) add({ id: "ckd", level: "medium", title: "Insuffisance rénale", detail: "Adapter les posologies à la clairance ; éviter les néphrotoxiques." });
  if (has(cond, "cirrhosis")) add({ id: "liver", level: "medium", title: "Hépatopathie", detail: "Hémostase, albumine ; adapter les posologies." });
  if (has(cond, "anemia")) add({ id: "anemia", level: "medium", title: "Anémie", detail: "À rechercher et traiter avant une chirurgie programmée (bilan martial, fer si carence)." });
  if (c.surgery.bleedingRisk === "high")
    add({ id: "bleeding", level: "medium", title: "Chirurgie à risque hémorragique élevé", detail: "Groupe sanguin et recherche d'agglutinines irrégulières selon la procédure du service ; épargne sanguine.", material: ["Groupe / RAI valides", "Accès veineux de bon calibre"] });
  if (has(cond, "bleeding_disorder") || r.hemstop.value > 0) add({ id: "hemostasis", level: "medium", title: "Trouble de l'hémostase possible", detail: "Bilan d'hémostase ciblé, avis hématologique si trouble connu." });
  if (has(cond, "vte")) add({ id: "vte", level: "medium", title: "Antécédent de MTEV", detail: "Thromboprophylaxie à adapter au risque." });

  // --- Treatments -----------------------------------------------------------------
  if (t.some((x) => atcMatches(x.atc, "H02AB"))) add({ id: "steroids", level: "medium", title: "Corticothérapie au long cours", detail: "Risque d'insuffisance surrénale : discuter une supplémentation périopératoire." });
  if (t.some((x) => atcMatches(x.atc, "N06AF"))) add({ id: "maoi", level: "high", title: "IMAO", detail: "Interactions graves (sympathomimétiques indirects comme l'éphédrine, péthidine, tramadol…) : à discuter avec le prescripteur." });
  if (t.some((x) => atcMatches(x.atc, "N04B")))
    add({ id: "parkinson", level: "medium", title: "Antiparkinsoniens", detail: "Ne pas interrompre (prise le matin, reprise précoce) ; éviter les antidopaminergiques (dropéridol, métoclopramide)." });
  if (t.some((x) => atcMatches(x.atc, "N03")) || has(cond, "epilepsy")) add({ id: "antiepileptics", level: "info", title: "Antiépileptiques", detail: "Poursuivre, y compris le matin de l'intervention." });

  // --- Substance use ------------------------------------------------------------------
  const s = c.substances;
  if (s.alcoholDependence) add({ id: "alcohol", level: "high", title: "Dépendance à l'alcool", detail: "Prévenir et surveiller le sevrage (échelle adaptée), vitamine B1." });
  if (s.drugs?.includes("opioids") || t.some((x) => atcMatches(x.atc, "N07BC")))
    add({ id: "opioid-tolerance", level: "medium", title: "Tolérance aux opioïdes", detail: "Poursuivre le traitement de substitution ; analgésie multimodale et ALR ; besoins en morphiniques augmentés." });
  if (s.drugs?.includes("cocaine")) add({ id: "cocaine", level: "medium", title: "Cocaïne", detail: "Demander la dernière consommation ; risque cardiovasculaire en cas d'usage récent." });
  if (s.tobacco === "current") add({ id: "tobacco", level: "info", title: "Tabagisme actif", detail: "Proposer l'arrêt : le bénéfice est d'autant plus grand que l'arrêt est précoce." });

  // --- Other -------------------------------------------------------------------------
  if (has(cond, "neuromuscular"))
    add({ id: "neuromuscular", level: "high", title: "Maladie neuromusculaire", detail: "Prudence avec la succinylcholine et les curares ; risque respiratoire postopératoire.", material: ["Curarimètre"] });
  if ((c.frailty ?? 0) >= 5 || has(cond, "cognitive") || (p.age ?? 0) >= 75)
    add({ id: "delirium", level: "medium", title: "Risque de delirium postopératoire", detail: "Limiter benzodiazépines et anticholinergiques, repères, lunettes et appareils auditifs, mobilisation précoce." });
  if (has(cond, "pregnancy")) add({ id: "pregnancy", level: "high", title: "Grossesse", detail: "Avis obstétrical ; décubitus latéral gauche après 20 SA ; risque d'inhalation." });
  if (r.apfel.level === "high") add({ id: "ponv", level: "medium", title: "Risque élevé de NVPO", detail: "Prophylaxie multimodale, épargne morphinique." });
  if (c.surgery.emergency) add({ id: "emergency", level: "info", title: "Chirurgie urgente", detail: "Jeûne à vérifier ; risque majoré." });

  const order: Record<AttentionLevel, number> = { high: 0, medium: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
