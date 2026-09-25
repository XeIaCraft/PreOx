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
import { ecgSummary, examSummary, urgencyOf, type AllergyEntry, type ConsultationState } from "./dossier";
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
  {
    // Apfel: 0–4 factors ≈ 10, 20, 40, 60, 80 % (manual, chap. 23); some surgeries add their own risk.
    const ponvSurgery = /strabism|amygdal|oreille|tympan|cochle|stapedo/.test(fold(c.surgery.name));
    if (r.apfel.level === "high" || ponvSurgery)
      add({
        id: "ponv",
        level: "medium",
        title: r.apfel.level === "high" ? `Risque élevé de NVPO (Apfel ${r.apfel.value}/4 ≈ ${[10, 20, 40, 60, 80][r.apfel.value] ?? 80} %)` : "Chirurgie émétisante : NVPO",
        detail: "Prophylaxie multimodale : dexaméthasone 4–8 mg à l'induction, ondansétron 4 mg ou dropéridol 0,625–1,25 mg 30 min avant la fin ; propofol plutôt qu'halogénés, pas de protoxyde d'azote, épargne morphinique. Chaque mesure réduit le risque d'environ 20 %, et leurs effets s'additionnent.",
        why: [r.apfel.level === "high" ? `Score d'Apfel ${r.apfel.value}/4` : "", ponvSurgery ? `${c.surgery.name} (strabisme, oreille ou amygdale)` : ""].filter(Boolean).join(" ; "),
        source: "Consensus NVPO 2020 (Gan) ; Manuel pratique d'anesthésie 2020, chap. 23",
      });
  }

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
    if (plan && general && p.sex && p.heightCm && !(p.age !== undefined && p.age < 16)) {
      const ibw = scores.derived.ibw ?? 0;
      const vt = (k: number) => Math.round((ibw * k) / 10) * 10;
      const peepHigh = bmi !== undefined && bmi >= 35;
      const obstructive = anyOf(cond, ["copd", "asthma"]) === true;
      const restrictive = has(cond, "restrictive") === true;
      const rightHeart = anyOf(cond, ["pulmonary_hypertension"]) === true;
      const lmaSize = p.weightKg === undefined ? "" : p.weightKg < 50 ? "3" : p.weightKg < 70 ? "4" : p.weightKg <= 100 ? "5" : "6";
      add({
        id: "ventilation",
        level: "info",
        title: `Réglages de départ : Vt ${restrictive ? `${vt(4)}–${vt(6)}` : `${vt(6)}–${vt(8)}`} ml, PEP ${peepHigh ? "8–10" : "5"}`,
        detail: [
          restrictive ? `Fibrose / syndrome restrictif : Vt 4–6 ml/kg du poids idéal (${Math.round(ibw)} kg), FR 14–18/min, pression contrôlée, FiO₂ la plus basse pour SpO₂ > 90 % (risque de pneumothorax).` : "",
          `Vt 6–8 ml/kg du poids idéal (${Math.round(ibw)} kg), FR 10–12/min, PEP ${peepHigh ? "8–10 cmH₂O (obésité)" : "5 cmH₂O"} ; pression de plateau < 30 cmH₂O, idéalement < 25. Ventilation protectrice : Vt limité, PEP et manœuvres de recrutement (20–30 cmH₂O pendant 20–30 s) si hypoxémie.`,
          obstructive ? "Obstructif : rapport I/E abaissé (allonger l'expiration), surveiller l'auto-PEP (le débit expiratoire ne revient pas à zéro)." : "",
          rightHeart ? "Hypertension pulmonaire / VD fragile : PEP basse (la pression positive augmente la postcharge du VD)." : "",
          `Sonde ${p.sex === "M" ? "7,5–8 mm, repère 23 cm" : "6,5–7 mm, repère 21 cm"} à l'arcade dentaire${lmaSize ? ` ; masque laryngé taille ${lmaSize} (${p.weightKg} kg)` : ""}. Préoxygénation jusqu'à FeO₂ ≥ 90 %.`,
        ]
          .filter(Boolean)
          .join(" "),
        why: `${p.sex === "M" ? "Homme" : "Femme"}, ${p.heightCm} cm${p.weightKg ? `, ${p.weightKg} kg` : ""} ; anesthésie générale au plan`,
        source: `${MANUAL}, chap. 16 (équipement), 17 (tableaux 17.1 et 17.2), 18 (paramètres ventilatoires) et 28`,
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

  // --- Fluids, complications, recovery, analgesia (manual, chapters 21–25) ------------------------
  {
    const techs = new Set([...(plan?.techniques ?? []), ...c.techniques]);
    const general = techs.has("general");
    const name = fold(c.surgery.name);
    const age = p.age;
    const crcl = scores.derived.crcl;

    // Tolerated blood loss before transfusion (chap. 21, tableau 21.3).
    if (p.hb !== undefined && p.weightKg && (plan || c.surgery.bleedingRisk === "high" || c.surgery.kce === "major")) {
      const threshold = has(cond, "recent_mi")
        ? { hb: 10, why: "maladie coronarienne instable" }
        : anyOf(cond, ["coronary", "stable_angina", "coronary_stent", "cabg", "heart_failure"]) === true || c.surgery.category === "F"
          ? { hb: 9, why: c.surgery.category === "F" ? "chirurgie cardiaque (après CEC)" : "comorbidité cardiaque" }
          : age !== undefined && age >= 65
            ? { hb: 8, why: `âge ${age} ans` }
            : { hb: 7, why: "patient sans comorbidité" };
      const perKg = age !== undefined && age < 18 ? 80 : age !== undefined && age >= 65 ? 60 : 70;
      const volume = p.weightKg * perKg;
      const loss = p.hb > threshold.hb ? Math.round((((p.hb - threshold.hb) / ((p.hb + threshold.hb) / 2)) * volume) / 50) * 50 : 0;
      add({
        id: "blood-loss",
        level: loss === 0 ? "medium" : c.surgery.bleedingRisk === "high" && loss < 1000 ? "medium" : "info",
        title: loss === 0 ? `Hb ${n(p.hb)} g/dL : déjà au seuil transfusionnel (${threshold.hb})` : `Pertes sanguines tolérables ≈ ${loss} ml avant transfusion`,
        detail: `Pertes tolérées = (Hb − seuil) / Hb moyenne × volume sanguin = (${n(p.hb)} − ${threshold.hb}) / ${n((p.hb + threshold.hb) / 2)} × ${volume} ml (${perKg} ml/kg), si les pertes sont compensées par cristalloïdes ou colloïdes. Seuil : 7 g/dL sans comorbidité, 8 chez la personne âgée, 9 si cardiopathie stable ou après CEC, 10 si coronaropathie instable — à confronter à la stratégie restrictive du service (patient blood management).${loss === 0 ? " Corriger l'anémie avant une chirurgie programmée si possible." : ""}`,
        why: `Hb ${n(p.hb)} g/dL, ${p.weightKg} kg ; seuil ${threshold.hb} g/dL (${threshold.why})`,
        source: `${MANUAL}, chap. 21 (tableau 21.3)`,
      });
    }

    // Choice of fluid (chap. 21).
    const saline: string[] = [];
    if ((anyOf(cond, ["ckd", "dialysis"]) === true && p.potassium !== undefined && p.potassium > 5) || has(cond, "dialysis")) saline.push("insuffisance rénale avec hyperkaliémie");
    if (has(cond, "hyponatremia") || (p.sodium !== undefined && p.sodium < 135)) saline.push("hyponatrémie");
    if (anyOf(cond, ["intracranial_lesion", "raised_icp"]) === true || c.surgery.category === "D") saline.push("lésion cérébrale ou neurochirurgie (pas de glucose 5 % : œdème cérébral)");
    if (has(cond, "cirrhosis")) saline.push("insuffisance hépatique (lactate mal métabolisé)");
    const colloidCi: string[] = [];
    if (has(cond, "heart_failure")) colloidCi.push("insuffisance cardiaque");
    if (anyOf(cond, ["ckd", "dialysis"]) === true || (crcl !== undefined && crcl < 30)) colloidCi.push("insuffisance rénale");
    if (anyOf(cond, ["bleeding_disorder", "hemophilia", "von_willebrand"]) === true) colloidCi.push("coagulopathie");
    if (recognisedAllergens(c, catalogs.allergens).some((a) => a.allergen.id === "gelatin")) colloidCi.push("allergie aux gélatines");
    const pneumonectomy = /pneumonectom|bilobectom/.test(name);
    if (saline.length || colloidCi.length || pneumonectomy)
      add({
        id: "fluids",
        level: "info",
        title: "Remplissage : soluté à choisir",
        detail: [
          saline.length ? "NaCl 0,9 % plutôt que Ringer-lactate (attention à l'acidose hyperchlorémique en grande quantité)." : "",
          colloidCi.length ? `Colloïdes contre-indiqués (${colloidCi.join(", ")}) ; hydroxyéthylamidons : autorisation suspendue dans l'Union européenne.` : "",
          pneumonectomy ? "Pneumonectomie ou bilobectomie : restriction liquidienne — moins de 3 l de cristalloïdes sur les 24 premières heures, bilan < 20 ml/kg (œdème du poumon restant)." : "",
        ]
          .filter(Boolean)
          .join(" "),
        why: [...saline, ...colloidCi.map((x) => `colloïdes : ${x}`), pneumonectomy ? surgeryName : ""].filter(Boolean).join(" ; "),
        source: `${MANUAL}, chap. 21 (choix du soluté)`,
      });

    // Malignant hyperthermia susceptibility (chap. 23): the plan for the day.
    if (anyOf(cond, ["malignant_hyperthermia", "duchenne"]) === true) {
      const dose = p.weightKg ? Math.round(p.weightKg * 2.5) : undefined;
      add({
        id: "mh-plan",
        level: "high",
        title: "Susceptibilité à l'hyperthermie maligne : organisation",
        detail: `Premier du programme ; vaporisateurs retirés, circuit neuf rincé à l'O₂ 10 l/min pendant 20 min, filtre et chaux sodée changés ; ni halogéné ni succinylcholine. Éviter ce qui fait monter la fréquence cardiaque (kétamine, anticholinergiques, β-mimétiques, théophylline) pour ne pas mimer une crise. Crise : arrêt des halogénés, FiO₂ 100 % à 10 l/min, dantrolène 2,5 mg/kg${dose ? ` (≈ ${dose} mg, ${Math.ceil(dose / 20)} flacons de 20 mg)` : ""} à répéter jusqu'à 10 mg/kg, pas d'inhibiteur calcique.`,
        why: has(cond, "malignant_hyperthermia") ? "Antécédent : hyperthermie maligne" : "Myopathie de Duchenne / Becker",
        source: `${MANUAL}, chap. 23 (stratégie anesthésique)`,
        material: [`Dantrolène disponible${dose ? ` (${Math.ceil((p.weightKg! * 10) / 20)} flacons pour 10 mg/kg)` : ""}`],
      });
    }

    // Previous perioperative anaphylaxis (chap. 23).
    if (has(cond, "anaesthetic_allergy"))
      add({
        id: "anaphylaxis-plan",
        level: "high",
        title: "Antécédent d'anaphylaxie peranesthésique : conduite",
        detail: c.surgery.emergency
          ? "Urgence sans bilan : environnement sans latex, ALR à privilégier ; en AG, éviter les curares et les histaminolibérateurs. Une prémédication (corticoïdes, anti-H1/H2) n'empêche pas la réaction."
          : "Programmé : retrouver le protocole de l'anesthésie en cause et adresser en allergologie (produits utilisés, latex et tous les curares) avant l'intervention. Une prémédication (corticoïdes, anti-H1/H2) n'empêche pas la réaction.",
        why: "Antécédent : réaction allergique per-anesthésique",
        source: `${MANUAL}, chap. 23 (allergie et anaphylaxie)`,
        material: ["Adrénaline prête (100–200 µg IV)"],
        risk: { title: "Anaphylaxie", conduct: "Arrêt du produit suspect, O₂ 100 %, adrénaline 100–200 µg IV (300–500 µg IM), remplissage ; tryptase immédiate ; bilan allergologique à 4–6 semaines." },
      });

    // Laryngospasm (chap. 23).
    const endo = /amygdal|adenoid|vegetation|rhinoplast|septoplast|sinus|turbin|endonasal|endobuccal|ethmoid/.test(name);
    const lsRisk = [age !== undefined && age < 18 ? "enfant" : "", has(cond, "recent_uri") ? "infection des voies aériennes" : "", has(cond, "asthma") ? "asthme" : ""].filter(Boolean);
    if (general && endo && lsRisk.length)
      add({ id: "laryngospasm", level: "medium", title: "Risque de laryngospasme", detail: "Profondeur d'anesthésie suffisante à chaque stimulation ; aspiration avant l'extubation, extubation profondément endormi ou bien réveillé. Traitement : FiO₂ 100 %, arrêt des stimulations, subluxation, ventilation douce en pression positive, propofol 0,25–0,5 mg/kg ; si persistance, succinylcholine 0,1–0,3 mg/kg.", why: `${lsRisk.join(", ")} ; ${surgeryName} (chirurgie endobuccale ou endonasale)`, source: `${MANUAL}, chap. 23 (laryngospasme)` });

    // Awareness (chap. 23).
    if (general && !has(cond, "awareness") && (c.surgery.category === "F" || /cesarienne|polytrauma/.test(name)))
      add({ id: "awareness-risk", level: "info", title: "Risque de mémorisation peropératoire", detail: "Incidence 1–1,5 % en chirurgie cardiaque, 0,4 % en césarienne, bien plus chez le polytraumatisé (0,1–0,4 % ailleurs). Fraction expirée d'halogéné surveillée, éviter la curarisation totale, profondeur d'anesthésie monitorée si possible.", why: surgeryName, source: `${MANUAL}, chap. 23 (mémorisation peropératoire)`, material: ["BIS / profondeur d'anesthésie"] });

    // Hypothermia prevention (chap. 23; NICE CG65).
    if (plan && (general || techs.has("neuraxial")) && ((c.surgery.durationHours ?? 0) >= 1 || c.surgery.kce === "major" || (age !== undefined && age >= 70)))
      add({
        id: "hypothermia",
        level: "info",
        title: "Prévenir l'hypothermie",
        detail: "Réchauffer avant l'induction et couvrir en continu ; couverture à air pulsé, solutés réchauffés, bas débit de gaz frais ; température centrale monitorée (objectif ≥ 36 °C). La redistribution fait perdre 1–2 °C dès la première heure d'AG ; frissons : consommation d'O₂ jusqu'à × 4.",
        why: [(c.surgery.durationHours ?? 0) >= 1 ? `durée prévue ${n(c.surgery.durationHours!)} h` : "", c.surgery.kce === "major" ? "chirurgie majeure" : "", age !== undefined && age >= 70 ? `âge ${age} ans` : ""].filter(Boolean).join(" ; "),
        source: `NICE CG65 (hypothermie périopératoire) ; ${MANUAL}, chap. 23`,
        material: ["Couverture à air pulsé", "Réchauffeur de solutés"],
      });

    // Prolonged motor block after regional anaesthesia (chap. 24).
    if (plan && (techs.has("neuraxial") || techs.has("deep_block")))
      add({
        id: "motor-block",
        level: "info",
        title: "Récupération du bloc moteur à surveiller",
        detail: "Bloc moteur non récupéré 6 h après une anesthésie médullaire, ou 24 h après un bloc plexique ou tronculaire : imagerie en urgence (hématome épidural, syndrome des loges).",
        why: `Technique prévue : ${[techs.has("neuraxial") ? "neuraxiale" : "", techs.has("deep_block") ? "bloc profond" : ""].filter(Boolean).join(", ")}`,
        source: `${MANUAL}, chap. 24 (SSPI)`,
        risk: { title: "Bloc moteur prolongé", conduct: "> 6 h après rachianesthésie ou > 24 h après bloc plexique : IRM ou scanner en urgence (hématome épidural, syndrome des loges)." },
      });

    // Analgesia strategy by terrain (chap. 25).
    const analgesia: string[] = [];
    if (anyOf(cond, ["ckd", "dialysis"]) === true || (crcl !== undefined && crcl < 30))
      analgesia.push("insuffisance rénale : AINS proscrits ; ALR, paracétamol et métamizole ; morphine et tramadol avec prudence (métabolites actifs) — buprénorphine ou PCA de fentanyl");
    if (has(cond, "osa") || (r.stopBang.level === "high" && !has(cond, "osa")))
      analgesia.push("SAOS : ALR, paracétamol, métamizole et AINS ; opioïdes seulement en unité de surveillance continue ou sous CPAP");
    if (has(cond, "cirrhosis"))
      analgesia.push("insuffisance hépatique : AINS et paracétamol contre-indiqués ; ALR, opioïdes à doses réduites en unité de surveillance");
    if (analgesia.length)
      add({
        id: "analgesia-strategy",
        level: "medium",
        title: "Analgésie postopératoire adaptée au terrain",
        detail: analgesia.map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(". ") + ".",
        why: analgesia.map((x) => x.split(" : ")[0]).join(" ; "),
        source: `${MANUAL}, chap. 25 (cas particuliers)`,
      });
    const chronic = [has(cond, "chronic_pain") ? "douleur chronique préopératoire" : "", /thoracotom|mastectom|amputation/.test(name) ? surgeryName : ""].filter(Boolean);
    if (chronic.length)
      add({
        id: "chronic-postop-pain",
        level: "info",
        title: "Risque de douleur chronique postopératoire",
        detail: `Douleur persistante à 3 mois dans 5 à 50 % des cas selon l'intervention (sévère dans 2 à 10 %). Analgésie multimodale et ALR pour limiter la douleur aiguë, suivie de l'EVA au repos et à la mobilisation (objectif ≤ 3).${/amputation/.test(name) ? " Amputation : douleurs fantômes jusqu'à 70 % en postopératoire immédiat." : ""}`,
        why: chronic.join(" ; "),
        source: `${MANUAL}, chap. 25 (douleur chronique postopératoire)`,
      });
  }

  // --- Specialities: day case, heart, vessels, thorax, neuro, digestive (manual, chapters 26–30) -----
  {
    const techs = new Set([...(plan?.techniques ?? []), ...c.techniques]);
    const general = techs.has("general");
    const name = fold(c.surgery.name);
    const hours = c.surgery.durationHours;
    const asaClass = scores.asa ?? 0;
    const detail = (id: string, key: string) => cond[id]?.details?.[key];
    const CH = (k: number, what: string) => `${MANUAL}, chap. ${k} (${what})`;

    // Day-case surgery (chap. 26).
    if (c.surgery.setting === "ambulatory") {
      const against: string[] = [];
      if (asaClass >= 4) against.push(`ASA ${asaClass}`);
      else if (asaClass === 3) against.push("ASA 3 : seulement si stable");
      if (hours !== undefined && hours > 1.5) against.push(`durée prévue ${n(hours)} h (> 1 h 30)`);
      if (c.surgery.bleedingRisk === "high") against.push("risque hémorragique élevé");
      if (has(cond, "osa") || r.stopBang.level === "high") against.push("SAOS : premier du programme et surveillance de 5 à 8 h avant la sortie");
      add({
        id: "day-case",
        level: against.some((x) => !x.startsWith("SAOS") && !x.startsWith("ASA 3")) ? "medium" : "info",
        title: against.length ? "Ambulatoire : critères à revoir" : "Ambulatoire : consignes de sortie",
        detail: `Adulte accompagnant pour le retour et la première nuit, téléphone et soins accessibles, ni conduite ni travail pendant 24 h. Sortie : constantes comme avant l'intervention, pas de saignement, voies aériennes libres, orienté, sans nausées, miction reprise (après rachianesthésie ou chirurgie urologique), bloc médullaire levé, marche assurée. Agents de courte durée, analgésie précoce (ALR, infiltration, paracétamol, AINS) et prophylaxie des NVPO systématique.${against.length ? ` À revoir : ${against.join(" ; ")}.` : ""}`,
        why: `Intervention prévue en ambulatoire${against.length ? ` ; ${against.join(" ; ")}` : ""}`,
        source: CH(26, "chirurgie ambulatoire"),
      });
    }

    // Haemodynamic goals by heart disease (tableaux 27.1 et 27.2).
    const goals: string[] = [];
    const which = fold(String(detail("valve", "which") ?? ""));
    if (anyOf(cond, ["coronary", "stable_angina", "recent_mi", "coronary_stent", "cabg"]) === true)
      goals.push("cardiopathie ischémique — « lent, mou, normotendu » : FC basse, PAM > 80 mmHg, FC/PAM < 1, Hb > 9 g/dL, ECG 5 dérivations avec ST, halogénés à l'entretien ; ni kétamine ni thiopental");
    if (has(cond, "heart_failure"))
      goals.push("insuffisance cardiaque — précharge maintenue sans surcharge, postcharge basse, inotrope si besoin ; induction lente, semi-assise, doses divisées par deux, PAM ≥ 70 mmHg, Hb > 9 g/dL ; l'ALR n'apporte pas de bénéfice et un bloc au-dessus de T5 fait chuter le débit");
    if (has(cond, "aortic_stenosis"))
      goals.push("rétrécissement aortique — « plein, régulier, vasoconstricté » : précharge élevée, rythme sinusal lent, phényléphrine ; éviter les anesthésies médullaires");
    if (/mitral/.test(which) && /stenos|retrec/.test(which))
      goals.push("rétrécissement mitral — « ventilé, lent, vasodilaté en pulmonaire » : pas de tachycardie, vasoconstriction systémique");
    else if (/mitral/.test(which) && /prolaps/.test(which))
      goals.push("prolapsus mitral — « plein, mou, rempli » : précharge élevée, postcharge maintenue, contractilité diminuée");
    else if (/mitral/.test(which))
      goals.push("insuffisance mitrale — « ventilé, tonique, vasodilaté » : normovolémie, postcharge basse, légère tachycardie");
    if (/aortique/.test(which) && /insuff|fuite|regurg/.test(which))
      goals.push("insuffisance aortique — « plein, rapide, vasodilaté » : pas de bradycardie ni de vasoconstricteur artériel");
    if (has(cond, "hcm"))
      goals.push("cardiomyopathie obstructive — « plein, mou, fermé » : précharge élevée, vasoconstriction, bêtabloquant ; les anesthésies médullaires aggravent l'obstruction");
    if (has(cond, "pericarditis"))
      goals.push("tamponnade ou constriction — « plein, rapide, fermé » : ventilation spontanée jusqu'à la décompression si la PA baisse au Valsalva ; étomidate et séquence rapide");
    if (has(cond, "pulmonary_hypertension"))
      goals.push("hypertension pulmonaire — ne jamais laisser la PA systémique descendre sous la PAP : noradrénaline, FiO₂ élevée, PaCO₂ 25–30 mmHg, PEP < 5, analgésie ; étomidate ; ni kétamine, ni desflurane, ni N₂O ; rachianesthésie déconseillée (péridurale possible)");
    if (goals.length)
      add({
        id: "hemodynamic-goals",
        level: "info",
        title: "Objectifs hémodynamiques",
        detail: goals.map((g) => g.charAt(0).toUpperCase() + g.slice(1)).join(". ") + ".",
        why: goals.map((g) => g.split(" — ")[0]).join(" ; "),
        source: CH(27, "tableaux 27.1 et 27.2"),
      });

    // Hypertension before induction (chap. 27).
    if ((p.sbp !== undefined && p.sbp >= 180) || (p.dbp !== undefined && p.dbp >= 110))
      add({
        id: "bp-180",
        level: "medium",
        title: `PA ${p.sbp ?? "?"}/${p.dbp ?? "?"} mmHg : rechercher une atteinte d'organe`,
        detail: "Sous 180/110, l'intervention peut avoir lieu. Au-delà, elle reste possible sans atteinte des organes cibles (SCA, décompensation, encéphalopathie, AVC) ; contrôler la pression habituelle auprès du médecin traitant. La labilité tensionnelle est plus dangereuse que la valeur : rester à ± 20 % des valeurs habituelles.",
        why: `PA mesurée à la consultation ${p.sbp ?? "?"}/${p.dbp ?? "?"} mmHg`,
        source: CH(27, "hypertension artérielle"),
      });

    // Vascular and cardiac surgery (chap. 27).
    if (/endarteriectomie|carotid/.test(name))
      add({ id: "carotid-surgery", level: "info", title: "Endartériectomie carotidienne", detail: "ALR (bloc cervical superficiel ou profond) : surveillance neurologique au clampage (30–40 min) et shunt seulement si besoin ; si déficit, PAM + 20 % puis shunt ; convulsions ou coma : anesthésie générale. Cathéter artériel, ECG 5 dérivations ; après : hyperperfusion (contrôle tensionnel) et hématome cervical.", why: surgeryName, source: CH(27, "endartériectomie carotidienne"), material: ["Cathéter artériel"] });
    if (/aort|anevrisme|evar|tevar|endoprothese/.test(name) && !/valv|tavi/.test(name) && c.surgery.category !== "D") {
      const seg = /crosse/.test(name) ? "crosse" : /thoraco-?abdo|descendante|thoracique|tevar/.test(name) ? "descendante" : /ascendante|bentall/.test(name) ? "ascendante" : "abdominale";
      const endo = /endoprothese|evar|tevar|endovasc/.test(name);
      const text: Record<string, string> = {
        ascendante: "CEC ; précharge normale, postcharge abaissée, bêtabloquant, éviter la bradycardie. Cathéters fémoral et radial droit (clampage du tronc brachiocéphalique).",
        crosse: "Hypothermie profonde et arrêt circulatoire (< 20–30 min) : perfusion cérébrale continue, légère hyperventilation, PAM 80 mmHg. Cathéters radial droit et fémoral droit.",
        descendante: "Clampage : PAM proximale 70–80 mmHg (esmolol, pas de vasodilatateur), distale 60–70 mmHg (CEC partielle) ; protection médullaire (drainage du LCR, normoglycémie, hypothermie modérée). Cathéter radial droit (jamais gauche) et fémoral droit, sonde à double lumière, pas de péridurale.",
        abdominale: "Clampage infrarénal bien toléré ; hypotension au déclampage (remplissage, vasopresseur). PAM 80 mmHg, normovolémie, pas d'anémie ; AG + péridurale thoracique. Cathéter radial.",
      };
      add({
        id: "aortic-surgery",
        level: "info",
        title: endo ? "Endoprothèse aortique" : `Chirurgie de l'aorte ${seg === "crosse" ? "(crosse)" : seg}`,
        detail: endo
          ? `Abdominale : sédation-analgésie possible ; thoracique ou hybride : AG (ETO). PAM abaissée vers 50 mmHg au déploiement. Risques : fuite, néphropathie au contraste, ischémie médullaire.`
          : `${text[seg]} Deux voies de gros calibre, voie centrale, sonde urinaire, ETO.`,
        why: surgeryName,
        source: CH(27, "chirurgie aortique, tableau 27.6"),
        material: endo ? ["Cathéter artériel"] : ["Cathéter artériel", "Voie veineuse centrale", "ETO"],
      });
    }
    if (c.surgery.category === "F" && !/tavi|percutan|mitraclip|clip/.test(name)) {
      const swan = [
        detail("heart_failure", "ef") === "severe" || detail("heart_failure", "ef") === "ref" ? "FE basse" : "",
        cond.valve?.severe || detail("valve", "severity") === "severe" ? "valvulopathie sévère" : "",
        has(cond, "pulmonary_hypertension") ? "hypertension pulmonaire" : "",
        anyOf(cond, ["dialysis", "home_o2"]) === true ? "comorbidité grave (dialyse, BPCO sévère)" : "",
      ].filter(Boolean);
      add({
        id: "cpb",
        level: "info",
        title: "Chirurgie sous CEC : préparation",
        detail: `ECG 5 dérivations, deux voies périphériques, voie centrale multilumière, cathéter artériel, sonde urinaire, températures œsophagienne et vésicale, ETO${swan.length ? ` ; Swan-Ganz à discuter (${swan.join(", ")})` : ""}. Pas de N₂O. Acide tranexamique 15 mg/kg avant l'ouverture du péricarde ; héparine 300–400 UI/kg (ACT > 400 s) ; protamine 1 mg/100 UI. Reprise chirurgicale si drains > 500 ml la 1re heure ou > 300 ml/h pendant 3 h.`,
        why: surgeryName,
        source: CH(27, "stratégie anesthésique en CEC"),
        material: ["Cathéter artériel", "Voie veineuse centrale", "ETO"],
      });
    }
    if (/tavi|mitraclip|clip mitral/.test(name))
      add({ id: "structural", level: "info", title: /tavi/.test(name) ? "TAVI" : "Plastie mitrale percutanée", detail: /tavi/.test(name) ? "Voie fémorale : sédation-analgésie habituelle ; voie transapicale (mini-thoracotomie) : anesthésie générale. Risques : lésion artérielle, AVC." : "Anesthésie générale (ETO indispensable), peu stimulante : réveil rapide ; objectifs de l'insuffisance mitrale (précharge maintenue, postcharge basse, pas de bradycardie).", why: surgeryName, source: CH(27, "procédures structurelles") });

    // Thoracic surgery (chap. 28).
    const lungResection = /lobectom|pneumonectom|segmentectom|wedge|bilobectom|thoracotom|decortication|pleurectom/.test(name);
    const olv = lungResection || /oesophagectom|œsophagectom|aorte thoracique|thoracoscop/.test(name) || (c.surgery.category === "G" && c.surgery.incision === "intrathoracic");
    if (olv)
      add({
        id: "one-lung",
        level: "info",
        title: "Ventilation unipulmonaire",
        detail: `Sonde à double lumière gauche${p.sex ? ` ${p.sex === "M" ? "39–41" : "35–37"} F` : " (39–41 F homme, 35–37 F femme)"}, repère ≈ 29 cm, position contrôlée au fibroscope (bloqueur bronchique si contre-indication). Vt 6–8 ml/kg, PEP 3–4, pression de plateau < 25, FiO₂ 0,5–0,8, pression contrôlée, hypercapnie tolérée. Hypoxémie : FiO₂ 1, position de la sonde, CPAP 5–10 sur le poumon exclu, recrutement. Perfusions < 3 l et bilan < 20 ml/kg sur 24 h ; péridurale ou bloc paravertébral.${lungResection ? " Résection : VEMS prédit postopératoire = VEMS × (1 − segments réséqués/19) ; > 40 % faible risque, < 30 % abstention (avec la DLCO et la VO₂max)." : ""}`,
        why: surgeryName,
        source: CH(28, "chirurgie thoracique"),
        material: ["Sonde à double lumière", "Fibroscope"],
      });

    // Laparoscopy, laparotomy, liver, oesophagus (chap. 30).
    if (/coelioscop|cœlioscop|laparoscop|robot/.test(name)) {
      const ci = [has(cond, "raised_icp") ? "hypertension intracrânienne (absolue)" : "", has(cond, "heart_failure") ? "insuffisance cardiaque" : "", anyOf(cond, ["ckd", "dialysis"]) === true ? "insuffisance rénale" : "", has(cond, "vp_shunt") ? "dérivation ventriculopéritonéale" : "", /foramen|fop/.test(fold(p.history ?? "")) ? "foramen ovale perméable" : ""].filter(Boolean);
      if (ci.length)
        add({ id: "laparoscopy-ci", level: ci[0].includes("absolue") ? "high" : "medium", title: "Cœlioscopie : contre-indication", detail: "Pneumopéritoine (PIA ≤ 12–15 mmHg) : baisse du retour veineux et du débit, hypercapnie, hausse de la PIC ; Trendelenburg. L'hypertension intracrânienne est une contre-indication absolue ; insuffisance cardiaque, insuffisance rénale, FOP, hypovolémie et dérivation ventriculopéritonéale sont relatives.", why: ci.join(" ; "), source: CH(30, "laparoscopie") });
    }
    if (c.surgery.incision === "upper_abdominal" || /laparotom|hepatectom|whipple|duodenopancreat|gastrectom|oesophagectom|œsophagectom/.test(name)) {
      const liver = /hepatectom/.test(name);
      const oeso = /oesophagectom|œsophagectom/.test(name);
      const rate = oeso ? [2, 3] : [2, 6];
      add({
        id: "laparotomy",
        level: "info",
        title: liver ? "Hépatectomie" : oeso ? "Œsophagectomie" : "Laparotomie",
        detail: `AG + péridurale thoracique ; voies de gros calibre, sonde gastrique et urinaire, monitorage dynamique de la volémie. Apports restrictifs ${rate[0]}–${rate[1]} ml/kg/h${p.weightKg ? ` (≈ ${Math.round(rate[0] * p.weightKg)}–${Math.round(rate[1] * p.weightKg)} ml/h)` : ""} : la surcharge augmente les complications.${liver ? " PVC basse pendant la transsection, clampages de 15–20 min entrecoupés de 5–10 min de reperfusion, produits sanguins prêts ; 70 % d'un foie sain résécable, 50 % d'un foie cirrhotique." : ""}${oeso ? " Sonde à double lumière si thoracotomie ouverte ; réanimation après l'intervention." : ""} Réhabilitation améliorée : boissons sucrées jusqu'à 2 h avant, épargne morphinique, mobilisation et réalimentation précoces.`,
        why: surgeryName,
        source: CH(30, liver ? "chirurgie hépatique" : oeso ? "œsophagectomie" : "laparotomie"),
      });
    }

    // Neurosurgery (chap. 29).
    if (c.surgery.category === "D") {
      const awake = /vigile|eveille|stimulation cerebrale|stereotax|parkinson|biopsie/.test(name);
      const spine = /rachi|laminect|arthrodese|hernie discale|discectom|vertebr/.test(name);
      const pituitary = /hypophys|transsphenoid/.test(name);
      add({
        id: "neurosurgery",
        level: "info",
        title: awake ? "Chirurgie stéréotaxique ou vigile" : spine ? "Chirurgie du rachis" : pituitary ? "Chirurgie de l'hypophyse" : "Neurochirurgie intracrânienne",
        detail: awake
          ? "Aucun anxiolytique, sédatif ni opioïde en prémédication : la coopération du patient est nécessaire. Sédation consciente (propofol–rémifentanil ou dexmédétomidine) ou endormi-éveillé-endormi, bloc du scalp à l'AL de longue durée."
          : spine
            ? "Rachis cervical instable : intubation sans flexion (vidéolaryngoscope ou fibroscope). Potentiels évoqués moteurs : propofol en continu, pas de curare. Décubitus ventral (voir l'installation)."
            : pituitary
              ? "Traitement endocrinien poursuivi ; substitution cortisonique : hydrocortisone 100 mg. Intubation difficile possible (Cushing, acromégalie). Voie transsphénoïdale (vasoconstricteurs) ; après : diabète insipide ou SIADH."
              : "Pas de prémédication sédative si HTIC. Tête surélevée de 30°, sans rotation ni compression jugulaire ; propofol à l'entretien (sévoflurane possible), pas de N₂O ni de dérivés nitrés ; NaCl 0,9 %, jamais de glucosé ; PaCO₂ 35–40 (32–35 si besoin), PEP ≤ 5 ; mannitol après l'ouverture de la dure-mère ; prophylaxie anticomitiale en sus-tentoriel ; réveil au bloc pour l'examen neurologique.",
        why: surgeryName,
        source: CH(29, "spécificités de la neuroanesthésie"),
        material: awake || spine || pituitary ? undefined : ["Cathéter artériel", "BIS / profondeur d'anesthésie"],
      });
    }
    if (/sismotherap|electroconvuls|electrochoc/.test(name)) {
      const ci = [has(cond, "raised_icp") ? "hypertension intracrânienne (absolue)" : "", anyOf(cond, ["stable_angina", "recent_mi"]) === true ? "angor" : "", has(cond, "heart_failure") ? "insuffisance cardiaque" : "", has(cond, "glaucoma") ? "glaucome" : ""].filter(Boolean);
      add({ id: "ect", level: ci.some((x) => x.includes("absolue")) ? "high" : "info", title: "Électroconvulsivothérapie", detail: `Protège-dents, garrot sur un bras (observer la crise), propofol ou étomidate (abaisse le seuil) puis succinylcholine ; ventilation au masque et hyperventilation ; crise > 90–120 s : petite dose d'hypnotique. Phase tonique vagale puis décharge sympathique.${ci.length ? ` Contre-indication : ${ci.join(", ")}.` : ""}`, why: surgeryName + (ci.length ? ` ; ${ci.join(", ")}` : ""), source: CH(29, "électroconvulsivothérapie") });
    }

    // Neuromuscular and neurodegenerative diseases (chap. 29).
    const neuro: string[] = [];
    if (has(cond, "myasthenia")) neuro.push("myasthénie : curares non dépolarisants à 1/10–1/5 de la dose avec monitorage ; ventilation postopératoire si maladie ≥ 6 ans, pyridostigmine > 750 mg/j, CV < 40 ml/kg ou pneumopathie associée ; aggravent : morphine, magnésium, benzodiazépines, aminosides, anticalciques");
    if (has(cond, "lambert_eaton")) neuro.push("Lambert-Eaton : sensibilité à tous les curares (besoins − 50 à 70 %)");
    if (has(cond, "myotonic_dystrophy")) neuro.push("dystrophie myotonique : ni étomidate ni succinylcholine, éviter la décurarisation, pas de sédation, métoclopramide en prémédication ; ECG ± échographie et EFR");
    if (has(cond, "parkinson")) neuro.push("Parkinson : traitement poursuivi le matin ; éviter atropine (glycopyrrolate), métoclopramide, dropéridol ; PA instable sous lévodopa");
    if (has(cond, "cognitive")) neuro.push("démence : éviter midazolam et atropine (glycopyrrolate)");
    if (has(cond, "multiple_sclerosis")) neuro.push("sclérose en plaques : éviter l'hyperthermie ; rachianesthésie à discuter (poussée), péridurale possible");
    if (neuro.length)
      add({
        id: "neuro-disease",
        level: "medium",
        title: "Maladie neurologique : conduite anesthésique",
        detail: neuro.map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(". ") + ".",
        why: neuro.map((x) => x.split(" : ")[0]).join(" ; "),
        source: CH(29, "maladies neuromusculaires et neurodégénératives"),
      });

    // Obstructive lung disease and smoking (chap. 28).
    if (anyOf(cond, ["copd", "asthma", "bronchiectasis", "cystic_fibrosis"]) === true && (general || !techs.size))
      add({ id: "obstructive", level: "info", title: "Maladie obstructive : conduite", detail: "Exclure une surinfection, aérosols avant l'induction ; propofol (ou kétamine), lidocaïne 1,5 mg/kg avant l'intubation ; halogénés à l'entretien ; pas d'histaminolibérateurs (morphine, atracurium, mivacurium) ; FR 8–10, I/E 1/3 à 1/4, hypercapnie tolérée ; pas de N₂O si bulles d'emphysème ; ALR périphérique à privilégier, anesthésies médullaires discutées ; corticothérapie ≥ 5 mg/j de prednisone : supplément (méthylprednisolone 125 mg).", why: ["copd", "asthma", "bronchiectasis", "cystic_fibrosis"].filter((x) => has(cond, x)).map((x) => catalogs.conditions.find((k) => k.id === x)?.label ?? x).join(", "), source: CH(28, "maladies pulmonaires obstructives") });

    // Cirrhosis (chap. 30).
    if (has(cond, "cirrhosis")) {
      const child = detail("cirrhosis", "child");
      add({
        id: "cirrhosis-plan",
        level: child === "c" || child === "b" ? "high" : "medium",
        title: `Cirrhose${child ? ` Child ${String(child).toUpperCase()}` : ""} : conduite`,
        detail: `Mortalité en chirurgie abdominale ≈ 10 % (Child A), 30 % (B), 80 % (C). Pas de prémédication sédative ; atracurium, cisatracurium ou rocuronium avec sugammadex ; sévoflurane ou desflurane ; doses d'opioïdes réduites ; éviter hypotension, hypovolémie et pressions de ventilation élevées ; vasopresseur souvent nécessaire (état hyperdynamique) ; produits sanguins selon le bilan, calcium surveillé si transfusion ; ascite évacuée : 20 g d'albumine par litre ; glycémie.`,
        why: `Cirrhose${child ? ` (Child ${String(child).toUpperCase()})` : " — préciser le Child-Pugh à l'étape Antécédents"}`,
        source: CH(30, "cirrhose, tableau 30.2"),
      });
    }
  }

  // --- Kidney, electrolytes, endocrine, blood (manual, chapters 31–35) ------------------------------
  {
    const name = fold(c.surgery.name);
    const CH = (k: number, what: string) => `${MANUAL}, chap. ${k} (${what})`;
    const crcl = scores.derived.crcl;

    // Renal failure (chap. 31).
    if (has(cond, "dialysis") || has(cond, "ckd") || (crcl !== undefined && crcl < 30))
      add({
        id: "renal-plan",
        level: has(cond, "dialysis") ? "medium" : "info",
        title: has(cond, "dialysis") ? "Dialyse : conduite" : "Insuffisance rénale : conduite",
        detail: `${has(cond, "dialysis") ? "Date de la dernière séance, poids sec, kaliémie après la dialyse ; bras de la fistule : ni perfusion ni brassard. " : ""}Chirurgie programmée reportée si K⁺ > 5,5–6 mmol/l. Pas de succinylcholine si hyperkaliémie (rocuronium) ; atracurium et cisatracurium sans ajustement, vécuronium réduit ; morphine et oxycodone s'accumulent (préférer fentanyl, sufentanil, rémifentanil) ; NaCl 0,9 % plutôt que Ringer-lactate ; pression de perfusion rénale maintenue ; pas d'hypoventilation au réveil (hyperkaliémie). Transfusion : allo-immunisation chez un candidat à la greffe.`,
        why: [has(cond, "dialysis") ? "dialyse" : "", has(cond, "ckd") ? "insuffisance rénale chronique" : "", crcl !== undefined && crcl < 30 ? `clairance ${Math.round(crcl)} ml/min` : ""].filter(Boolean).join(" ; "),
        source: CH(31, "implications anesthésiques de l'insuffisance rénale"),
      });
    if (/angio|emboli|coronarograph|evar|tevar|endoprothese|tavi|stent/.test(name) && (anyOf(cond, ["ckd", "diabetes_oral", "diabetes_insulin", "heart_failure"]) === true || (crcl !== undefined && crcl < 60)))
      add({ id: "contrast-kidney", level: "info", title: "Néphropathie aux produits de contraste : prévention", detail: "Dose de contraste réduite (produit iso-osmolaire), hydratation (500 ml de NaCl 0,9 % avant), suspension des néphrotoxiques (IEC, diurétiques, AINS) ; créatinine à 24–48 h.", why: `${surgeryName} ; ${[anyOf(cond, ["ckd"]) ? "insuffisance rénale" : "", anyOf(cond, ["diabetes_oral", "diabetes_insulin"]) ? "diabète" : "", has(cond, "heart_failure") ? "insuffisance cardiaque" : "", crcl !== undefined && crcl < 60 ? `clairance ${Math.round(crcl)} ml/min` : ""].filter(Boolean).join(", ")}`, source: CH(31, "néphropathie aux produits de contraste") });

    // Urological surgery (chap. 31).
    const uro = /resection.*prostat|rtup|turp|resection endoscopique de (la )?prostate/.test(name)
      ? { title: "Résection endoscopique de la prostate", text: "Rachianesthésie de choix (détecte perforation, SCA, syndrome de résection). Poche d'irrigation ≤ 60 cm au-dessus de la vessie, durée idéalement < 60 min ; natrémie si > 60 min ou signes (céphalées, agitation, confusion). Syndrome de résection : arrêter, restriction hydrique, furosémide, NaCl hypertonique si Na < 120 mmol/l. ECBU négatif avant." }
      : /resection.*vessie|rtuv|turb/.test(name)
        ? { title: "Résection endoscopique de vessie", text: "Rachianesthésie au-dessus de T10 ; bloc obturateur si la tumeur est sur la paroi latérale (adduction brutale de la cuisse)." }
        : /prostatectomie/.test(name) && /robot|coelio|cœlio|laparoscop/.test(name)
          ? { title: "Prostatectomie robotique", text: "Trendelenburg à 30° prolongé : œdème des voies aériennes (test de fuite), plexus brachial, yeux (neuropathie optique) ; cœlioscopie longue." }
          : /cystectomie/.test(name)
            ? { title: "Cystectomie", text: "4–6 h, pertes sanguines importantes : cathéter artériel, voie centrale ; péridurale démarrée après la dérivation urinaire (le bloc sympathique contracte l'intestin) ; acidose hyperchlorémique possible." }
            : /transplantation renale|greffe renale/.test(name)
              ? { title: "Transplantation rénale", text: "Kaliémie < 5,5 mmol/l ; cisatracurium ou rocuronium ; voie centrale ; mannitol après les anastomoses ; pas de ponction ni de brassard sur une fistule." }
              : /nephrectomie/.test(name) && /thrombus|cave/.test(name)
                ? { title: "Néphrectomie avec thrombus cave", text: "Pertes sanguines importantes, hypotension au clampage ou à la rétraction de la veine cave ; CEC si le thrombus atteint l'oreillette ; cathéter artériel, voie centrale, péridurale." }
                : null;
    if (uro) add({ id: "urology", level: "info", title: uro.title, detail: uro.text, why: surgeryName, source: CH(31, "chirurgie urologique") });

    // Electrolytes (chap. 32).
    const lytes: string[] = [];
    if (p.potassium !== undefined && p.potassium > 5.5) lytes.push(`K⁺ ${n(p.potassium)} : pas de succinylcholine ni de soluté potassique (Ringer-lactate), corriger l'acidose, légère hyperventilation, curares potentialisés${p.potassium > 6 ? " ; > 6 mmol/l : traiter (calcium, insuline-glucose) et reporter une chirurgie programmée" : ""}`);
    if (p.potassium !== undefined && p.potassium < 3.5) lytes.push(`K⁺ ${n(p.potassium)} : pas de soluté glucosé ni d'hyperventilation, curares −20 à 25 %${p.potassium < 3 ? " ; < 3 mmol/l : corriger avant une chirurgie programmée" : ""}`);
    if (p.sodium !== undefined && p.sodium < 130) lytes.push(`Na⁺ ${p.sodium} : < 130 mmol/l, chirurgie programmée à différer ; correction ≤ 8 mmol/l par 24 h (démyélinisation osmotique)`);
    if (p.sodium !== undefined && p.sodium > 150) lytes.push(`Na⁺ ${p.sodium} : > 150 mmol/l, chirurgie programmée à différer ; hypovolémie probable (doses réduites)`);
    if (lytes.length)
      add({ id: "electrolytes", level: lytes.some((x) => /reporter|différer|corriger avant/.test(x)) ? "high" : "medium", title: "Trouble électrolytique : conduite", detail: lytes.map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(". ") + ".", why: lytes.map((x) => x.split(" : ")[0]).join(" ; "), source: CH(32, "implications anesthésiques") });

    // Endocrine (chap. 34).
    if (/thyroid/.test(name))
      add({ id: "thyroid-surgery", level: "info", title: "Chirurgie thyroïdienne", detail: "Euthyroïdie obligatoire avant une chirurgie programmée. Intubation difficile si la trachée est déviée ou comprimée ; sonde armée (trachéomalacie) ou sonde avec électrodes de monitorage du récurrent. Éviter anticholinergiques et kétamine ; phényléphrine plutôt qu'éphédrine ; protéger les yeux (exophtalmie). Après : hématome compressif, paralysie récurrentielle, hypocalcémie (laryngospasme), crise thyréotoxique.", why: surgeryName, source: CH(34, "chirurgie de la thyroïde") });
    if (has(cond, "pheochromocytoma"))
      add({ id: "pheo-plan", level: "high", title: "Phéochromocytome : préparation", detail: "Alphabloquant d'abord (prazosine, progressivement, apports hydriques suffisants), puis bêtabloquant (labétalol 2 à 10 jours avant) — jamais l'inverse. Cathéter artériel avant l'induction. Proscrits : kétamine, éphédrine, succinylcholine, anticholinergiques, histaminolibérateurs (atracurium, morphine). Poussée hypertensive : nitroprussiate, nicardipine, urapidil, phentolamine ; hypotension après l'exérèse : catécholamines. 50 % restent hypertendus quelques jours.", why: "Antécédent : phéochromocytome", source: CH(34, "phéochromocytome"), material: ["Cathéter artériel", "Nicardipine ou nitroprussiate prêts", "Noradrénaline prête"] });
    if (has(cond, "carcinoid"))
      add({ id: "carcinoid-plan", level: "medium", title: "Tumeur carcinoïde : préparation", detail: "Normovolémie (diarrhées), octréotide 50 µg SC 2×/j avant, jusqu'à 500 µg 3×/j ; crise : somatostatine 150–200 µg/h. Aérosol de β2-mimétique ; propofol, pas d'histaminolibérateurs (morphine, thiopental, mivacurium, atracurium) ; anticholinergiques avec prudence. Rechercher une atteinte tricuspide ou pulmonaire.", why: "Antécédent : tumeur carcinoïde", source: CH(34, "syndrome carcinoïde"), material: ["Octréotide prêt"] });
    {
      const EQ: Record<string, number> = { H02AB07: 1, H02AB06: 1, H02AB04: 1.25, H02AB02: 6.67, H02AB09: 0.25, H02AB01: 6.67 };
      const steroids = c.treatments.filter((t) => t.atc.startsWith("H02AB"));
      if (steroids.length) {
        const known = steroids.filter((t) => t.dailyDoseMg !== undefined && EQ[t.atc.slice(0, 7)] !== undefined);
        const pred = Math.round(known.reduce((sum, t) => sum + t.dailyDoseMg! * EQ[t.atc.slice(0, 7)], 0) * 10) / 10;
        const enough = pred >= 5;
        if (enough || known.length < steroids.length)
          add({
            id: "steroid-cover",
            level: enough ? "medium" : "info",
            title: enough ? `Corticothérapie ≈ ${n(pred)} mg/j d'équivalent prednisone : couverture` : "Corticothérapie : dose à préciser",
            detail: "À partir de 5 mg/j de prednisone (dans les 12 mois) : hydrocortisone 100 mg à l'induction puis couverture selon l'importance de la chirurgie (manuel : 100 mg toutes les 8 h pendant une semaine si insuffisance surrénale ; recommandations plus récentes : 100 mg à l'induction puis 200 mg/24 h). Éviter l'étomidate. Hypotension postopératoire inexpliquée : penser à l'insuffisance surrénale. Équivalences : hydrocortisone 20 = prednisolone 5 = méthylprednisolone 4 = dexaméthasone 0,75 mg.",
            why: steroids.map((t) => `${t.name}${t.dailyDoseMg !== undefined ? ` ${t.dailyDoseMg} mg/j` : " (dose ?)"}`).join(", "),
            source: `${CH(34, "tableau 34.1")} ; Association of Anaesthetists 2020 (glucocorticoïdes périopératoires)`,
            material: enough ? ["Hydrocortisone 100 mg"] : undefined,
          });
      }
    }
    if (has(cond, "diabetes_insulin"))
      add({ id: "diabetes-plan", level: "info", title: "Diabète insulinotraité : le jour de l'intervention", detail: `Premier du programme ; moitié de la dose d'insuline basale, glycémie capillaire le matin puis au bloc ; objectif < 10 mmol/l (180 mg/dl) sans hypoglycémie ; insuline IV (ex. glucose 10 % 500 ml + KCl 10 mmol + 15 UI d'insuline rapide en 6 h) si chirurgie modérée ou majeure. Gastroparésie : métoclopramide ou érythromycine 200 mg IV, séquence rapide ; rechercher une dysautonomie (hypotension à l'induction).${p.hba1c !== undefined ? ` Cible glycémique selon l'HbA1c (chap. 49) : ${p.hba1c < 7 ? "4,4–7,8 mmol/l (80–140 mg/dl)" : "6,1–8,9 mmol/l (110–160 mg/dl)"} ; éviter > 10 mmol/l et l'hypoglycémie.` : ""}`, why: `Diabète insulinotraité${p.hba1c !== undefined ? ` ; HbA1c ${n(p.hba1c)} %` : ""}`, source: `${CH(34, "diabète, implications anesthésiques")} ; chap. 49 (contrôle glycémique)` });

    // Blood (chap. 35).
    if (plan && c.surgery.bleedingRisk === "high" && p.weightKg)
      add({ id: "blood-products", level: "info", title: "Produits sanguins : repères", detail: `1 CGR ≈ +1 g/dl d'Hb ; plaquettes : 1 unité standard par 7–10 kg (≈ ${Math.ceil(p.weightKg / 10)}–${Math.ceil(p.weightKg / 7)} unités, +20 G/l) ou 1 aphérèse ; PFC 10–15 ml/kg (≈ ${Math.round(p.weightKg * 10)}–${Math.round(p.weightKg * 15)} ml) ; transfusion massive : 1 PFC pour 1 CGR au-delà de 4–5 CGR, calcium ionisé, réchauffeur. Récupération de sang peropératoire si pas d'infection ni de cancer.`, why: `${surgeryName} (risque hémorragique élevé), ${p.weightKg} kg`, source: CH(35, "produits sanguins") });
    if (has(cond, "sickle_cell"))
      add({ id: "sickle-plan", level: "high", title: "Drépanocytose : préparation", detail: "Avis hématologique : transfusion préopératoire au cas par cas (Hb ≥ 10 g/dl et HbS < 30 % pour une chirurgie majeure), phénotype étendu. Perfusion pendant le jeûne ; éviter hypothermie, acidose, hypovolémie et hypoxémie ; pas de garrot si possible ; cathéter artériel et température centrale pour une chirurgie importante ; ALR sans adrénaline ; thromboprophylaxie.", why: "Antécédent : drépanocytose", source: CH(35, "drépanocytose") });
    if (has(cond, "thalassemia"))
      add({ id: "thalassemia-plan", level: "info", title: "Thalassémie : préparation", detail: "Besoin transfusionnel, fonction cardiaque (hémochromatose) et hémostase ; intubation difficile possible (hypertrophie des maxillaires) ; fragilité osseuse à l'installation.", why: "Antécédent : thalassémie", source: CH(35, "thalassémies") });
    if (has(cond, "porphyria"))
      add({ id: "porphyria-plan", level: "high", title: "Porphyrie hépatique : médicaments", detail: "Autorisés : propofol, sévoflurane, desflurane, tous les curares, morphine, fentanyl et dérivés, lidocaïne, bupivacaïne, néostigmine, atropine, naloxone. À éviter : thiopental, étomidate, kétamine, prilocaïne, mépivacaïne, diclofénac, ibuprofène, kétorolac, tramadol, diazépam, clonidine, urapidil, amiodarone, phénytoïne… Vérifier chaque produit (listes discordantes : orpha.net) ; hydratation et glucose 10 % ; hémine en cas de crise.", why: "Antécédent : porphyrie", source: CH(35, "porphyries") });
    if (anyOf(cond, ["von_willebrand", "hemophilia"]) === true)
      add({ id: "haemostasis-disorder", level: "high", title: has(cond, "hemophilia") ? "Hémophilie : préparation" : "Maladie de Willebrand : préparation", detail: has(cond, "hemophilia") ? `Avis hématologique ; facteur VIII ou IX à 40–70 % avant l'intervention (1 UI/kg élève le taux de 1 %${p.weightKg ? ` : ≈ ${Math.round(p.weightKg * 40)}–${Math.round(p.weightKg * 70)} UI depuis un taux nul` : ""}) ; desmopressine pour l'hémophilie A légère ; inhibiteur : facteur VIIa recombinant ou FEIBA ; le PFC n'est pas indiqué. ALR à peser soigneusement.` : "Avis hématologique ; type I : desmopressine 0,3 µg/kg en 20 min, 1 h avant (contre-indiquée dans le sous-type IIB) ; sinon facteur Willebrand ± facteur VIII. ALR : au moindre doute, s'abstenir.", why: has(cond, "hemophilia") ? "Antécédent : hémophilie" : "Antécédent : maladie de Willebrand", source: CH(35, "pathologies de l'hémostase") });
    if (has(cond, "hit_history"))
      add({ id: "hit-plan", level: "high", title: "Antécédent de TIH : pas d'héparine", detail: "Aucune héparine (HNF, HBPM, rinçages, circuits héparinés, certains complexes prothrombiniques). Alternatives : fondaparinux ou AOD si stable ; argatroban ou bivalirudine si instable ou à risque hémorragique (argatroban seul si clairance < 30). TIH aiguë : seulement les urgences, sous AG ; pas de transfusion de plaquettes.", why: "Antécédent : thrombopénie induite par l'héparine", source: CH(35, "TIH") });
  }

  // --- Obstetrics, paediatrics, eye, ENT, orthopaedics (manual, chapters 36–40) ---------------------
  {
    const name = fold(c.surgery.name);
    const CH = (k: number, what: string) => `${MANUAL}, chap. ${k} (${what})`;
    const urgency = urgencyOf(c.surgery);
    const age = p.age;
    const w = p.weightKg;
    const caesarean = /cesarienne/.test(name);
    const detailOf = (id: string, key: string) => cond[id]?.details?.[key];
    const onAntithrombotic = c.treatments.some((t) => t.atc.startsWith("B01A"));

    // Pregnancy, non-obstetric surgery (chap. 36).
    if (has(cond, "pregnancy") && c.surgery.name && !caesarean && !/accouchement|cerclage|curetage|ivg|interruption de grossesse|extra-uterine/.test(name)) {
      const weeks = Number(detailOf("pregnancy", "weeks"));
      const sa = Number.isFinite(weeks) && weeks > 0 ? weeks : undefined;
      const trimester = sa === undefined ? undefined : sa < 14 ? 1 : sa < 28 ? 2 : 3;
      add({
        id: "pregnancy-plan",
        level: "high",
        title: `Grossesse${sa ? ` (${sa} SA, ${trimester === 1 ? "1er" : `${trimester}e`} trimestre)` : ""} : chirurgie non obstétricale`,
        detail: [
          urgency === "elective"
            ? "Chirurgie programmée déconseillée pendant la grossesse : reporter après l'accouchement si possible ; si l'urgence n'est que relative, préférer le 2e trimestre (organogenèse entre 5 et 12 SA, accouchement prématuré au 3e)."
            : "Prévenir l'obstétricien : tocolyse et CTG périopératoires selon son avis.",
          "ALR à privilégier.",
          sa === undefined || sa >= 15 ? "Dès 15 SA : estomac plein (induction en séquence rapide) et inclinaison latérale gauche." : "",
          sa === undefined || sa < 14 ? "1er trimestre : pas de protoxyde d'azote." : "",
          "Traiter toute hypotension (phényléphrine), normoventilation (l'hyperventilation diminue le débit utéroplacentaire), bonne oxygénation. Agents éprouvés : propofol, thiopental, fentanyl, succinylcholine, rocuronium, vécuronium, sévoflurane. Cœlioscopie possible à tout terme.",
        ]
          .filter(Boolean)
          .join(" "),
        why: `Grossesse${sa ? ` de ${sa} SA` : ""} ; ${surgeryName}`,
        source: CH(36, "intervention chirurgicale durant la grossesse"),
      });
    }

    // Caesarean section (chap. 36).
    if (caesarean) {
      const rhNeg = detailOf("pregnancy", "rhesus") === "neg";
      const pe = has(cond, "preeclampsia") === true;
      add({
        id: "caesarean",
        level: "medium",
        title: "Césarienne : conduite",
        detail: [
          "Rachianesthésie de référence (bupivacaïne hyperbare 0,5 % 10 mg + fentanyl 20 µg + morphine 100 µg) ; cathéter péridural en place : ropivacaïne 0,75 % par bolus de 5 ml (12–20 ml), chloroprocaïne 3 % si souffrance fœtale. AG pour l'urgence extrême ou une contre-indication.",
          "Antiacide (IPP ou anti-H2, citrate de sodium 30 ml), inclinaison latérale gauche de 20°, phényléphrine en continu (3–5 mg/h) plutôt qu'éphédrine (acidose fœtale).",
          `AG : estomac plein et intubation difficile — préoxygénation, séquence rapide (propofol 2,5 mg/kg, succinylcholine 1 mg/kg), pas d'opioïde avant le clampage${pe ? " sauf prééclampsie (rémifentanil 0,5–1 µg/kg ou nitroglycérine 50–100 µg)" : ""}, halogéné ≤ 0,75 CAM, FiO₂ 1 à l'hystérotomie ; bloc TAP ou carré des lombes avant le réveil.`,
          `Après la naissance : ocytocine 5 UI en bolus lent${rhNeg ? " ; anti-D 200 µg (mère Rhésus négatif)" : ""} ; thromboprophylaxie, paracétamol et AINS.`,
          "Hémorragie : massage, ocytocine puis sulprostone, acide tranexamique, fibrinogène 2 g ; objectifs fibrinogène > 2 g/l, plaquettes > 50 G/l, Ca²⁺ > 0,8 mmol/l, T > 35 °C, pH > 7,2, Hb > 80 g/l.",
        ].join(" "),
        why: [surgeryName, pe ? "prééclampsie" : "", rhNeg ? "Rhésus négatif" : ""].filter(Boolean).join(" ; "),
        source: CH(36, "césarienne, hémorragie du post-partum"),
        material: ["Phényléphrine en seringue", "Ocytocine", "Acide tranexamique et fibrinogène disponibles"],
      });
    }

    // Pre-eclampsia (chap. 36).
    if (has(cond, "preeclampsia")) {
      const plt = p.platelets;
      add({
        id: "preeclampsia-plan",
        level: "high",
        title: "Prééclampsie : conduite",
        detail: [
          `Plaquettes et hémostase avant toute ALR${plt !== undefined ? ` (plaquettes ${plt} G/L${plt < 75 ? " : sous le seuil de 75 G/L de la péridurale" : ""})` : ""} ; la rachianesthésie n'est pas contre-indiquée. Péridurale sans adrénaline ; ropivacaïne 0,75 % ou bupivacaïne 0,5 % + fentanyl plutôt que lidocaïne.`,
          "AG : intubation difficile (œdème des voies aériennes) ; prévenir le pic hypertensif de l'intubation (rémifentanil 0,5–1 µg/kg, fentanyl 3–5 µg/kg ou sufentanil 0,3–0,5 µg/kg, ou nitroglycérine 50–100 µg ; dépression respiratoire du nouveau-né).",
          "Forme sévère : sulfate de magnésium 4 g puis 1–2 g/h (magnésémie 2,5–3,5 mmol/l, réflexes, potentialise les curares) ; nicardipine, labétalol ou dihydralazine. Surveillance continue 24–48 h.",
        ].join(" "),
        why: `Antécédent : prééclampsie${plt !== undefined ? ` ; plaquettes ${plt} G/L` : ""}`,
        source: CH(36, "prééclampsie, implications anesthésiques"),
      });
    }

    // Children (chap. 37).
    if (age !== undefined && age < 16) {
      const months = Math.round(age * 12);
      const ageText = age < 2 ? `${months} mois` : `${n(age)} ans`;
      const round5 = (x: number) => Math.round(x * 2) / 2;
      const tube = age >= 2 ? round5(4 + age / 4) : undefined;
      const tubeText =
        tube !== undefined
          ? `sonde ${n(tube)} sans ballonnet ou ${n(tube - 0.5)} à ballonnet (préparer aussi ${n(tube - 0.5)} et ${n(tube + 0.5)}), ${n(12 + age / 2)} cm aux lèvres, ${n(15 + age / 2)} cm au nez`
          : age < 0.25
            ? `sonde ${w !== undefined && w < 3.5 ? "3,0" : "3,5"} (prématuré 2,5), ${w !== undefined && w < 3.5 ? "8,5" : "9–10"} cm aux lèvres`
            : age < 1
              ? "sonde 3,5–4,0, 10–11 cm aux lèvres"
              : "sonde 4,0–4,5, 11–12 cm aux lèvres";
      const lma = w === undefined ? undefined : w < 5 ? "1" : w < 10 ? "1,5" : w < 20 ? "2" : w < 30 ? "2,5" : w <= 50 ? "3" : "4";
      const blade = age < 1 / 12 ? "Miller 0" : age < 1 ? "Miller 1" : "Macintosh";
      const bag = w === undefined ? undefined : age < 1 / 12 ? "0,5 l" : w < 10 ? "1 l" : w <= 20 ? "1,5 l" : "2 l";
      const gastric = age < 1 ? "Ch 8" : age < 2 ? "Ch 10" : age < 6 ? "Ch 12" : age <= 12 ? "Ch 14" : "Ch 16";
      const urinary = age < 2 ? "Ch 6" : age <= 8 ? "Ch 8" : "Ch 10";
      const hourly = w === undefined ? undefined : w <= 10 ? 4 * w : w <= 20 ? 40 + 2 * (w - 10) : 60 + (w - 20);
      const bloodVolume = w === undefined ? undefined : Math.round(w * (age < 1 / 12 ? 90 : age < 1 ? 80 : 70));
      const vitals = age < 0.5 ? "FR 40, FC 140, PA 65/40" : age < 2 ? "FR 30, FC 120, PA 95/65" : age < 8 ? "FR 25, FC 100, PA 100/70" : "FR 20, FC 80, PA 110/60";
      const f2 = (x: number) => x.toLocaleString("fr-BE", { maximumFractionDigits: 2 });
      const dose = (label: string, perKg: number, unit: string, max?: number) =>
        w === undefined ? `${label} ${f2(perKg)} ${unit}/kg` : `${label} ${f2(perKg)} ${unit}/kg (${f2(Math.min(perKg * w, max ?? Infinity))} ${unit})`;
      const uri = has(cond, "recent_uri") === true;
      add({
        id: "paediatric",
        level: uri && urgency === "elective" ? "medium" : "info",
        title: `Enfant de ${ageText}${w !== undefined ? ` (${n(w)} kg)` : ""} : repères`,
        detail: [
          uri && urgency === "elective" ? "Infection des voies aériennes récente : reporter une intervention non urgente de 3–4 semaines après la fin des symptômes (sauf rhinorrhée claire sans fièvre)." : "",
          `Matériel : ${tubeText} ; lame ${blade}${lma ? ` ; masque laryngé ${lma}` : ""}${bag ? ` ; ballon ${bag}` : ""} ; sonde gastrique ${gastric}, urinaire ${urinary}.`,
          `Normes : ${vitals} (hypotension = baisse de 10–20 % de la valeur avant l'induction).`,
          w !== undefined && w < 10 ? "Ventilation en pression contrôlée 10–25 cmH₂O, PEP 3–5, Vt 6–8 ml/kg." : "",
          `Doses : ${dose("atropine", 0.02, "mg", 0.6)}, ${dose("propofol", 3, "mg")} (2,5–4), ${dose("succinylcholine", 2, "mg")} (1,5–2), ${dose("paracétamol", 15, "mg", 1000)}, ${dose("dexaméthasone", 0.15, "mg", 8)}, ${dose("ondansétron", 0.1, "mg", 4)}, ${dose("morphine", 0.05, "mg")} par bolus${age >= 0.5 && (w === undefined || w >= 10) ? `, ${dose("ibuprofène", 10, "mg", 400)}` : " ; pas d'AINS avant 6 mois ni sous 10 kg"} ; pas d'aspirine (syndrome de Reye).`,
          hourly !== undefined ? `Entretien 4-2-1 : ${Math.round(hourly)} ml/h ; volume sanguin ≈ ${bloodVolume} ml ; remplissage par bolus de 10–20 ml/kg de cristalloïde non glucosé.` : "",
          "Induction inhalatoire au sévoflurane possible à tout âge (EMLA 45–60 min avant la ponction) ; température continue, salle ≥ 25 °C ; glycémie si intervention longue ; prémédication dès 1 an (midazolam 0,3–0,5 mg/kg per os).",
        ]
          .filter(Boolean)
          .join(" "),
        why: `Âge ${ageText}${w !== undefined ? `, ${n(w)} kg` : ""}${uri ? " ; infection respiratoire récente" : ""}`,
        source: CH(37, "tableaux 37.1 à 37.3, posologies, matériel"),
        material: [tube !== undefined ? `Sondes ${n(tube - 0.5)}, ${n(tube)} et ${n(tube + 0.5)}` : "Sondes d'intubation pédiatriques", `Lame ${blade}`, lma ? `Masque laryngé ${lma}` : "", `Sonde gastrique ${gastric}`, "Réchauffement (matelas, air pulsé)"].filter(Boolean),
      });
    }

    // Infants and former preterm babies: postoperative apnoea (chap. 37).
    if (has(cond, "ex_premature") || (age !== undefined && age < 1)) {
      const birth = Number(detailOf("ex_premature", "birthWeeks"));
      const preterm = has(cond, "ex_premature") === true || (Number.isFinite(birth) && birth > 0 && birth < 37);
      const pca = age !== undefined && Number.isFinite(birth) && birth > 0 ? Math.round(birth + age * 52.18) : undefined;
      const limit = preterm ? 52 : 48;
      const atRisk = pca === undefined ? undefined : pca < limit;
      if (atRisk !== false)
        add({
          id: "infant-apnoea",
          level: atRisk ? "high" : "medium",
          title: pca !== undefined ? `Âge post-conceptionnel ${pca} semaines : apnées postopératoires` : "Nourrisson : âge post-conceptionnel à calculer",
          detail: [
            pca === undefined ? `Préciser le terme de naissance : risque d'apnées postopératoires jusqu'à ${limit} semaines d'âge post-conceptionnel (${preterm ? "prématuré" : "né à terme"}).` : "",
            "Apnées jusqu'à 12 h après une AG ou des opioïdes intrathécaux : monitorage de l'apnée et saturomètre en unité surveillée (pas d'ambulatoire) ; citrate de caféine 20 mg/kg (caféine 10 mg/kg) en fin d'intervention. Majorées par Ht < 30 %, alcalose, hypoglycémie, hypothermie. Rachianesthésie seule possible sous 5 kg (hernie inguinale).",
            age !== undefined && age < 1 / 12 ? "Nouveau-né : vitamine K avant l'intervention, SpO₂ pré- et post-ductale, glycémie (hypoglycémie < 2,3 mmol/l après 72 h)." : "",
          ]
            .filter(Boolean)
            .join(" "),
          why: [preterm ? "ancien prématuré" : "", age !== undefined ? `âge ${Math.round(age * 12)} mois` : "", pca !== undefined ? `âge post-conceptionnel ${pca} semaines` : ""].filter(Boolean).join(" ; "),
          source: CH(37, "apnées du prématuré"),
          material: atRisk ? ["Citrate de caféine", "Monitorage d'apnée postopératoire"] : undefined,
        });
    }

    // Paediatric procedures (chap. 37).
    const tonsilBleed = /hemorragie.*amygdal|reprise.*amygdal|saignement.*amygdal/.test(name);
    const paedProc = tonsilBleed
      ? { id: "tonsil-bleed", level: "high" as const, title: "Hémorragie après amygdalectomie", text: "Estomac plein (sang avalé) : hypovolémie à corriger avant l'induction, sonde gastrique avant l'induction si possible, séquence rapide, deux aspirations, laryngoscopie gênée par le sang (matériel d'intubation difficile). Groupe sanguin.", material: ["Deux aspirations", "Matériel d'intubation difficile"] }
      : /amygdal|adenoid|vegetations/.test(name)
        ? { id: "tonsillectomy", level: "info" as const, title: "Amygdalectomie", text: "Induction inhalatoire puis voie veineuse ; sonde préformée (RAE), souvent sans curare ; douleur importante (opioïdes) ; NVPO fréquents : dexaméthasone 0,1–0,2 mg/kg et ondansétron 0,1–0,2 mg/kg (ou dropéridol). Hémorragie possible jusqu'à J7." }
        : /pylor/.test(name)
          ? { id: "pyloric-stenosis", level: "medium" as const, title: "Sténose du pylore", text: "Corriger d'abord déshydratation, alcalose hypochlorémique hypokaliémique et glycémie. Aspirer la sonde gastrique avant l'induction ; pas de curare après l'intubation (20 min) ; alcalose : apnées — saturomètre avant et après, opioïdes limités (fentanyl 1–2 µg/kg), bloc para-ombilical." }
          : null;
    if (paedProc) add({ id: paedProc.id, level: paedProc.level, title: paedProc.title, detail: paedProc.text, why: surgeryName, source: CH(37, "pathologies pédiatriques"), material: "material" in paedProc ? paedProc.material : undefined });

    // Eye surgery (chap. 38).
    const eye = c.surgery.category === "I" || /catarac|strabism|retin|vitrect|glaucom|keratopl|cornee|paupiere|lacrymal|dacryo|pterygion|globe|oculaire|enucleation/.test(name);
    if (eye) {
      const strab = /strabism/.test(name);
      const retina = /retin|vitrect/.test(name);
      const openGlobe = /plaie.*(globe|oeil|oculaire)|perforation.*(globe|oculaire)|globe ouvert/.test(name);
      const cataract = /catarac/.test(name);
      const lids = /paupiere|lacrymal|dacryo|blepharo/.test(name);
      const antithrombotic = cataract || /glaucom/.test(name)
        ? "cataracte ou glaucome : antiagrégants, AVK et AOD poursuivis"
        : retina
          ? "segment postérieur : antithrombotiques le plus souvent poursuivis (bloc péribulbaire ou sous-ténonien)"
          : lids
            ? "paupières, voies lacrymales : arrêt de tous les antithrombotiques"
            : /pterygion/.test(name)
              ? "ptérygion : arrêt des AVK et AOD, antiagrégants selon le chirurgien"
              : /keratopl|cornee/.test(name)
                ? "greffe de cornée : antithrombotiques poursuivis"
                : "";
      add({
        id: "eye-surgery",
        level: openGlobe ? "medium" : "info",
        title: openGlobe ? "Plaie du globe oculaire" : strab ? "Chirurgie du strabisme" : retina ? "Chirurgie de la rétine" : cataract ? "Chirurgie de la cataracte" : "Chirurgie ophtalmologique",
        detail: [
          openGlobe ? "Induction la plus douce possible, sans toux (lidocaïne 1–1,5 mg/kg IV ou anesthésie locale de la glotte) ; la succinylcholine n'est pas contre-indiquée pour un estomac plein. Pas de bloc péribulbaire, sauf AG impossible (3 ml par injection, sans compression)." : "",
          strab ? "Réflexe oculocardiaque (traction du droit médial) : arrêt des tractions, approfondir, O₂ 100 %, atropine 0,5–1 mg (0,02 mg/kg chez l'enfant). NVPO très fréquents : double prophylaxie. Curare non dépolarisant (test de duction ininterprétable 10–15 min après la succinylcholine)." : "",
          retina ? "Pas de protoxyde d'azote (bulle de gaz) ; NVPO fréquents ; après injection de gaz : ni avion ni altitude > 1 000 m pendant 3–6 semaines." : "",
          cataract ? "Anesthésie topique ± intracamérulaire : patient coopérant, capable de rester à plat ; sédation légère seulement (une sédation profonde fait bouger)." : "",
          !openGlobe && !cataract ? "AG : profondeur suffisante (ni mouvement ni plafonnement), PIO stable (proclive modéré, légère hypocapnie), réveil sans toux. Bloc péribulbaire plutôt que rétrobulbaire ; risque de perforation si myopie forte, staphylome, cerclage." : "",
          antithrombotic ? `Antithrombotiques — ${antithrombotic}.` : "",
        ]
          .filter(Boolean)
          .join(" "),
        why: `${surgeryName}${onAntithrombotic && antithrombotic ? " ; antithrombotique en cours" : ""}`,
        source: CH(38, "chirurgie ophtalmique et implications anesthésiques"),
        material: strab ? ["Atropine prête"] : undefined,
      });
    }
    {
      const drops: string[] = [];
      const on = (prefix: string) => c.treatments.filter((t) => t.atc.startsWith(prefix)).map((t) => t.name);
      const beta = on("S01ED");
      const cai = [...on("S01EC")];
      const echo = on("S01EB03");
      if (beta.length) drops.push(`${beta.join(", ")} (bêtabloquant en collyre) : bradycardie, hypotension, bronchospasme`);
      if (cai.length) drops.push(`${cai.join(", ")} (inhibiteur de l'anhydrase carbonique) : acidose métabolique, hypokaliémie`);
      if (echo.length) drops.push(`${echo.join(", ")} (échothiophate) : succinylcholine, mivacurium et AL esters prolongés jusqu'à 4–6 semaines après l'arrêt`);
      if (drops.length)
        add({ id: "eye-drops", level: echo.length ? "medium" : "info", title: "Collyres : effets systémiques", detail: `${drops.join(". ")}. Absorption conjonctivale (1 goutte de phényléphrine 10 % = 5 mg) : occlusion du canal lacrymal.`, why: drops.map((x) => x.split(" (")[0]).join(", "), source: CH(38, "effets systémiques des médicaments administrés par voie oculaire") });
    }

    // ENT surgery (chap. 39).
    const laser = /laser/.test(name);
    const jet = /jet|microlaryng|microchirurgie laryng|laryngoscopie en suspension/.test(name);
    const foreign = /corps etranger/.test(name);
    const neck = /curage|evidement|parotid|laryngect|pharyngect|glossect|carcinolog.*(tete|cou|orl)|tete et cou/.test(name);
    const endo = /panendoscop|bronchoscop|oesophagoscop|laryngoscop|endoscopie du sommeil/.test(name);
    if (laser || jet || foreign || neck || endo) {
      add({
        id: "ent-airway",
        level: laser || foreign ? "medium" : "info",
        title: laser ? "Laser des voies aériennes" : foreign ? "Corps étranger des voies aériennes" : neck ? "Chirurgie carcinologique cervicale" : "Endoscopie ORL : voies aériennes partagées",
        detail: [
          "Voies aériennes partagées avec le chirurgien : stratégie décidée ensemble. Rechercher stridor (aggravé en décubitus), dysphagie haute, déviation trachéale, langue fixée, position de sommeil ; intubation difficile fréquente (tumeur, radiothérapie). Contrôle difficile prévu : pas d'induction IV standard — intubation vigile au fibroscope ou sévoflurane en ventilation spontanée ; laryngoscopie indirecte par l'ORL avant l'induction si doute.",
          foreign ? "Corps étranger : induction en ventilation spontanée (sévoflurane 8 %), pas de pression positive avant la libération des voies aériennes (refoulement distal), bronchoscope rigide." : "",
          laser ? "Laser : FiO₂ 0,21–0,3, ni N₂O ni by-pass d'O₂, sonde laser à ballonnet rempli de NaCl, 60 ml d'eau à portée, champs et paupières humides, lunettes adaptées. Feu : NaCl dans la trachée, couper l'O₂, retirer la sonde, ventiler, réintuber, bronchoscopie." : "",
          jet ? "Jet-ventilation : curarisation profonde, départ à 0,5 bar puis 0,02–0,03 bar/kg ; expiration libre obligatoire (barotraumatisme) ; le CO₂ n'est pas éliminé : normaliser l'ETCO₂ après." : "",
          endo && !neck ? "Geste court et très réflexogène : propofol en continu et bolus de rémifentanil ; glycopyrrolate 0,2–0,3 mg contre les sécrétions ; bronchoscope rigide : curarisation profonde." : "",
          neck ? "Trachéotomie possible en début d'intervention ; entretien IV (propofol, rémifentanil ou sufentanil) ; pas de curare pendant le repérage du nerf facial ; infiltration du sinus carotidien ; test de fuite avant l'extubation (absent : différer, endoscopie)." : "",
        ]
          .filter(Boolean)
          .join(" "),
        why: surgeryName,
        source: CH(39, "chirurgie ORL et implications anesthésiques"),
        material: laser ? ["Sonde laser", "Seringue de 60 ml de NaCl"] : jet ? ["Jet-ventilateur"] : undefined,
      });
    }

    // Orthopaedics (chap. 40).
    const hipFracture = /col du femur|col femoral|fracture.*(hanche|femur)|pertrochanter|sous-trochanter|hemiarthroplast|prothese intermediaire|osteosynthese de la hanche|\bpih\b/.test(name);
    if (hipFracture)
      add({
        id: "hip-fracture",
        level: "medium",
        title: "Fracture du fémur proximal",
        detail: "Opérer dans les plus brefs délais (alitement : escarres, pneumopathie, confusion) ; un antithrombotique ne doit retarder l'intervention que le temps nécessaire. Bloc ilio-fascial ou fémoral avant la mobilisation et l'installation (sinon propofol 20–40 mg, attention à l'inhalation). Rachianesthésie : moins de morbidité. Rechercher anémie, dénutrition, rhabdomyolyse (station au sol prolongée : CK). Deux concentrés érythrocytaires disponibles.",
        why: `${surgeryName}${age !== undefined ? ` ; ${age} ans` : ""}${onAntithrombotic ? " ; antithrombotique en cours" : ""}`,
        source: CH(40, "fractures du fémur proximal"),
        material: ["Bloc ilio-fascial (échographe)", "Deux concentrés érythrocytaires"],
      });
    const prosthesis = /prothese|arthroplast|\bpth\b|\bptg\b|moore/.test(name) && !/non cimente/.test(name);
    if (prosthesis) {
      const risk = [has(cond, "heart_failure") ? "insuffisance cardiaque" : "", has(cond, "pulmonary_hypertension") ? "hypertension pulmonaire" : "", hipFracture ? "fracture de hanche" : "", age !== undefined && age >= 80 ? `${age} ans (os ostéoporotique)` : ""].filter(Boolean);
      if (risk.length)
        add({
          id: "cement",
          level: "medium",
          title: "Syndrome d'implantation du ciment : terrain à risque",
          detail: "Hypotension, hypoxémie, troubles neurologiques voire arrêt au cimentage (emboles de graisse, ciment, air). Discuter une prothèse non cimentée ; sinon pression artérielle invasive (voie centrale si fonction cardiaque altérée), FiO₂ élevée, pas de N₂O, normovolémie, vasopresseur prêt ; demander lavage et aspiration du fût médullaire, drain avant le ciment.",
          why: risk.join(", "),
          source: CH(40, "syndrome d'implantation du ciment"),
          material: ["Cathéter artériel", "Noradrénaline prête"],
        });
    }
    const region = /epaule|coiffe|acromio/.test(name)
      ? "Épaule : bloc interscalénique (cathéter pour une prothèse) ± AG ; parésie phrénique homolatérale."
      : /coude/.test(name) && c.surgery.category === "K"
        ? "Coude : bloc supra- ou infraclaviculaire (cathéter pour une prothèse) ± AG."
        : /hanche|\bpth\b/.test(name) && !hipFracture
          ? `Hanche : rachianesthésie (bupivacaïne isobare 10–15 mg, possible directement sur le côté sain) ± infiltration périarticulaire ; acide tranexamique 10–15 mg/kg en début d'intervention${w !== undefined ? ` (≈ ${Math.round(w * 10)}–${Math.round(w * 15)} mg)` : ""}. Décubitus latéral : billot axillaire ; voie postérieure : nerf sciatique ; voie antérieure : nerf cutané latéral de la cuisse.`
          : /genou|\bptg\b|ligament croise|\blca\b|menisc|valgisation/.test(name)
            ? `Genou : bloc du canal des adducteurs (ou fémoral) + rachianesthésie ± infiltration de la capsule postérieure (le bloc fémoral seul ne couvre pas le genou)${/prothese|\bptg\b/.test(name) ? `; acide tranexamique 10–15 mg/kg${w !== undefined ? ` (≈ ${Math.round(w * 10)}–${Math.round(w * 15)} mg)` : ""}` : ""}.`
            : /cheville/.test(name)
              ? "Cheville (prothèse, arthrodèse) : cathéter poplité + rachianesthésie."
              : /avant-pied|hallux|orteil/.test(name)
                ? "Avant-pied : bloc de cheville (garrot à la cheville) ; garrot à la cuisse : rachianesthésie ; garrot au tiers distal de jambe : sciatique poplité + saphène."
                : "";
    if (region && c.surgery.category === "K")
      add({ id: "ortho-strategy", level: "info", title: "Orthopédie : technique proposée", detail: `${region} L'anesthésie périmédullaire réduit morbidité et mortalité après prothèse de hanche ou de genou ; thromboprophylaxie.`, why: surgeryName, source: CH(40, "tableau 40.1") });

    const tourniquet = c.surgery.tourniquet === true || (plan?.tourniquetAlertMin ?? 0) > 0;
    if (tourniquet) {
      const ci = [has(cond, "pad") ? "artériopathie" : "", has(cond, "sickle_cell") ? "drépanocytose" : "", has(cond, "vte") ? "antécédent de thrombose veineuse" : "", has(cond, "neuropathy") ? "neuropathie périphérique" : "", has(cond, "dialysis") ? "fistule artérioveineuse (côté ?)" : ""].filter(Boolean);
      const sbp = p.sbp;
      add({
        id: "tourniquet",
        level: ci.length ? "high" : "info",
        title: ci.length ? "Garrot : contre-indication possible" : "Garrot pneumatique",
        detail: [
          ci.length ? `À discuter avec le chirurgien : ${ci.join(", ")} (contre-indications : artériopathie sévère, pontage, fistule, thrombose veineuse, drépanocytose, lésions cutanées, neuropathie).` : "",
          `Pression : membre supérieur PAS + 70–100 mmHg, inférieur PAS + 100–150 mmHg, maximum 350${sbp ? ` (PAS ${sbp} : ≈ ${sbp + 70}–${sbp + 100} et ${sbp + 100}–${Math.min(350, sbp + 150)} mmHg)` : ""}. Durée ≤ 120 min (sinon relâcher 5–20 min) ; antibioprophylaxie 5–15 min avant le gonflage ; dégonfler après la fermeture cutanée.`,
          "Gonflage : +400–500 ml de volémie (cuisse) ; HTA et tachycardie après 30–60 min. Lâchage : hypotension, K⁺, lactates et ETCO₂ en hausse, baisse de la température, emboles.",
        ]
          .filter(Boolean)
          .join(" "),
        why: `Garrot prévu${ci.length ? ` ; ${ci.join(", ")}` : ""}`,
        source: CH(40, "garrot"),
      });
    }
    if (/fracture|ecrasement|crush|enclouage|plateau tibial|diaphys|bassin|cotyle/.test(name))
      add({
        id: "fracture-complications",
        level: "info",
        title: "Fracture : syndrome des loges et embolie graisseuse",
        detail: "Syndrome des loges (fracture de jambe ou d'avant-bras, écrasement, plâtre serré) : douleur résistante aux antalgiques et à l'étirement passif, puis pâleur, paresthésies, parésie ; un bloc périnerveux ne le masque pas mais impose une surveillance ; pression > 30 mmHg : aponévrotomie dans les 4 h. Embolie graisseuse (fémur, bassin) jusqu'à 72 h : hypoxémie, confusion, pétéchies, baisse de l'ETCO₂ sous AG ; ostéosynthèse précoce.",
        why: surgeryName,
        source: CH(40, "syndrome des loges, embolie graisseuse"),
      });
    if (c.surgery.category === "K" && /rachis|arthrodese|scoliose|vertebr|cervical|lombaire|hernie discale|laminect|cyphoplast/.test(name)) {
      const cervical = /cervical/.test(name);
      add({
        id: "ortho-spine",
        level: "info",
        title: cervical ? "Chirurgie du rachis cervical" : "Chirurgie du rachis thoracique ou lombaire",
        detail: cervical
          ? "Intubation au fibroscope si la laryngoscopie risque d'aggraver une lésion médullaire. Obstruction des voies aériennes postopératoire (≈ 5 %, un tiers réintubés) si > 5 h, > 3 niveaux, pertes > 300 ml : test de fuite avant l'extubation, corticoïdes ; sinon réanimation 24–48 h. Dysphagie, dysphonie (nerf récurrent)."
          : "Décubitus ventral prolongé : œdème facial et pharyngé, yeux. Correction de scoliose : potentiels évoqués — anesthésie IV totale (propofol, rémifentanil), curare seulement à l'induction ; pertes importantes : cathéter artériel, voies de gros calibre, récupérateur, acide tranexamique ; morphine intrathécale 100–300 µg ou péridurale posée par le chirurgien. > 3 h ou courbure > 60° : réanimation 24–48 h.",
        why: surgeryName,
        source: CH(40, "chirurgie du rachis"),
      });
    }
    {
      const rheum: string[] = [];
      if (has(cond, "rheumatoid")) rheum.push("Polyarthrite rhumatoïde : subluxation atlanto-axoïdienne (radiographie en flexion-extension, > 3 mm), ankylose temporomandibulaire, arthrite crico-aryténoïdienne (stridor : sonde 6,5–7) — intubation vigile au fibroscope, nuque dans l'axe ; cathéter artériel brachial ou fémoral plutôt que radial ; insuffisance surrénale possible.");
      if (has(cond, "ankylosing")) rheum.push("Spondylarthrite ankylosante : rachis cervical soudé (fibroscope), neuraxial difficile ; insuffisance aortique, troubles conductifs.");
      if (has(cond, "osteogenesis_imperfecta")) rheum.push("Ostéogenèse imparfaite : fonction plaquettaire à vérifier, installation très prudente, pression artérielle invasive plutôt que brassard répété (fractures), pas de succinylcholine, intubation sans mobiliser le rachis.");
      if (has(cond, "achondroplasia")) rheum.push("Achondroplasie : ventilation et intubation difficiles, canal cervical étroit, hypertension pulmonaire (SAOS, cyphoscoliose).");
      if (rheum.length) add({ id: "rheum-plan", level: "medium", title: "Maladie ostéoarticulaire : précautions", detail: rheum.join(" "), why: rheum.map((x) => x.split(" :")[0]).join(", "), source: CH(40, "polyarthrite rhumatoïde et autres maladies ostéoarticulaires, tableau 40.2") });
    }
  }

  // --- Emergencies, remote locations, elderly, obesity, cancer (manual, chapters 41–45) ------------
  {
    const name = fold(c.surgery.name);
    const CH = (k: number, what: string) => `${MANUAL}, chap. ${k} (${what})`;
    const urgency = urgencyOf(c.surgery);
    const techs = new Set([...(plan?.techniques ?? []), ...c.techniques]);
    const general = techs.size === 0 || techs.has("general");
    const w = p.weightKg;
    const ibw = scores.derived.ibw;
    const abw = scores.derived.abw;
    const bmi = scores.derived.bmi;
    const adult = p.age === undefined || p.age >= 16;
    const detailOf = (id: string, key: string) => cond[id]?.details?.[key];
    const mg = (perKg: number, kg: number | undefined, max?: number) => (kg === undefined ? "" : ` (≈ ${Math.round(Math.min(perKg * kg, max ?? Infinity))} mg)`);

    // Rapid sequence induction (chap. 41).
    const weeks = Number(detailOf("pregnancy", "weeks"));
    const rsi = [
      urgency !== "elective" ? "intervention urgente" : "",
      has(cond, "bowel_obstruction") ? "occlusion ou iléus" : "",
      has(cond, "gerd") ? "reflux gastro-œsophagien ou hernie hiatale" : "",
      has(cond, "pregnancy") && (!Number.isFinite(weeks) || weeks >= 15) ? "grossesse ≥ 15 SA" : "",
      has(cond, "major_trauma") ? "polytraumatisme" : "",
    ].filter(Boolean);
    if (rsi.length && general && adult) {
      const noSux = anyOf(cond, ["malignant_hyperthermia", "pseudocholinesterase", "hemiplegia", "spinal_cord_injury", "neuromuscular", "myotonic_dystrophy", "duchenne", "als", "sma", "burns", "bedridden"]) === true;
      add({
        id: "rsi",
        level: "medium",
        title: "Induction en séquence rapide",
        detail: [
          "Préoxygénation 3–5 min (sinon 4 à 8 inspirations maximales) ; hypnotique : propofol 2 mg/kg, étomidate 0,3 mg/kg ou thiopental 5 mg/kg" + (w ? ` (propofol${mg(2, w)})` : "") + ".",
          noSux
            ? `Succinylcholine contre-indiquée : rocuronium 1,2 mg/kg du poids idéal${mg(1.2, ibw ?? w)} (intubation après 90 s), sugammadex 16 mg/kg prêt${mg(16, ibw ?? w)}.`
            : `Succinylcholine 1–1,5 mg/kg${mg(1, w, 150)} ; si contre-indiquée : rocuronium 1,2 mg/kg (intubation après 90 s).`,
          "Manœuvre de Sellick facultative (efficacité non démontrée, gêne la laryngoscopie). Opioïde après l'intubation (fentanyl 2–3 µg/kg), sonde gastrique pour vider l'estomac.",
          "Prévention : oméprazole 20–40 mg 30–60 min avant, citrate de sodium 0,3 M 30 ml 15–30 min avant. Inhalation : aspirer la trachée avant d'intuber, FiO₂ 1, surveillance (ni antibiotique ni corticoïde d'emblée).",
        ].join(" "),
        why: rsi.join(", "),
        source: CH(41, "induction à séquence rapide, inhalation bronchique"),
        material: ["Aspiration prête (sonde rigide)", noSux ? "Sugammadex 16 mg/kg" : "", "Sonde gastrique"].filter(Boolean),
      });
    }

    // Major trauma (chap. 41).
    if (has(cond, "major_trauma") || /polytrauma|damage control|plaie par (arme|balle)|traumatisme penetrant|hemorragie (massive|traumatique)/.test(name)) {
      const abc = [p.sbp !== undefined && p.sbp < 90 ? `PAS ${p.sbp} < 90` : "", p.hr !== undefined && p.hr > 120 ? `FC ${p.hr} > 120` : ""].filter(Boolean);
      const headInjury = anyOf(cond, ["raised_icp", "intracranial_lesion"]) === true;
      add({
        id: "trauma",
        level: "high",
        title: "Polytraumatisé : damage control",
        detail: [
          `Score ABC (1 point chacun : plaie pénétrante, PAS < 90, FC > 120, FAST positif) ≥ 2 : transfusion massive probable${abc.length ? ` — déjà ${abc.join(", ")}` : ""}.`,
          "Séquence rapide avec stabilisation cervicale dans l'axe, étomidate ou kétamine ; deux voies de gros calibre (14 G : 270 ml/min, 16 G : 180, 18 G : 104 ; voie centrale 16 G : 75).",
          `Acide tranexamique 1 g en 10 min puis 1 g en 8 h ; CGR:PFC:plaquettes 1:1:1, fibrinogène 2 g ; cristalloïdes limités, pas d'HEA ni de dextran ; hypotension permissive (PAS 80 mmHg)${headInjury ? " — sauf traumatisme crânien, présent ici" : " sauf traumatisme crânien"}.`,
          "Objectifs : Ht > 30 %, plaquettes > 50 G/l, TP > 50 % (CCP 1 800–2 400 U), fibrinogène > 1,5 g/l, Ca²⁺, lactates < 4, pH > 7,2, normothermie (1 l à 20 °C = −0,3 °C). Hypoxémie : pneumothorax, contusion ; PVC haute et bas débit : pneumothorax compressif, tamponnade, contusion myocardique.",
        ].join(" "),
        why: [has(cond, "major_trauma") ? "polytraumatisme" : surgeryName, ...abc, headInjury ? "traumatisme crânien" : ""].filter(Boolean).join(" ; "),
        source: CH(41, "polytraumatisé, damage control resuscitation"),
        material: ["Deux voies de gros calibre (14–16 G)", "Réchauffeur et accélérateur de perfusion", "Acide tranexamique", "Protocole de transfusion massive"],
      });
    }

    // Burns (chap. 41).
    if (has(cond, "burns")) {
      const tbsa = Number(detailOf("burns", "tbsa"));
      const pct = Number.isFinite(tbsa) && tbsa > 0 ? tbsa : undefined;
      const inhalation = detailOf("burns", "inhalation") === "yes";
      const ryan = [p.age !== undefined && p.age > 60, pct !== undefined && pct > 40, inhalation].filter(Boolean).length;
      const known = p.age !== undefined && pct !== undefined && detailOf("burns", "inhalation") !== undefined;
      const parkland = w !== undefined && pct !== undefined && pct >= 20 ? Math.round(2 * w * pct) : undefined;
      add({
        id: "burns-plan",
        level: "high",
        title: `Brûlé${pct !== undefined ? ` (${pct} %)` : ""} : conduite`,
        detail: [
          parkland !== undefined ? `Remplissage (Parkland modifiée, 2 ml/kg/% sur 24 h) : ≈ ${parkland} ml de cristalloïde, la moitié (${Math.round(parkland / 2)} ml) dans les 8 premières heures depuis la brûlure ; guidé surtout par la diurèse (0,5–1 ml/kg/h, enfant 1–2) pour éviter la sur-réanimation.` : "Surface brûlée à préciser : au-delà de 20 %, remplissage selon Parkland modifiée (2 ml/kg/% sur 24 h), guidé par la diurèse.",
          inhalation ? "Inhalation : intubation précoce en séquence rapide avant l'œdème (sonde plus petite), bronchoscopie ; CO : O₂ 100 % 6–12 h ; cyanures : hydroxocobalamine 5 g." : "Rechercher une inhalation (vibrisses brûlées, suie, voix modifiée) : intubation précoce.",
          "Succinylcholine contre-indiquée après 48 h selon le manuel (dès 24 h selon d'autres références) : hyperkaliémie ; résistance aux curares non dépolarisants ; albumine basse (fraction libre) ; excisions très hémorragiques ; hypothermie. Plus de 20 % : centre spécialisé.",
          known ? `Score de Ryan ${ryan}/3 (âge > 60, > 40 %, inhalation) : mortalité ≈ ${["0,3", "3", "33", "90"][ryan]} %.` : "",
        ]
          .filter(Boolean)
          .join(" "),
        why: [pct !== undefined ? `brûlures ${pct} %` : "brûlures étendues", inhalation ? "inhalation de fumées" : "", w !== undefined ? `${w} kg` : ""].filter(Boolean).join(", "),
        source: CH(41, "le patient brûlé, tableau 41.1"),
        material: ["Réchauffement actif", "Produits sanguins pour l'excision"],
      });
    }

    // Anaesthesia outside the theatre (chap. 42).
    if (/endoscop|coloscop|gastroscop|\bcpre\b|\bercp\b|\birm\b|scanner|radiolog|emboli|angiograph|coronarograph|electrophysiolog|ablation de (fa|flutter)|cardioversion|\btips\b|biopsie hepatique/.test(name))
      add({
        id: "remote-location",
        level: "info",
        title: "Anesthésie hors bloc",
        detail: "Même niveau de sécurité qu'au bloc : ECG, PNI, SpO₂, capnographie, température (salles froides) ; BIS si AG légère et longue. Anticiper médicaments, O₂ et monitorage de transport, câbles et tubulures longs (accès à la tête limité), points d'appui ; tablier de plomb et dosimètre ; IRM : matériel compatible. Sédation : profondeur évaluée régulièrement (score de Ramsay) ; AG si geste long, douloureux ou exigeant l'immobilité.",
        why: surgeryName,
        source: CH(42, "anesthésie hors bloc"),
      });

    // Elderly patient (chap. 43).
    if (p.age !== undefined && p.age >= 75)
      add({
        id: "elderly-plan",
        level: "info",
        title: `Patient âgé (${p.age} ans) : adapter l'anesthésie`,
        detail: "Diminuer les doses d'induction et d'entretien (hypnotiques, opioïdes, halogénés : CAM plus basse ; effets prolongés), benzodiazépines à dose réduite (effet très prolongé) ; AL neuraxiaux : moins par métamère, rétention urinaire ; agonistes adrénergiques et atropine : doses plus fortes (syndrome anticholinergique central) ; succinylcholine inchangée ; anticholinestérasiques prolongés. Hypotension à l'induction, réflexes atténués ; surcharge hydrique, hyponatrémie ; hypothermie ; hypoxémie postopératoire ; protéger les membres (peau fragile, neuropathies) ; antibiotiques adaptés à la fonction rénale ; interactions (polymédication).",
        why: `Âge ${p.age} ans`,
        source: CH(43, "tableau 43.1"),
      });

    // Obesity (chap. 44).
    if (adult && bmi !== undefined && bmi >= 35) {
      const neck = p.neckCm;
      add({
        id: "obesity-plan",
        level: bmi >= 40 ? "medium" : "info",
        title: `Obésité (IMC ${Math.round(bmi)}) : conduite`,
        detail: [
          `Poids : idéal ${ibw !== undefined ? `${Math.round(ibw)} kg` : "(taille et sexe requis)"}, corrigé ${abw !== undefined ? `${Math.round(abw)} kg` : "= idéal + 0,4 × excès"}, réel ${w} kg. Propofol : induction au poids corrigé${mg(2, abw)}, entretien au poids réel ; succinylcholine 1 mg/kg au poids réel, ≤ 150 mg${mg(1, w, 150)} ; rocuronium et vécuronium au poids idéal${ibw !== undefined ? ` (rocuronium 0,6 mg/kg ≈ ${Math.round(0.6 * ibw)} mg)` : ""} ; atracurium et cisatracurium au poids réel. Éviter thiopental et benzodiazépines ; desflurane ou sévoflurane ; sufentanil, alfentanil, rémifentanil.`,
          `Ventilation et intubation difficiles${neck ? ` (cou ${neck} cm : ${neck > 60 ? "≈ 35 %" : neck >= 40 ? "risque accru" : "≈ 5 %"} d'intubation difficile)` : " (SAOS, tour de cou > 40 cm)"} : tête et épaules surélevées (rampe), matériel d'intubation difficile ; préoxygénation proclive avec PEP 5 min. Séquence rapide seulement si reflux symptomatique ou anneau gastrique mal positionné (l'obèse sans reflux n'a pas un estomac plein).`,
          "PEP 8–10 cmH₂O, recrutements après l'intubation et le pneumopéritoine (le manuel propose Vt 8–10 ml/kg de poids idéal ; la ventilation protectrice actuelle retient 6–8). Décurarisation, extubation semi-assise ; analgésie multimodale et ALR ; thromboprophylaxie.",
        ].join(" "),
        why: `IMC ${n(bmi)} kg/m²${neck ? `, cou ${neck} cm` : ""}`,
        source: CH(44, "obésité, stratégie anesthésique"),
        material: ["Coussin de rampe", "Brassard adapté", "Matériel d'intubation difficile", "Vidéolaryngoscope"],
      });
    }

    // Obstructive sleep apnoea (chap. 44).
    if (has(cond, "osa")) {
      const ahi = detailOf("osa", "ahi");
      const cpap = detailOf("osa", "cpap");
      add({
        id: "osa-plan",
        level: ahi === "severe" || cpap === "no" ? "medium" : "info",
        title: "SAOS : conduite périopératoire",
        detail: `Pas de benzodiazépine en prémédication ; ALR chaque fois que possible ; AG avec agents de courte durée (rémifentanil), ventilation et intubation difficiles (15–40 %) ; analgésie multimodale, épargne morphinique. Obstruction maximale vers la 3e nuit postopératoire : PPC du patient dès le réveil${cpap === "no" ? " (non appareillé : surveillance prolongée de la SpO₂)" : ""}. Soins continus non systématiques : selon comorbidités, besoins en opioïdes et PPC.`,
        why: ["SAOS", ahi === "severe" ? "sévère" : ahi === "moderate" ? "modéré" : ahi === "mild" ? "léger" : "", cpap === "no" ? "non appareillé" : cpap === "yes" ? "appareillé" : ""].filter(Boolean).join(", "),
        source: CH(44, "syndrome d'apnées du sommeil"),
      });
    }

    // Cancer (chap. 45).
    const onAtc = (...prefixes: string[]) => c.treatments.filter((t) => prefixes.some((x) => t.atc.startsWith(x))).map((t) => t.name);
    const anthra = onAtc("L01DB");
    const bleo = onAtc("L01DC01");
    const platinum = onAtc("L01XA");
    const neuro = onAtc("L01CA", "L01CD");
    const her2 = onAtc("L01XC03", "L01FD01");
    const checkpoint = onAtc("L01XC17", "L01XC18", "L01XC31", "L01FF");
    const oncoDrugs = [...anthra, ...bleo, ...platinum, ...neuro, ...her2, ...checkpoint];
    if (has(cond, "cancer") || has(cond, "chemotherapy") || oncoDrugs.length) {
      const lines = [
        anthra.length || detailOf("chemotherapy", "anthracycline") === "yes" ? "Anthracyclines : cardiotoxicité (QT, troubles conductifs, insuffisance cardiaque parfois retardée) — ECG, échocardiographie." : "",
        her2.length ? "Trastuzumab : dysfonction ventriculaire gauche — échocardiographie." : "",
        bleo.length || detailOf("chemotherapy", "bleomycin") === "yes" ? "Bléomycine : fibrose aggravée par l'oxygène — FiO₂ minimale." : "",
        platinum.length ? "Sels de platine : néphrotoxicité, hypomagnésémie, neuropathie." : "",
        neuro.length || detailOf("chemotherapy", "neurotoxic") === "yes" ? "Vinca-alcaloïdes, taxanes : neuropathie périphérique à documenter avant une ALR." : "",
        checkpoint.length ? "Immunothérapie (anti-PD-1…) : pneumopathie interstitielle, atteintes endocriniennes." : "",
        "Aplasie vers J7 d'une cure (hémogramme), syndrome de lyse (K⁺, créatinine), hypercalcémie (métastases osseuses, myélome), syndrome paranéoplasique (SIADH, Lambert-Eaton : curares potentialisés).",
        "Thrombose : prophylaxie dès l'alitement. Aucune technique n'a prouvé qu'elle réduisait la récidive ; épargne morphinique et anesthésie IV raisonnables pour une chirurgie carcinologique majeure.",
      ].filter(Boolean);
      add({
        id: "oncology",
        level: anthra.length || bleo.length || detailOf("chemotherapy", "bleomycin") === "yes" ? "medium" : "info",
        title: "Patient oncologique : toxicités et précautions",
        detail: lines.join(" "),
        why: [has(cond, "cancer") ? "cancer évolutif" : "", has(cond, "chemotherapy") ? "chimiothérapie récente" : "", ...oncoDrugs].filter(Boolean).join(", "),
        source: CH(45, "patient oncologique, tableau 45.1"),
      });
    }
  }

  // --- Organ donation, hyperbaric medicine, critical care (manual, chapters 46–49) ------------------
  {
    const name = fold(c.surgery.name);
    const CH = (k: number, what: string) => `${MANUAL}, chap. ${k} (${what})`;
    const w = p.weightKg;

    // Organ retrieval in a brain-dead donor (chap. 46).
    if (/prelevement.*organes|donneur.*organes|mort encephalique/.test(name))
      add({
        id: "organ-donor",
        level: "medium",
        title: "Prélèvement d'organes : cibles de réanimation",
        detail: [
          "Cibles (tableau 46.1) : PAM 60–90 mmHg, PVC 6–8, diurèse > 1 ml/kg/h, SpO₂ > 95 % avec FiO₂ < 0,4, PaCO₂ 35–40, Vt 6–8 ml/kg, PEP 5, plateau < 30 ; Hb > 70 g/l, plaquettes > 50 G/l, fibrinogène > 1 g/l, INR < 2, Na⁺ 130–150 mmol/l, glycémie 4,4–8,3 mmol/l.",
          "Vasoactifs à la plus faible dose, remplissage d'abord. Diabète insipide : desmopressine 0,25–2 µg toutes les 6 h ou vasopressine 0,5–2 UI/h. Instabilité : hormones thyroïdiennes, méthylprednisolone 15 mg/kg/24 h.",
          `Hypnotique, analgésique et curare justifiés (réflexes médullaires). Héparine 300–600 UI/kg 10 min avant la canulation${w !== undefined ? ` (≈ ${Math.round(w * 300)}–${Math.round(w * 600)} UI)` : ""} ; ventilation maintenue si prélèvement pulmonaire. Ischémie froide tolérée : cœur et poumons 4–6 h, foie 6–12 h, reins 12–48 h.`,
        ].join(" "),
        why: surgeryName,
        source: CH(46, "mort encéphalique et prélèvement d'organes, tableau 46.1"),
        material: ["Cathéter artériel", "Deux voies de gros calibre dont une centrale", "Sonde gastrique, urinaire et thermique"],
      });

    // Hyperbaric oxygen therapy (chap. 47).
    if (/hyperbar|caisson|\bohb\b/.test(name)) {
      const absolute = [has(cond, "home_o2") ? "BPCO sous oxygène au long cours" : "", has(cond, "pregnancy") ? "grossesse (sauf intoxication au CO)" : "", has(cond, "pneumothorax") ? "pneumothorax (à exclure ou drainer)" : ""].filter(Boolean);
      const relative = [has(cond, "asthma") ? "asthme" : "", has(cond, "recent_uri") ? "infection des voies aériennes supérieures" : "", has(cond, "epilepsy") ? "épilepsie" : "", has(cond, "middle_ear") ? "oreille moyenne" : ""].filter(Boolean);
      add({
        id: "hyperbaric",
        level: absolute.length ? "high" : "info",
        title: absolute.length ? "Oxygénothérapie hyperbare : contre-indication" : "Oxygénothérapie hyperbare",
        detail: [
          absolute.length ? `Contre-indication absolue : ${absolute.join(", ")}.` : "",
          relative.length ? `Contre-indication relative : ${relative.join(", ")}.` : "",
          "Ballonnet rempli d'eau, perfusions purgées de toute bulle, drains en aspiration, poches de stomie vidées ; patient inconscient : myringotomie. Ventilation en pression contrôlée (les analyseurs surestiment les débits et les fractions) ; ballon de Swan-Ganz dégonflé. Vasoconstricteurs : doses plus faibles à la compression, hypotension à la décompression ; diabétique : hypoglycémie ; corticoïdes, catécholamines et acétazolamide abaissent le seuil de toxicité cérébrale de l'O₂. Pas de défibrillation dans le caisson.",
        ]
          .filter(Boolean)
          .join(" "),
        why: [surgeryName, ...absolute, ...relative].join(" ; "),
        source: CH(47, "anesthésie et médecine hyperbare"),
      });
    }

    // Sepsis and septic shock (chap. 49).
    if (has(cond, "septic_shock")) {
      const fluids = w !== undefined ? Math.round(w * 30) : undefined;
      add({
        id: "septic-shock",
        level: "high",
        title: "Sepsis ou choc septique : avant et pendant l'intervention",
        detail: [
          `Cristalloïdes 30 ml/kg dans les 3 premières heures${fluids !== undefined ? ` (≈ ${fluids} ml)` : ""}, puis selon la réponse au remplissage (VPP > 11 % si Vt ≥ 7 ml/kg, > 8 % si Vt ≤ 7 ; lever de jambes : débit +10 %).`,
          "Noradrénaline 0,1–0,5 µg/kg/min pour une PAM ≥ 65 mmHg (vasopressine 0,03 UI/min en épargne) ; dobutamine si bas débit persistant ; hydrocortisone 200 mg/j seulement si choc réfractaire.",
          "Lactates toutes les 1–2 h ; prélèvements microbiologiques avant les antibiotiques ; contrôle de la source sans délai. Induction à l'étomidate ou à la kétamine, doses réduites ; cathéter artériel et voie centrale.",
        ].join(" "),
        why: `Antécédent : sepsis ou choc septique${w !== undefined ? ` ; ${w} kg` : ""}`,
        source: CH(49, "chocs, sepsis et choc septique"),
        material: ["Cathéter artériel", "Noradrénaline prête", "Voie veineuse centrale"],
      });
    }
  }

  // --- ECG read at the consultation (manual, chapter 51) ---------------------------------------
  {
    const ecg = c.patient.exam?.ecg;
    if (ecg) {
      const f = new Set(ecg.findings ?? []);
      const lines: string[] = [];
      let level: AttentionLevel = "info";
      const raise = (l: AttentionLevel) => {
        if (LEVEL_ORDER[l] < LEVEL_ORDER[level]) level = l;
      };
      const qtLimit = p.sex === "F" ? 460 : p.sex === "M" ? 440 : 450;
      if (ecg.qtcMs !== undefined && ecg.qtcMs > qtLimit) {
        const QT_DRUGS = ["C01BD", "C07AA07", "N06AA", "N06AB04", "N06AB10", "N05AD01", "N05AH", "J01FA", "N07BC02", "A03FA03", "P01BA02", "A04AA"];
        const onQt = c.treatments.filter((t) => QT_DRUGS.some((x) => t.atc.startsWith(x))).map((t) => t.name);
        raise(ecg.qtcMs >= 500 ? "high" : "medium");
        lines.push(`QTc ${ecg.qtcMs} ms (normale < ${qtLimit}) : risque de torsades de pointes — kaliémie et magnésémie à corriger, éviter les médicaments qui allongent le QT (ondansétron, dropéridol, amiodarone, sotalol, antidépresseurs, macrolides, méthadone)${onQt.length ? ` ; en cours : ${onQt.join(", ")}` : ""}. Torsades : magnésium 2 g IV, isoprénaline si QT long acquis.`);
      }
      if (f.has("delta")) {
        raise("medium");
        lines.push("Pré-excitation (Wolff-Parkinson-White) : si FA à QRS larges, ni digoxine, ni anticalcique, ni bêtabloquant, ni adénosine (fibrillation ventriculaire) — cardioversion électrique.");
      }
      if (f.has("mobitz2") || f.has("avb3")) {
        raise("high");
        lines.push(`${f.has("avb3") ? "BAV complet" : "BAV 2 Mobitz 2"} (infranodal) : avis cardiologique avant une chirurgie programmée (stimulateur) ; électrodes de stimulation externe posées ; l'atropine peut aggraver un bloc infranodal — isoprénaline ou adrénaline 2–10 µg/min.`);
      } else if (f.has("mobitz1")) {
        raise("info");
        lines.push("BAV 2 Mobitz 1 (nodal, vagal) : en général bénin, corrigé par l'atropine.");
      }
      const bifascicular = f.has("lbbb") || (f.has("rbbb") && (f.has("lafb") || f.has("lpfb")));
      if (bifascicular) {
        raise(f.has("avb1") ? "medium" : "info");
        lines.push(`Bloc bifasciculaire${f.has("avb1") ? " avec BAV 1 (bloc trifasciculaire possible)" : ""} : électrodes de stimulation externe à portée ; ${f.has("lbbb") ? "BBG : signes d'ischémie ininterprétables ; " : ""}comparer avec un ECG antérieur.`);
      } else if (f.has("rbbb") || f.has("lbbb")) lines.push("Bloc de branche : signes d'ischémie difficiles à interpréter ; comparer avec un ECG antérieur.");
      if (ecg.rhythm === "af" || ecg.rhythm === "flutter") {
        raise("medium");
        lines.push(`${ecg.rhythm === "af" ? "Fibrillation auriculaire" : "Flutter"} : fréquence contrôlée ? anticoagulation (gestion selon vos règles) ; instable : cardioversion ${ecg.rhythm === "af" ? "100–150 J biphasique" : "25–50 J biphasique"} après sédation.`);
      }
      if (f.has("st_elevation")) {
        raise("high");
        lines.push("Sus-décalage du ST : syndrome coronarien aigu possible (occlusion) — avis cardiologique urgent, chirurgie programmée reportée ; infarctus inférieur : dérivations droites et postérieures.");
      }
      if (f.has("q_waves") || f.has("st_depression")) {
        raise("medium");
        lines.push(`${f.has("q_waves") ? "Ondes Q (séquelle d'infarctus)" : "Sous-décalage du ST (ischémie, HVG, surcharge)"} : cardiopathie ischémique à préciser (RCRI) ; comparer avec un ECG antérieur.`);
      }
      if (f.has("brugada")) {
        raise("high");
        lines.push("Aspect de Brugada : risque de mort subite — avis cardiologique ; éviter la fièvre et les bloqueurs sodiques à forte dose.");
      }
      if (f.has("lvh")) lines.push("HVG (S V1 + R V5 > 35 mm) : HTA, sténose aortique ou cardiomyopathie hypertrophique à rechercher ; ventricule rigide, précharge-dépendant.");
      if (f.has("rvh")) lines.push("HVD : hypertension pulmonaire, embolie, pathologie respiratoire à rechercher.");
      if (f.has("low_voltage")) lines.push("Microvoltage : épanchement péricardique ou pleural, emphysème, myxœdème, amylose.");
      if (f.has("peaked_t")) {
        raise("medium");
        lines.push(`T pointues : hyperkaliémie à exclure${p.potassium !== undefined ? ` (K⁺ ${n(p.potassium)})` : ""}.`);
      }
      if (f.has("u_wave")) lines.push(`Onde U : hypokaliémie à exclure${p.potassium !== undefined ? ` (K⁺ ${n(p.potassium)})` : ""}.`);
      if (f.has("avb1") && !bifascicular) lines.push(`BAV 1er degré${ecg.prMs ? ` (PR ${ecg.prMs} ms)` : ""} : isolé, sans conséquence.`);
      if (ecg.qrsMs !== undefined && ecg.qrsMs >= 120 && !f.has("rbbb") && !f.has("lbbb") && ecg.rhythm !== "paced") lines.push(`QRS ${ecg.qrsMs} ms : bloc de branche, pré-excitation ou trouble ventriculaire à préciser.`);
      if (ecg.prMs !== undefined && ecg.prMs < 120 && !f.has("delta")) lines.push(`PR court (${ecg.prMs} ms) : rechercher une onde delta (pré-excitation).`);
      if (lines.length)
        add({
          id: "ecg-reading",
          level,
          title: "ECG : lecture et conduite",
          detail: lines.join(" "),
          why: `ECG : ${ecgSummary(ecg)}`,
          source: `${MANUAL}, chap. 51 (ECG et arythmies)`,
          material: f.has("mobitz2") || f.has("avb3") || (bifascicular && f.has("avb1")) ? ["Électrodes de stimulation externe", "Isoprénaline"] : undefined,
        });
    }
  }

  // --- Substance use ------------------------------------------------------------------
  const sub = c.substances;
  if (sub.alcoholDependence) add({ id: "alcohol", level: "high", title: "Dépendance à l'alcool", detail: "Prévenir et surveiller le sevrage (échelle adaptée), vitamine B1.", why: "Assuétudes : dépendance à l'alcool" });
  if (sub.drugs?.includes("opioids")) add({ id: "opioid-use", level: "medium", title: "Consommation d'opioïdes", detail: "Tolérance : analgésie multimodale et ALR ; besoins en morphiniques majorés ; substitution poursuivie.", why: "Assuétudes : opioïdes" });
  if (sub.drugs?.includes("cocaine")) add({ id: "cocaine", level: "medium", title: "Cocaïne", detail: "Demander la dernière consommation ; risque cardiovasculaire en cas d'usage récent.", why: "Assuétudes : cocaïne" });
  if (sub.tobacco === "current")
    add({
      id: "tobacco",
      level: sub.packYears !== undefined && sub.packYears >= 20 ? "medium" : "info",
      title: `Tabagisme actif${sub.packYears !== undefined && sub.packYears >= 20 ? " (≥ 20 paquets-années : risque respiratoire)" : ""}`,
      detail: "Proposer l'arrêt, idéalement 6 à 8 semaines avant (morbidité respiratoire réduite). Bénéfices : 12–24 h moins de carboxyhémoglobine, 48–72 h voies aériennes moins réactives, 1–2 semaines moins de sécrétions (après une phase d'hypersécrétion), 4–6 semaines EFR améliorées. La SpO₂ surestime l'oxygénation (carboxyhémoglobine).",
      why: `Assuétudes : fumeur${sub.packYears ? ` (${sub.packYears} PA)` : ""}`,
      source: "Manuel pratique d'anesthésie 2020, chap. 28 (tableau 28.3)",
    });
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
