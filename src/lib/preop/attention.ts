// Points of attention generated from the whole consultation. Most come from
// the catalogues (Paramètres): each antecedent, allergen, treatment or
// treatment class can carry a point of attention with equipment. The rest
// are computed here from the scores and the intervention (predicted
// difficult airway, pulmonary risk, BP, bleeding risk…). They are reminders
// of well-established precautions, not prescriptions — no dose, no timing
// that belongs to a guideline (those come from your rules).

import { QUALIFIER_LABELS, anyOf, has } from "./history";
import { DRUG_REFERENCES, DRUG_REFERENCE_SOURCE, cautionsFor, drugReferenceFor, localAnaestheticLoad, morphineEquivalents } from "./drug-reference";
import { computeDose, type ProtocolDrug } from "./protocols";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import { classesOf, fold, medicationOf, type AllergenItem, type AttentionSpec } from "./catalog";
import type { ConsultationScores } from "./consultation-scores";
import { examSummary, type AllergyEntry, type ConsultationState } from "./dossier";
import { ARISCAT_REFERENCE, MASK_VENTILATION_ITEMS, MASK_VENTILATION_REFERENCE, PEN_FAST_REFERENCE, penFast, type MaskVentilationItem } from "./scores";
import { implausibleValues, valueFindings } from "./value-checks";
import type { ProtocolContent, ProtocolRisk } from "./protocols";
import type { Qualifier } from "./history";

export type AttentionLevel = "high" | "medium" | "info";

export interface AttentionPoint {
  id: string;
  level: AttentionLevel;
  title: string;
  detail: string;
  /** What in the consultation triggered it (« Âge 80 ans ≥ 75 », « Antécédent coché : BPCO sévère »). */
  why?: string;
  /** Guideline or score it rests on. */
  source?: string;
  /** Equipment / monitoring to add to the plan. */
  material?: string[];
  risk?: ProtocolRisk;
}

const fromSpec = (id: string, title: string, spec: AttentionSpec, why: string, source?: string, risk?: ProtocolRisk): AttentionPoint => ({ id, level: spec.level, title, detail: spec.text, material: spec.material, risk, why, source });
const LEVEL_ORDER: Record<AttentionLevel, number> = { high: 0, medium: 1, info: 2 };
const n = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");

/** Allergens recognised in the patient's allergies (structured entries and free text). */
export function recognisedAllergens(c: ConsultationState, allergens: AllergenItem[] = DEFAULT_CATALOGS.allergens): { allergen: AllergenItem; as: string; entry?: AllergyEntry }[] {
  const out: { allergen: AllergenItem; as: string; entry?: AllergyEntry }[] = [];
  const entries = c.patient.allergyList ?? [];
  for (const e of entries) {
    const a = e.allergenId ? allergens.find((x) => x.id === e.allergenId) : undefined;
    if (a && !out.some((o) => o.allergen.id === a.id)) out.push({ allergen: a, as: e.label, entry: e });
  }
  const text = fold([c.patient.allergies ?? "", ...entries.filter((e) => !e.allergenId).map((e) => e.label)].join(" "));
  if (text) {
    for (const a of allergens) {
      if (out.some((o) => o.allergen.id === a.id)) continue;
      const hit = [a.label, ...a.keywords].find((k) => fold(k).length >= 3 && text.includes(fold(k)));
      if (hit) out.push({ allergen: a, as: hit });
    }
  }
  return out;
}

export function attentionPoints(c: ConsultationState, scores: ConsultationScores, plan?: ProtocolContent): AttentionPoint[] {
  const out: AttentionPoint[] = [];
  const add = (p: AttentionPoint) => {
    if (!out.some((x) => x.id === p.id)) out.push(p);
  };
  const catalogs = scores.catalogs ?? DEFAULT_CATALOGS;
  const cond = scores.conditions;
  const r = scores.results;
  const p = c.patient;
  const planDrugs = plan?.drugs ?? [];

  // --- Values typed that can't be right -----------------------------------------------
  for (const x of implausibleValues(p))
    add({ id: `implausible-${x.value}`, level: "medium", title: `Valeur à vérifier : ${x.label}`, detail: "Hors des valeurs possibles : erreur de saisie ou d'unité ? Elle n'est pas utilisée tant qu'elle n'est pas corrigée.", why: "Saisie de l'étape Patient" });

  // --- Vitals and biology past a threshold (Paramètres › Valeurs à signaler) ---------------
  for (const f of valueFindings(p, scores.derived, catalogs.values ?? DEFAULT_CATALOGS.values)) {
    if (!f.primary || !f.check.attention) continue;
    add(fromSpec(`value-${f.check.group ?? f.check.id}`, f.measured, f.check.attention, `Seuil « ${f.check.label} » dépassé (Paramètres › Valeurs à signaler)`, f.check.source));
  }

  // --- Clinical exam --------------------------------------------------------------------
  const exam = p.exam;
  if (exam && ((exam.lungs === "crackles" && (exam.edema || exam.jvd)) || (exam.edema && exam.jvd)))
    add({ id: "exam-chf", level: "high", title: "Signes d'insuffisance cardiaque congestive", detail: "Décompensation possible : ECG, NT-proBNP, échocardiographie ; chirurgie programmée à reporter si décompensée (ESC 2022).", why: `Examen : ${examSummary(exam)}`, source: "ESC 2022, chirurgie non cardiaque" });
  if (exam?.lungs === "wheeze") add({ id: "exam-wheeze", level: "medium", title: "Sibilants à l'auscultation", detail: "Bronchospasme actif : optimiser le traitement inhalé avant une chirurgie programmée ; bronchodilatateur disponible à l'induction.", why: "Examen : sibilants" });
  if (exam?.lungs === "diminished") add({ id: "exam-diminished", level: "medium", title: "Murmure vésiculaire diminué", detail: "Épanchement, atélectasie, emphysème ? Radiographie du thorax à discuter.", why: "Examen : murmure diminué" });
  if (exam?.punctureSite) add({ id: "exam-puncture", level: "high", title: "Lésion ou infection au site de ponction", detail: "Pas de ponction (neuraxiale ou bloc) à travers une zone infectée : choisir un autre site ou une autre technique.", why: "Examen : lésion au site de ponction" });

  // --- Allergies ---------------------------------------------------------------------
  for (const { allergen, as, entry } of recognisedAllergens(c, catalogs.allergens)) {
    const title = `Allergie : ${allergen.label}${fold(as) !== fold(allergen.label) ? ` (${as})` : ""}`;
    const why = `Allergie déclarée : ${as}${entry?.reaction ? ` — réaction : ${entry.reaction}` : ""}`;
    // A reported penicillin allergy judged by PEN-FAST: unlikely to be true when < 3.
    const pf = allergen.assessment === "pen-fast" && entry?.penFast ? penFast(entry.penFast) : null;
    const unlikely = !!pf && pf.label !== "" && pf.value < 3;
    if (pf && pf.label) {
      add(
        unlikely
          ? {
              id: `allergy-${allergen.id}`,
              level: "medium",
              title: `${title} — PEN-FAST ${pf.value}/5 : allergie vraie peu probable`,
              detail: "Risque faible d'allergie vraie (moins de 1 % de tests positifs sous 3 points dans l'étude de validation) : l'étiquette pourrait être levée (test de provocation orale, avis allergologique). Antibioprophylaxie selon vos règles.",
              why,
              source: PEN_FAST_REFERENCE.label,
            }
          : { id: `allergy-${allergen.id}`, level: "high", title: `${title} — PEN-FAST ${pf.value}/5`, detail: `${allergen.attention.text} Avis allergologique.`, material: allergen.attention.material, why, source: PEN_FAST_REFERENCE.label }
      );
    } else {
      add(fromSpec(`allergy-${allergen.id}`, title, allergen.attention, why, allergen.source));
      if (allergen.assessment === "pen-fast")
        add({ id: `penfast-${allergen.id}`, level: "info", title: "Évaluer l'allergie avec PEN-FAST", detail: "Délai depuis la réaction, gravité, traitement nécessaire : 9 allergies à la pénicilline déclarées sur 10 ne se confirment pas. Répondez aux 3 questions sous l'allergie.", why, source: PEN_FAST_REFERENCE.label });
    }
    if (entry?.ringGrade && entry.ringGrade >= 3)
      add({ id: `allergy-grade-${allergen.id}`, level: "high", title: `Réaction de grade ${["I", "II", "III", "IV"][entry.ringGrade - 1]} (Ring et Messmer)`, detail: "Réaction grave : bilan allergologique avant toute nouvelle exposition si l'intervention peut attendre ; éviter tout produit suspect.", why, source: "Ring et Messmer ; ESAIC / EAACI (hypersensibilité périopératoire)" });
    for (const d of planDrugs) {
      if (allergen.drugWords.some((w) => fold(d.name).includes(fold(w))))
        add(
          unlikely
            ? { id: `allergy-plan-${allergen.id}-${d.id}`, level: "medium", title: `${d.name} au plan, allergie déclarée : ${allergen.label}`, detail: `PEN-FAST ${pf!.value}/5 : allergie vraie peu probable ; vérifier la conduite dans vos règles.`, why: `${d.name} figure dans le plan d'anesthésie` }
            : { id: `allergy-plan-${allergen.id}-${d.id}`, level: "high", title: `${d.name} au plan malgré l'allergie : ${allergen.label}`, detail: "Revoir ce produit (réactivité croisée possible) ou confirmer qu'il est toléré.", why: `${d.name} figure dans le plan d'anesthésie` }
        );
    }
  }

  // --- Antecedents (catalogue) -----------------------------------------------------------
  for (const item of catalogs.conditions) {
    const e = cond[item.id];
    if (!e?.present) continue;
    const q = (Object.keys(item.attentionIf ?? {}) as Qualifier[]).find((k) => e[k]);
    // A structured detail (stage, class) may carry its own, more precise point.
    const fromDetails = (item.details ?? [])
      .flatMap((d) => (d.kind === "choice" ? (d.options ?? []).filter((o) => o.attention && e.details?.[d.id] === o.code).map((o) => ({ spec: o.attention!, label: `${d.label} : ${o.label}` })) : []))
      .sort((a, b) => LEVEL_ORDER[a.spec.level] - LEVEL_ORDER[b.spec.level])[0];
    const spec = fromDetails?.spec ?? (q ? item.attentionIf![q]! : item.attention);
    if (!spec) continue;
    const deducedFrom = scores.deduced.get(item.id);
    const precisions = [q ? item.qualifiers?.[q] ?? QUALIFIER_LABELS[q] : "", fromDetails?.label ?? "", ...conditionDetailsText(item, e)].filter(Boolean);
    const why = deducedFrom
      ? `Déduit de : ${deducedFrom} (à confirmer à l'étape Antécédents)`
      : `Antécédent coché${precisions.length ? ` — ${[...new Set(precisions)].join(", ")}` : ""}`;
    add(fromSpec(`cond-${item.id}`, item.label, spec, why, item.source));
  }

  // --- Treatments (catalogue: the product, then its classes) and their interactions ---------
  for (const t of c.treatments) {
    const med = medicationOf(t, catalogs.medications);
    if (med?.attention) add(fromSpec(`med-${med.id}`, t.name, med.attention, `Traitement : ${t.name}`, med.source));
    const classes = classesOf(t, catalogs);
    for (const k of classes) if (k.attention) add(fromSpec(`class-${k.id}`, k.label, k.attention, `Traitement : ${t.name} (classe : ${k.label})`, k.source));
    for (const [ix, owner] of [...(med?.interactions ?? []).map((ix) => [ix, t.name] as const), ...classes.flatMap((k) => (k.interactions ?? []).map((ix) => [ix, k.label] as const))]) {
      const planned = planDrugs.filter((d) => ix.words.some((w) => fold(d.name).includes(fold(w))));
      const id = `ix-${fold(owner)}-${fold(ix.with)}`;
      if (planned.length)
        add({ id, level: "high", title: `Interaction : ${t.name} ↔ ${planned.map((d) => d.name).join(", ")} (au plan)`, detail: ix.effect, why: `Traitement : ${t.name}${owner !== t.name ? ` (classe : ${owner})` : ""} ; ${planned.map((d) => d.name).join(", ")} dans le plan d'anesthésie` });
      else add({ id, level: ix.level, title: `Interaction : ${t.name} ↔ ${ix.with}`, detail: ix.effect, why: `Traitement : ${t.name}${owner !== t.name ? ` (classe : ${owner})` : ""}` });
    }
  }

  // --- Computed from the scores and the intervention ----------------------------------------
  if (r.airway.level === "high" && !has(cond, "difficult_airway"))
    add({
      id: "airway",
      level: "high",
      title: "Intubation difficile prévisible",
      detail: "Stratégie décidée à l'avance selon l'algorithme du service ; préoxygénation optimisée ; matériel en salle.",
      why: `Score d'El-Ganzouri ${r.airway.value}/12 (difficulté prévisible à partir de 4) — étape Voies aériennes`,
      source: "El-Ganzouri, Anesth Analg 1996 ; DAS / SFAR (algorithmes)",
      material: ["Vidéolaryngoscope", "Chariot d'intubation difficile", "Dispositifs supraglottiques"],
      risk: { title: "Intubation difficile", conduct: "Appel à l'aide précoce, plan B supraglottique, plan C oxygénation, plan D abord cervical selon l'algorithme." },
    });
  if (r.mask.level === "high") {
    const met = (Object.keys(MASK_VENTILATION_ITEMS) as MaskVentilationItem[]).filter((k) => scores.merged.mask.merged[k]).map((k) => MASK_VENTILATION_ITEMS[k].toLowerCase());
    add({ id: "mask", level: "medium", title: "Ventilation au masque difficile prévisible", detail: "Préoxygénation optimisée, canule oropharyngée et ventilation à deux mains prêtes ; dispositif supraglottique à portée.", why: `Au moins 2 critères de Langeron : ${met.join(", ")}`, source: MASK_VENTILATION_REFERENCE.label, material: ["Canules oropharyngées"] });
  }
  if (r.stopBang.level === "high" && !has(cond, "osa"))
    add({ id: "osa-risk", level: "medium", title: "Risque élevé de SAOS (STOP-BANG)", detail: "SAOS probablement non diagnostiqué : épargne morphinique, ALR si possible, surveillance de la SpO₂ au réveil ; polysomnographie à proposer à distance.", why: `STOP-BANG ${r.stopBang.value}/8 (risque élevé à partir de 5)`, source: "Chung, Chest 2016" });
  if (r.ariscat.level === "high") {
    const a = { age: p.age, spo2: p.spo2, incision: c.surgery.incision, duration: c.surgery.durationHours, anemia: p.hb !== undefined && p.hb <= 10, uri: has(cond, "recent_uri"), emergency: c.surgery.emergency };
    const parts = [
      a.age !== undefined && a.age > 50 ? `âge ${a.age} ans (+${a.age > 80 ? 16 : 3})` : "",
      a.spo2 !== undefined && a.spo2 <= 95 ? `SpO₂ ${a.spo2} % (+${a.spo2 <= 90 ? 24 : 8})` : "",
      a.uri ? "infection respiratoire < 1 mois (+17)" : "",
      a.anemia ? "Hb ≤ 10 g/dL (+11)" : "",
      a.incision === "intrathoracic" ? "incision intrathoracique (+24)" : a.incision === "upper_abdominal" ? "incision abdominale haute (+15)" : "",
      a.duration !== undefined && a.duration >= 2 ? `durée ${n(a.duration)} h (+${a.duration > 3 ? 23 : 16})` : "",
      a.emergency ? "urgence (+8)" : "",
    ].filter(Boolean);
    add({ id: "lung", level: "high", title: "Risque élevé de complications pulmonaires (ARISCAT)", detail: "Ventilation protectrice, kinésithérapie respiratoire, analgésie épargnant les morphiniques, mobilisation précoce.", why: `ARISCAT ${r.ariscat.value} (élevé à partir de 45) : ${parts.join(", ")}`, source: ARISCAT_REFERENCE.label });
  }
  if (r.rcri.value >= 2 || (r.dasi.missing === 0 && r.dasi.mets < 4 && c.surgery.cardiacRisk !== "low"))
    add({
      id: "cardiac-risk",
      level: "medium",
      title: "Risque cardiaque augmenté",
      detail: "Évaluation selon ESC 2022 : ECG, biomarqueurs, échocardiographie selon la capacité fonctionnelle (voir les examens).",
      why: [r.rcri.value >= 2 ? `indice de Lee ${r.rcri.value}` : "", r.dasi.missing === 0 && r.dasi.mets < 4 ? `capacité fonctionnelle < 4 METs (DASI ${r.dasi.value})` : ""].filter(Boolean).join(" ; "),
      source: "ESC 2022, chirurgie non cardiaque",
    });
  if (c.surgery.bleedingRisk === "high")
    add({ id: "bleeding", level: "medium", title: "Chirurgie à risque hémorragique élevé", detail: "Groupe sanguin et recherche d'agglutinines irrégulières selon la procédure du service ; épargne sanguine.", why: `Intervention${c.surgery.name ? ` « ${c.surgery.name} »` : ""} classée à risque hémorragique élevé (étape Intervention)`, source: "EHRA 2021 (classes de risque hémorragique)", material: ["Groupe / RAI valides", "Accès veineux de bon calibre"] });
  if (r.hemstop.value > 0 && !has(cond, "bleeding_disorder")) add({ id: "hemstop", level: "medium", title: "Questionnaire hémorragique positif", detail: "Bilan d'hémostase ciblé ; avis hématologique selon les réponses.", why: `HEMSTOP : ${r.hemstop.label.toLowerCase()}`, source: "Bonhomme, Eur J Anaesthesiol 2016" });
  if ((c.frailty ?? 0) >= 5 || (p.age ?? 0) >= 75)
    add({
      id: "delirium",
      level: "medium",
      title: "Risque de delirium postopératoire",
      detail: "Limiter benzodiazépines et anticholinergiques, repères, lunettes et appareils auditifs, mobilisation précoce ; dépistage postopératoire.",
      why: [(p.age ?? 0) >= 75 ? `âge ${p.age} ans (≥ 75)` : "", (c.frailty ?? 0) >= 5 ? `fragilité CFS ${c.frailty} (≥ 5)` : ""].filter(Boolean).join(" ; "),
      source: "ESAIC 2023, delirium postopératoire",
    });
  if (r.apfel.level === "high") add({ id: "ponv", level: "medium", title: "Risque élevé de NVPO (Apfel)", detail: "Prophylaxie multimodale, épargne morphinique.", why: `Score d'Apfel ${r.apfel.value}/4`, source: "Apfel 1999 ; consensus NVPO 2020 (Gan)" });

  // --- Agents, doses and monitoring (Manuel pratique d'anesthésie 2020, chapitres 2, 4, 5) ------
  const MANUAL = "Manuel pratique d'anesthésie, 4e éd. 2020";
  const surgeryId = c.surgery.catalogId ?? "";
  const surgeryName = c.surgery.name ? `« ${c.surgery.name} »` : "l'intervention";
  const n2o: string[] = [];
  if (has(cond, "raised_icp") || has(cond, "intracranial_lesion")) n2o.push("hypertension intracrânienne ou lésion cérébrale");
  if (has(cond, "pulmonary_hypertension")) n2o.push("hypertension pulmonaire");
  if (has(cond, "pneumothorax")) n2o.push("antécédent de pneumothorax");
  if (has(cond, "bowel_obstruction")) n2o.push("occlusion ou iléus");
  if (has(cond, "middle_ear") || /tympan|stapéd|oreille|cochléaire/i.test(c.surgery.name)) n2o.push("chirurgie ou pathologie de l'oreille moyenne");
  if (has(cond, "intraocular_gas") || /décollement de rétine|vitrectomie/i.test(c.surgery.name)) n2o.push("gaz intraoculaire (présent ou prévu)");
  if (has(cond, "vitamin_b12")) n2o.push("carence en vitamine B12");
  if (/occlusion|fosse postérieure|laparotomie pour occlusion/i.test(c.surgery.name)) n2o.push(`${surgeryName} (distension ou risque d'embolie gazeuse)`);
  if (n2o.length)
    add({
      id: "n2o",
      level: "medium",
      title: "Protoxyde d'azote contre-indiqué",
      detail: "Le N₂O diffuse dans les cavités closes plus vite que l'azote n'en sort (expansion), augmente le débit sanguin cérébral et les résistances pulmonaires, inactive la vitamine B12.",
      why: n2o.join(" ; "),
      source: `${MANUAL}, chap. 4 (contre-indications du protoxyde d'azote)`,
    });
  const halo: string[] = [];
  if (anyOf(cond, ["malignant_hyperthermia", "duchenne"]) === true) halo.push("hyperthermie maligne ou myopathie de Duchenne/Becker : anesthésie sans halogéné ni succinylcholine");
  if (has(cond, "raised_icp")) halo.push("hypertension intracrânienne : halogénés à fortes concentrations contre-indiqués (vasodilatation cérébrale)");
  if (has(cond, "pulmonary_hypertension")) halo.push("hypertension pulmonaire : éviter le desflurane (augmente les résistances vasculaires pulmonaires)");
  if (halo.length)
    add({
      id: "volatiles",
      level: anyOf(cond, ["malignant_hyperthermia", "duchenne"]) === true ? "high" : "medium",
      title: "Halogénés : précautions",
      detail: halo.join(" ; ") + ".",
      why: halo.map((h) => h.split(" : ")[0]).join(" ; "),
      source: `${MANUAL}, chap. 4`,
      material: anyOf(cond, ["malignant_hyperthermia", "duchenne"]) === true ? ["Machine purgée des halogénés (ou filtres à charbon)", "Dantrolène disponible"] : undefined,
    });

  const doses: string[] = [];
  if (anyOf(cond, ["heart_failure", "dilated_cardiomyopathy"]) === true)
    doses.push("débit cardiaque bas : la fraction libre des hypnotiques augmente mais arrive plus lentement au cerveau — réduire les doses d'induction et titrer patiemment");
  if (has(cond, "cirrhosis") === true)
    doses.push("cirrhose : clairance des médicaments à fort coefficient d'extraction hépatique (propofol, morphine, fentanyl, sufentanil, midazolam, lidocaïne) diminuée — réduire les doses d'entretien");
  if (anyOf(cond, ["ckd", "dialysis"]) === true)
    doses.push("insuffisance rénale : médicaments éliminés inchangés par le rein (rocuronium, néostigmine, céphalosporines, aminosides, digoxine, lithium) — adapter ; métabolites de la morphine");
  if (anyOf(cond, ["malnutrition", "nephrotic"]) === true || (p.albumin !== undefined && p.albumin < 30))
    doses.push("albumine basse : fraction libre des médicaments acides fortement liés (thiopental, warfarine…) augmentée — réduire et titrer");
  if (p.age !== undefined && p.age >= 70) doses.push(`âge ${p.age} ans : CAM diminuée d'environ 6 % par décennie, sensibilité accrue aux hypnotiques et opioïdes`);
  if (doses.length)
    add({
      id: "doses",
      level: "info",
      title: "Doses à adapter",
      detail: doses.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(". ") + ".",
      why: doses.map((d) => d.split(" : ")[0]).join(" ; "),
      source: `${MANUAL}, chap. 4 (CAM) et 5 (pharmacocinétique)`,
    });

  const asaClass = scores.asa ?? 0;
  const invasive =
    (c.surgery.bleedingRisk === "high" && c.surgery.kce === "major") ||
    asaClass >= 4 ||
    has(cond, "pulmonary_hypertension") === true ||
    cond.aortic_stenosis?.severe === true ||
    cond.heart_failure?.severe === true ||
    /cardiaque|CEC|aorte|aortique|hépatectomie|pancréat|transplant|craniotomie|œsophagectomie/i.test(c.surgery.name);
  if (invasive)
    add({
      id: "invasive-monitoring",
      level: "info",
      title: "Pression artérielle invasive à prévoir",
      detail: "Indications : chirurgie majeure ou hémorragique, maladie organique sévère demandant un contrôle précis de la pression, gazométries et ionogrammes répétés. Tester l'arcade palmaire (Allen ou oxymètre) avant un cathéter radial.",
      why: [
        c.surgery.bleedingRisk === "high" && c.surgery.kce === "major" ? `${surgeryName} : majeure et hémorragique` : "",
        asaClass >= 4 ? `ASA ${asaClass}` : "",
        has(cond, "pulmonary_hypertension") ? "hypertension pulmonaire" : "",
        cond.aortic_stenosis?.severe ? "rétrécissement aortique serré" : "",
        cond.heart_failure?.severe ? "insuffisance cardiaque sévère" : "",
      ]
        .filter(Boolean)
        .join(" ; ") || `${surgeryName}`,
      source: `${MANUAL}, chap. 2 (indications de la pression artérielle invasive)`,
      material: ["Cathéter artériel et tête de pression"],
    });
  if (/cardiaque|CEC|transplant|hépatectomie majeure|fosse postérieure|œsophagectomie|aortique ouverte|anévrisme aortique rompu/i.test(c.surgery.name) || surgeryId === "chirurgie-cardiaque-sous-cec")
    add({
      id: "central-line",
      level: "info",
      title: "Voie veineuse centrale à discuter",
      detail: "Indications : médicaments vasoactifs ou irritants, pression veineuse centrale, aspiration d'une embolie gazeuse (position assise). Jugulaire interne droite échoguidée de préférence ; radiographie de contrôle.",
      why: `${surgeryName}`,
      source: `${MANUAL}, chap. 2 (cathéter veineux central)`,
      material: ["Kit de voie veineuse centrale", "Échographe"],
    });

  // --- Anaesthesia drugs to avoid or to adapt (manual, chapters 6–10) ------------------------
  {
    const labelOf = (id: string) => scores.catalogs.conditions.find((x) => x.id === id)?.label ?? id;
    const patient = { conditions: cond as Record<string, { present: boolean } | undefined>, treatments: c.treatments, surgeryName: c.surgery.name, conditionLabel: labelOf };
    const planned = new Set((plan?.drugs ?? []).map((d) => drugReferenceFor(d.name)?.name).filter(Boolean) as string[]);
    const found = DRUG_REFERENCES.filter((ref) => !ref.onlyInPlan || planned.has(ref.name)).flatMap((ref) => cautionsFor(ref, patient));
    const inPlan = found.filter((f) => planned.has(f.drug.name) && f.caution.level !== "adapt");
    for (const f of inPlan)
      add({
        id: `plan-ci-${fold(f.drug.name)}-${fold(f.caution.text).slice(0, 20)}`,
        level: f.caution.level === "contraindicated" ? "high" : "medium",
        title: `${f.drug.name} au plan : ${f.caution.level === "contraindicated" ? "contre-indication" : "à éviter"}`,
        detail: `${f.caution.text.charAt(0).toUpperCase()}${f.caution.text.slice(1)}.`,
        why: `${f.because.join(", ")} ; ${f.drug.name} dans le plan d'anesthésie`,
        source: `${DRUG_REFERENCE_SOURCE}, ${f.drug.chapter}`,
      });
    const rest = found.filter((f) => !inPlan.includes(f));
    const line = (f: (typeof found)[number]) => `${f.drug.name} — ${f.caution.text} (${f.because.join(", ")})`;
    const avoid = rest.filter((f) => f.caution.level !== "adapt");
    const adapt = rest.filter((f) => f.caution.level === "adapt");
    if (avoid.length || adapt.length)
      add({
        id: "drugs-avoid",
        level: avoid.some((f) => f.caution.level === "contraindicated") ? "medium" : "info",
        title: `Médicaments d'anesthésie ${avoid.length ? "à éviter" : ""}${avoid.length && adapt.length ? " ou " : ""}${adapt.length ? "à adapter" : ""}`,
        detail: [avoid.length ? `À éviter : ${avoid.map(line).join(" ; ")}.` : "", adapt.length ? `À adapter : ${adapt.map(line).join(" ; ")}.` : ""].filter(Boolean).join(" "),
        why: [...new Set(rest.flatMap((f) => f.because))].join(", "),
        source: `${DRUG_REFERENCE_SOURCE}, chap. 6 à 10`,
      });
    const meq = morphineEquivalents(c.treatments);
    if (meq.total >= 60 || (meq.unknown.length && (has(cond, "chronic_opioids") || has(cond, "opioid_use_disorder"))))
      add({
        id: "opioid-tolerance",
        level: meq.total >= 60 ? "medium" : "info",
        title: meq.total >= 60 ? `Tolérance aux opioïdes probable (≈ ${meq.total} mg de morphine orale / jour)` : "Traitement opioïde au long cours",
        detail: "Au-delà de 60 mg d'équivalent morphine par jour, une tolérance est probable : poursuivre la dose de base, analgésie multimodale (kétamine, ALR), besoins en opioïdes majorés. Changement d'opioïde : réduire de 10–20 % (tolérance croisée incomplète).",
        why: [...meq.parts, ...(meq.unknown.length ? [`sans conversion : ${meq.unknown.join(", ")} (dose ou produit à préciser)`] : [])].join(" ; "),
        source: `${DRUG_REFERENCE_SOURCE}, chap. 7 (tableau 7.4)`,
      });
  }

  // --- Regional anaesthesia (manual, chapters 12–14) --------------------------------------------
  {
    const techs = new Set([...(plan?.techniques ?? []), ...c.techniques]);
    const regional = techs.has("neuraxial") || techs.has("deep_block") || techs.has("superficial_block");
    if (regional) {
      const absolute: string[] = [];
      const relative: string[] = [];
      if (p.inr !== undefined && p.inr > 1.5) absolute.push(`INR ${n(p.inr)} (> 1,5)`);
      else if (p.inr !== undefined && p.inr >= 1.3) relative.push(`INR ${n(p.inr)} (1,3–1,5)`);
      if (p.platelets !== undefined && p.platelets < 50) absolute.push(`plaquettes ${p.platelets} G/L (< 50)`);
      else if (p.platelets !== undefined && p.platelets < 100) relative.push(`plaquettes ${p.platelets} G/L (50–100)`);
      if (p.exam?.punctureSite) absolute.push("infection au point de ponction");
      if (has(cond, "bleeding_disorder") || has(cond, "hemophilia") || has(cond, "von_willebrand")) relative.push("trouble de l'hémostase connu");
      const spinal: string[] = [];
      if (techs.has("neuraxial")) {
        if (has(cond, "raised_icp")) spinal.push("hypertension intracrânienne");
        if (cond.aortic_stenosis?.present && (cond.aortic_stenosis.severe || has(cond, "aortic_stenosis"))) spinal.push(`rétrécissement aortique${cond.aortic_stenosis.severe ? " serré" : " (sévérité à préciser)"}`);
        if (has(cond, "hcm")) spinal.push("cardiomyopathie hypertrophique obstructive");
      }
      if (absolute.length || relative.length || spinal.length)
        add({
          id: "alr-ci",
          level: absolute.length ? "high" : "medium",
          title: absolute.length ? "ALR contre-indiquée" : spinal.length && !relative.length ? "Rachianesthésie en injection unique déconseillée" : "ALR : contre-indication relative",
          detail: [
            absolute.length ? `Contre-indication absolue : ${absolute.join(", ")}.` : "",
            relative.length ? `Contre-indication relative (à nuancer selon le bénéfice, la chirurgie et le terrain) : ${relative.join(", ")}.` : "",
            spinal.length ? `Rachianesthésie en injection unique contre-indiquée : ${spinal.join(", ")} — une rachianesthésie continue (installation lente) peut être une alternative à l'AG.` : "",
          ]
            .filter(Boolean)
            .join(" "),
          why: [...absolute, ...relative, ...spinal].join(" ; "),
          source: `${DRUG_REFERENCE_SOURCE}, chap. 13 (contre-indications de l'ALR)`,
        });
      if (techs.has("neuraxial")) {
        const level =
          c.surgery.incision === "intrathoracic"
            ? { at: "T5–T6", block: "T2", why: "thoracotomie" }
            : c.surgery.incision === "upper_abdominal"
              ? { at: "T7–T8", block: "T4", why: "laparotomie sus-ombilicale" }
              : /hernie|hystér|prostat|césarienne|colectomie gauche|sigmo|rectum|vessie|cystect/i.test(c.surgery.name)
                ? { at: "T10–T11", block: "T8", why: "laparotomie sous-ombilicale" }
                : c.surgery.category === "K" && /hanche|genou|jambe|pied|cheville|fémur|tibia/i.test(c.surgery.name)
                  ? { at: "L2–L3", block: "T12", why: "chirurgie des membres inférieurs" }
                  : null;
        if (level)
          add({
            id: "epidural-level",
            level: "info",
            title: `Péridurale : ponction ${level.at}`,
            detail: `Pour une ${level.why}, ponction ${level.at} ; bloc sensitif postopératoire souhaité jusqu'à ${level.block} au minimum.`,
            why: `Technique neuraxiale prévue ; ${surgeryName}`,
            source: `${DRUG_REFERENCE_SOURCE}, chap. 13 (tableau 13.4)`,
          });
      }
    }

    if (plan?.drugs.length) {
      const load = localAnaestheticLoad(plan.drugs, p.weightKg, (d) => computeDose(d as ProtocolDrug, { sex: p.sex, weightKg: p.weightKg, heightCm: p.heightCm }));
      if (load.total > 1)
        add({
          id: "la-overdose",
          level: "high",
          title: `Anesthésiques locaux au-delà de la dose toxique (${Math.round(load.total * 100)} %)`,
          detail: "Les doses toxiques s'additionnent entre anesthésiques locaux : réduire les doses ou la concentration ; injection lente et fractionnée, aspirations répétées ; intralipide 20 % disponible.",
          why: load.parts.map((x) => `${x.name} ${x.mg} mg (max ${x.maxMg} mg)`).join(" + "),
          source: `${DRUG_REFERENCE_SOURCE}, chap. 12 (tableau 12.1)`,
          material: ["Intralipide 20 %"],
        });
    }

    const gastric: string[] = [];
    const bmi = scores.derived.bmi;
    if (bmi !== undefined && bmi >= 35) gastric.push(`obésité (IMC ${Math.round(bmi)})`);
    if (has(cond, "pregnancy")) gastric.push("grossesse");
    if (anyOf(cond, ["diabetes_oral", "diabetes_insulin"]) === true) gastric.push("diabète");
    if (has(cond, "bowel_obstruction") || has(cond, "gastroparesis")) gastric.push("obstruction ou gastroparésie");
    if (has(cond, "cirrhosis") || has(cond, "dialysis")) gastric.push("dysfonction hépatique ou rénale sévère");
    if (anyOf(cond, ["neuromuscular", "myotonic_dystrophy", "duchenne", "als"]) === true) gastric.push("maladie neuromusculaire");
    if (anyOf(cond, ["cognitive", "postop_delirium"]) === true) gastric.push("troubles cognitifs");
    if (c.surgery.emergency) gastric.push("urgence");
    if (c.treatments.some((t) => t.atc.startsWith("A10BJ"))) gastric.push("agoniste du GLP-1 (vidange gastrique ralentie)");
    if (gastric.length)
      add({
        id: "gastric-us",
        level: "info",
        title: "Échographie gastrique à envisager avant l'induction",
        detail: "Le jeûne standard vaut pour le patient sain. Antre en décubitus dorsal puis latéral droit : grade 0 (vide dans les deux positions) = estomac vide ; grade 2 (liquide dans les deux) = estomac plein ; grade 1 au cas par cas. Aliments solides : aspect en « verre dépoli ».",
        why: gastric.join(", "),
        source: `${DRUG_REFERENCE_SOURCE}, chap. 14 (échographie gastrique)`,
        material: ["Échographe (sonde convexe)"],
      });
  }

  // --- Airway, ventilation, positioning, infection (manual, chapters 16–20) ------------------------
  {
    const techs = new Set([...(plan?.techniques ?? []), ...c.techniques]);
    const general = techs.has("general");
    const name = fold(c.surgery.name);
    const position = fold(c.surgery.position ?? "");
    const hours = c.surgery.durationHours;
    const bmi = scores.derived.bmi;
    const either = /\bou\b|selon/.test(position);
    const prone = /ventral|prone|genu-pectoral/.test(position);
    const sitting = /(?<!semi-)assis/.test(position) || /position assise/.test(name);
    const lateral = /lateral/.test(position);
    const lithotomy = /lithotom|gynecolog|lloyd|jambiere|perinea/.test(position);
    const posWhy = `Position prévue : ${c.surgery.position || "position assise (intitulé de l'intervention)"}`;

    // Extubation (chap. 17): controlled, progressive and reversible in these situations.
    const extubation: string[] = [];
    if (r.airway.level === "high" || has(cond, "difficult_airway")) extubation.push("intubation difficile prévisible ou connue");
    if (has(cond, "difficult_mask")) extubation.push("ventilation au masque difficile connue");
    if (prone && hours !== undefined && hours > 4) extubation.push(`décubitus ventral de ${n(hours)} h (> 4 h)`);
    if (/laryng|trache|pharyng|glossect|pelvi-mandib|mandibul|maxill|cervicotom|curage (ganglionnaire )?cervical|evidement cervical|thyroid|parotid/.test(name)) extubation.push(`${surgeryName} (chirurgie cervicale, ORL ou maxillo-faciale)`);
    if (general && extubation.length)
      add({
        id: "extubation-risk",
        level: "medium",
        title: "Extubation à risque : la planifier",
        detail:
          "Extubation contrôlée, progressive et réversible, critères habituels respectés (Vt 5–8 ml/kg, FR 10–20, SpO₂ > 95 %, réponse aux ordres, déglutition, T° > 35,5 °C, T4/T1 > 0,9) ; jamais en anesthésie profonde. Test de fuite avant : fuite < 110 ml ou < 10 % du Vt = risque d'obstruction (œdème). Guide échangeur creux à mi-trachée (≤ 25 cm), surveillance 60 min.",
        why: extubation.join(" ; "),
        source: `${MANUAL}, chap. 17 (extubation à risque, figure 17.8)`,
        material: ["Guide échangeur creux (GEC)"],
        risk: { title: "Extubation à risque", conduct: "Échec : O₂ par le GEC, réintubation sur GEC ; SpO₂ < 90 % : jet-oxygénation, oxygénation transtrachéale ou cricothyroïdotomie puis intubation." },
      });

    // Supraglottic device (chap. 17): relative contraindications.
    const lma: string[] = [];
    if (has(cond, "pregnancy")) lma.push("grossesse (au-delà du 1er trimestre)");
    if (has(cond, "gerd")) lma.push("reflux ou hernie hiatale");
    if (has(cond, "bowel_obstruction") || c.surgery.emergency) lma.push("estomac plein ou pathologie abdominale aiguë");
    if (has(cond, "asthma")) lma.push("asthme (résistances augmentées)");
    if (bmi !== undefined && bmi >= 35) lma.push(`obésité (IMC ${Math.round(bmi)}, compliance diminuée)`);
    if (general && lma.length)
      add({
        id: "lma-caution",
        level: "info",
        title: "Masque laryngé : prudence",
        detail: "Le masque laryngé ne protège pas de l'inhalation ; la ventilation contrôlée n'est possible que sous 20 cmH₂O (au-delà : insufflation gastrique et régurgitation). À éviter en cas d'estomac plein, de résistances augmentées ou de compliance basse ; contre-indiqué en cas de pathologie ou d'obstruction pharyngée.",
        why: lma.join(" ; "),
        source: `${MANUAL}, chap. 17 (contre-indications du masque laryngé)`,
      });

    // Nasotracheal intubation (chap. 17).
    const nasal = /dent|mandib|maxill|le fort|cavite buccale|glossect|langue|genioplast|orthognath/.test(name) || c.surgery.category === "E";
    const haemostasis: string[] = [];
    if (anyOf(cond, ["bleeding_disorder", "hemophilia", "von_willebrand"]) === true) haemostasis.push("trouble de l'hémostase");
    if (p.inr !== undefined && p.inr > 1.5) haemostasis.push(`INR ${n(p.inr)}`);
    if (p.platelets !== undefined && p.platelets < 50) haemostasis.push(`plaquettes ${p.platelets} G/L`);
    if (/base du crane/.test(name)) haemostasis.push("fracture de la base du crâne");
    if (general && nasal && haemostasis.length)
      add({ id: "nasal-intubation", level: "medium", title: "Intubation nasotrachéale contre-indiquée", detail: "Contre-indiquée en cas de trouble majeur de l'hémostase ou de fracture de la base du crâne : en discuter avec le chirurgien (voie orale, sonde préformée).", why: `${surgeryName} (intubation nasale habituelle) ; ${haemostasis.join(", ")}`, source: `${MANUAL}, chap. 17` });

    // Starting settings and sizes (chap. 16–18), when the plan is being prepared.
    if (plan && general && p.sex && p.heightCm) {
      const ibw = scores.derived.ibw ?? 0;
      const vt = (k: number) => Math.round((ibw * k) / 10) * 10;
      const peepHigh = bmi !== undefined && bmi >= 35;
      const obstructive = anyOf(cond, ["copd", "asthma"]) === true;
      const rightHeart = anyOf(cond, ["pulmonary_hypertension"]) === true;
      const lmaSize = p.weightKg === undefined ? "" : p.weightKg < 50 ? "3" : p.weightKg < 70 ? "4" : p.weightKg <= 100 ? "5" : "6";
      add({
        id: "ventilation",
        level: "info",
        title: `Réglages de départ : Vt ${vt(6)}–${vt(8)} ml, PEP ${peepHigh ? "8–10" : "5"}`,
        detail: [
          `Vt 6–8 ml/kg du poids idéal (${Math.round(ibw)} kg), FR 10–12/min, PEP ${peepHigh ? "8–10 cmH₂O (obésité)" : "5 cmH₂O"} ; pression de plateau < 30 cmH₂O, idéalement < 25. Ventilation protectrice : Vt limité, PEP et manœuvres de recrutement (20–30 cmH₂O pendant 20–30 s) si hypoxémie.`,
          obstructive ? "Obstructif : rapport I/E abaissé (allonger l'expiration), surveiller l'auto-PEP (le débit expiratoire ne revient pas à zéro)." : "",
          rightHeart ? "Hypertension pulmonaire / VD fragile : PEP basse (la pression positive augmente la postcharge du VD)." : "",
          `Sonde ${p.sex === "M" ? "7,5–8 mm, repère 23 cm" : "6,5–7 mm, repère 21 cm"} à l'arcade dentaire${lmaSize ? ` ; masque laryngé taille ${lmaSize} (${p.weightKg} kg)` : ""}. Préoxygénation jusqu'à FeO₂ ≥ 90 %.`,
        ]
          .filter(Boolean)
          .join(" "),
        why: `${p.sex === "M" ? "Homme" : "Femme"}, ${p.heightCm} cm${p.weightKg ? `, ${p.weightKg} kg` : ""} ; anesthésie générale au plan`,
        source: `${MANUAL}, chap. 16 (équipement), 17 (tableaux 17.1 et 17.2) et 18 (paramètres ventilatoires)`,
      });
    }

    // Positioning (chap. 19).
    if (sitting)
      add({
        id: "position-sitting",
        level: either ? "info" : "medium",
        title: either ? "Si la position assise est retenue : embolie gazeuse" : "Position assise : embolie gazeuse",
        detail: "Échographie préopératoire à la recherche d'un foramen ovale perméable (embolie paradoxale). Doppler précordial ou ETO ; voie centrale pour aspirer l'air ; ETCO₂ qui chute = embolie jusqu'à preuve du contraire (inonder le champ, FiO₂ 100 %, Trendelenburg, compression jugulaire). Protoxyde d'azote arrêté avant la fermeture de la dure-mère (pneumencéphale).",
        why: posWhy,
        source: `${MANUAL}, chap. 19 (position assise)`,
        material: ["Doppler précordial ou ETO", "Voie veineuse centrale"],
      });
    if (prone)
      add({
        id: "position-prone",
        level: "info",
        title: either ? "Si décubitus ventral : installation" : "Décubitus ventral : installation",
        detail: "Appuis sous le thorax et les crêtes iliaques pour libérer l'abdomen (retour veineux, compliance) ; yeux, nez, oreilles, seins et organes génitaux sans appui ; pas de câble ni de tubulure sous le patient ; électrodes hors des appuis. Œdème des voies aériennes : test de fuite avant l'extubation.",
        why: posWhy,
        source: `${MANUAL}, chap. 19 (décubitus ventral)`,
        material: ["Coussins d'appui thoracique et iliaque", "Protection oculaire"],
      });
    if (lateral)
      add({ id: "position-lateral", level: "info", title: either ? "Si décubitus latéral : installation" : "Décubitus latéral : installation", detail: "Support sous le creux axillaire inférieur (plexus brachial), pouls radiaux vérifiés régulièrement, pas de traction sur l'épaule supérieure. Rapport ventilation/perfusion modifié.", why: posWhy, source: `${MANUAL}, chap. 19 (décubitus latéral)`, material: ["Billot axillaire"] });
    if (lithotomy)
      add({ id: "position-lithotomy", level: "info", title: either ? "Si position gynécologique : installation" : "Position gynécologique : installation", detail: "Mobiliser les deux jambes ensemble ; flexion de hanche ≤ 90° ; pas d'appui de la jambe contre les tiges (nerf fibulaire commun : pied tombant). Hypotension possible au retour à plat ; risque d'inhalation accru.", why: posWhy, source: `${MANUAL}, chap. 19 (lithotomie)` });

    const nerve: string[] = [];
    if (has(cond, "neuropathy")) nerve.push("neuropathie préexistante");
    if (bmi !== undefined && bmi >= 35) nerve.push(`obésité (IMC ${Math.round(bmi)})`);
    if (anyOf(cond, ["malnutrition", "eating_disorder"]) === true || (bmi !== undefined && bmi < 18.5)) nerve.push("cachexie ou dénutrition");
    const atRiskSetting = prone || lateral || lithotomy || sitting || (plan?.tourniquetAlertMin ?? 0) > 0 || (hours !== undefined && hours > 4);
    if (nerve.length && (has(cond, "neuropathy") || atRiskSetting))
      add({
        id: "nerve-injury",
        level: "info",
        title: "Risque de lésion nerveuse de posture",
        detail: "Noter l'examen neurologique avant l'intervention (un EMG préopératoire peut documenter une neuropathie existante) ; contrôler les points de compression à l'installation et à chaque changement de position ; garrot : durée < 2 h, pression ≤ 100 mmHg au-dessus de la systolique ; éviter l'hypotension. Neuropathie postopératoire : avis neurologique, EMG à 2–4 semaines.",
        why: [...nerve, atRiskSetting ? (c.surgery.position ? posWhy : "garrot ou intervention longue") : ""].filter(Boolean).join(" ; "),
        source: `${MANUAL}, chap. 19 (facteurs de risque et prévention)`,
      });

    // Surgical antibiotic prophylaxis (chap. 20): what changes for this patient.
    const abx: string[] = [];
    const abxWhy: string[] = [];
    const allergies = recognisedAllergens(c, catalogs.allergens);
    const betalactam = allergies.find((a) => a.allergen.id === "betalactams");
    const cephalo = allergies.find((a) => a.allergen.id === "cephalosporins");
    const blPf = betalactam?.entry?.penFast ? penFast(betalactam.entry.penFast) : null;
    const immediate = !!cephalo || (!!betalactam && (betalactam.entry?.timing === "immediate" || !!betalactam.entry?.ringGrade || (!!blPf?.label && blPf.value >= 3)));
    if (immediate) {
      const vanco = p.weightKg ? Math.min(2500, Math.round((p.weightKg * 15) / 50) * 50) : undefined;
      abx.push(`Allergie ${cephalo ? "aux céphalosporines" : "immédiate aux pénicillines"} : vancomycine 15–30 mg/kg${vanco ? ` (≈ ${vanco} mg à 15 mg/kg)` : ""}, maximum 2 500 mg, en ≥ 60 min, ou clindamycine 600 mg en 30 min.`);
      abxWhy.push(`allergie : ${(cephalo ?? betalactam)!.as}`);
    } else if (betalactam && !(blPf?.label && blPf.value < 3)) {
      abx.push(betalactam.entry?.timing === "delayed" ? "Allergie non immédiate aux pénicillines : céfazoline utilisable (réactivité croisée ≈ 2 %)." : "Allergie aux pénicillines : préciser le type de réaction — l'alternative (vancomycine, clindamycine) n'est réservée qu'aux réactions immédiates (urticaire, angiœdème, bronchospasme, anaphylaxie).");
      abxWhy.push(`allergie : ${betalactam.as}`);
    }
    if (p.weightKg !== undefined && p.weightKg > 120) {
      abx.push(`Poids ${p.weightKg} kg (> 120) : céfazoline 3 g.`);
      abxWhy.push(`poids ${p.weightKg} kg`);
    }
    if (/colon|colect|sigmoid|rect|append|hartmann|colorect|caecum|stomie/.test(name)) {
      abx.push(immediate ? "Côlon, rectum ou appendice : clindamycine + gentamicine 5 mg/kg + métronidazole 500 mg." : "Côlon, rectum ou appendice : ajouter métronidazole 500 mg (en 20 min).");
      abxWhy.push(`${surgeryName}`);
    }
    if ((hours !== undefined && hours > 3) || c.surgery.bleedingRisk === "high") {
      abx.push("Réinjection : 3–4 h après la 1re dose si l'intervention dure, ou si pertes sanguines > 1 500 ml (vancomycine, métronidazole : 8 h ; clindamycine : 6 h).");
      abxWhy.push(hours !== undefined && hours > 3 ? `durée prévue ${n(hours)} h` : "risque hémorragique élevé");
    }
    if (abx.length && c.surgery.name && c.surgery.category !== "I" && c.surgery.category !== "X")
      add({
        id: "antibioprophylaxis",
        level: immediate ? "medium" : "info",
        title: "Antibioprophylaxie : adaptations pour ce patient",
        detail: `${abx.join(" ")} Dose unique dans l'heure avant l'incision, sans adaptation rénale ; à vérifier avec le protocole du service et l'avis du Conseil Supérieur de la Santé.`,
        why: abxWhy.join(" ; "),
        source: `${MANUAL}, chap. 20 (schéma prophylactique) — ouvrage suisse de 2020`,
      });

    // Endocarditis prophylaxis (chap. 20; ESC 2023 is the reference in Belgium).
    const ieRisk = (["endocarditis", "mechanical_valve", "bioprosthetic_valve", "lvad"] as const).filter((id) => has(cond, id));
    const dental = c.surgery.category === "E" && /dent|extraction|parodont|gingiv|implant|kyste|apical|germectomie|stomato/.test(name);
    if (ieRisk.length || (has(cond, "congenital_heart") && dental)) {
      const labels = [...ieRisk, ...(has(cond, "congenital_heart") ? ["congenital_heart"] : [])].map((id) => catalogs.conditions.find((x) => x.id === id)?.label ?? id);
      add(
        dental
          ? {
              id: "endocarditis-prophylaxis",
              level: "medium",
              title: "Prophylaxie de l'endocardite indiquée",
              detail: `Soins dentaires touchant la gencive ou la région périapicale chez un patient à haut risque${has(cond, "congenital_heart") && !ieRisk.length ? " (cardiopathie congénitale : seulement si cyanogène, ou corrigée avec du matériel depuis < 6 mois ou avec shunt résiduel)" : ""} : amoxicilline 2 g PO ou IV, dose unique 30–60 min avant ; allergie : alternative selon l'ESC 2023 et le protocole du service (le manuel propose céfuroxime 1 g si réaction non immédiate, clindamycine 600 mg si immédiate). Pas de dose postopératoire.`,
              why: `${labels.join(", ")} ; ${surgeryName}`,
              source: "ESC 2023, endocardite infectieuse ; Manuel pratique d'anesthésie 2020, chap. 20",
            }
          : {
              id: "endocarditis-prophylaxis",
              level: "info",
              title: "Endocardite : pas de prophylaxie propre à ce geste",
              detail: "Patient à haut risque d'endocardite, mais la prophylaxie spécifique vise les soins dentaires à risque ; pour les autres interventions : antibioprophylaxie chirurgicale habituelle (l'ESC 2023 permet de l'envisager pour certaines procédures invasives chez ces patients). Hygiène dentaire : premier moyen de prévention.",
              why: labels.join(", "),
              source: "ESC 2023, endocardite infectieuse ; Manuel pratique d'anesthésie 2020, chap. 20",
            }
      );
    }
  }

  // --- Substance use ------------------------------------------------------------------
  const sub = c.substances;
  if (sub.alcoholDependence) add({ id: "alcohol", level: "high", title: "Dépendance à l'alcool", detail: "Prévenir et surveiller le sevrage (échelle adaptée), vitamine B1.", why: "Assuétudes : dépendance à l'alcool" });
  if (sub.drugs?.includes("opioids")) add({ id: "opioid-use", level: "medium", title: "Consommation d'opioïdes", detail: "Tolérance : analgésie multimodale et ALR ; besoins en morphiniques majorés ; substitution poursuivie.", why: "Assuétudes : opioïdes" });
  if (sub.drugs?.includes("cocaine")) add({ id: "cocaine", level: "medium", title: "Cocaïne", detail: "Demander la dernière consommation ; risque cardiovasculaire en cas d'usage récent.", why: "Assuétudes : cocaïne" });
  if (sub.tobacco === "current") add({ id: "tobacco", level: "info", title: "Tabagisme actif", detail: "Proposer l'arrêt : le bénéfice est d'autant plus grand que l'arrêt est précoce.", why: `Assuétudes : fumeur${sub.packYears ? ` (${sub.packYears} PA)` : ""}` });
  if (c.surgery.emergency) add({ id: "emergency", level: "info", title: "Chirurgie urgente", detail: "Jeûne à vérifier ; risque majoré.", why: "Intervention marquée urgente" });

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

/** « Stade KDIGO : G4, FEVG : 35 % » — the structured details filled for an antecedent. */
export function conditionDetailsText(item: { details?: { id: string; label: string; kind: string; unit?: string; options?: { code: string; label: string }[] }[] }, e: { details?: Record<string, string | number> }): string[] {
  return (item.details ?? []).flatMap((d) => {
    const v = e.details?.[d.id];
    if (v === undefined || v === "") return [];
    const shown = d.kind === "choice" ? d.options?.find((o) => o.code === v)?.label ?? String(v) : `${String(v).replace(".", ",")}${d.unit ? ` ${d.unit}` : ""}`;
    return [`${d.label} : ${shown}`];
  });
}

/** Compact form for the recap: the answer alone for a choice (« GOLD 3 : 30–49 % »), « FEVG 35 % » otherwise; qualifiers a detail already gives are left out by the caller. */
export function conditionDetailsShort(item: { details?: { id: string; label: string; kind: string; unit?: string; options?: { code: string; label: string; qualifier?: string }[] }[] }, e: { details?: Record<string, string | number> }): { text: string[]; qualifiers: string[] } {
  const text: string[] = [];
  const qualifiers: string[] = [];
  for (const d of item.details ?? []) {
    const v = e.details?.[d.id];
    if (v === undefined || v === "") continue;
    if (d.kind === "choice") {
      const opt = d.options?.find((o) => o.code === v);
      text.push(opt?.label ?? String(v));
      if (opt?.qualifier) qualifiers.push(opt.qualifier);
    } else text.push(`${d.label} ${String(v).replace(".", ",")}${d.unit ? ` ${d.unit}` : ""}`);
  }
  return { text, qualifiers };
}
