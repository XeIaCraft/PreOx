// Points of attention generated from the whole consultation. Most come from
// the catalogues (Paramètres): each antecedent, allergen, treatment or
// treatment class can carry a point of attention with equipment. The rest
// are computed here from the scores and the intervention (predicted
// difficult airway, pulmonary risk, BP, bleeding risk…). They are reminders
// of well-established precautions, not prescriptions — no dose, no timing
// that belongs to a guideline (those come from your rules).

import { treatmentMatches } from "./medications";
import { QUALIFIER_LABELS, has } from "./history";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import { fold, type AllergenItem, type AttentionSpec } from "./catalog";
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
    const med = catalogs.medications.find((m) => m.atc === t.atc || m.id === t.atc);
    if (med?.attention) add(fromSpec(`med-${med.id}`, t.name, med.attention, `Traitement : ${t.name}`, med.source));
    const classes = catalogs.drugClasses.filter((k) => treatmentMatches(t, k.atc));
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
