// Points of attention generated from the whole consultation. Most come from
// the catalogues (Paramètres): each antecedent, allergen, treatment or
// treatment class can carry a point of attention with equipment. The rest
// are computed here from the scores and the intervention (predicted
// difficult airway, pulmonary risk, BP, bleeding risk…). They are reminders
// of well-established precautions, not prescriptions — no dose, no timing
// that belongs to a guideline (those come from your rules).

import { atcMatches } from "./medications";
import { has } from "./history";
import { bpLabel } from "./derive";
import { DEFAULT_CATALOGS } from "./catalog-defaults";
import { fold, type AllergenItem, type AttentionSpec } from "./catalog";
import type { ConsultationScores } from "./consultation-scores";
import type { ConsultationState } from "./dossier";
import type { ProtocolContent, ProtocolRisk } from "./protocols";
import type { Qualifier } from "./history";

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

const fromSpec = (id: string, title: string, spec: AttentionSpec, risk?: ProtocolRisk): AttentionPoint => ({ id, level: spec.level, title, detail: spec.text, material: spec.material, risk });

/** Allergens recognised in the patient's allergies (structured entries and free text). */
export function recognisedAllergens(c: ConsultationState, allergens: AllergenItem[] = DEFAULT_CATALOGS.allergens): { allergen: AllergenItem; as: string }[] {
  const out: { allergen: AllergenItem; as: string }[] = [];
  const entries = c.patient.allergyList ?? [];
  for (const e of entries) {
    const a = e.allergenId ? allergens.find((x) => x.id === e.allergenId) : undefined;
    if (a && !out.some((o) => o.allergen.id === a.id)) out.push({ allergen: a, as: e.label });
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

  // --- Allergies ---------------------------------------------------------------------
  for (const { allergen, as } of recognisedAllergens(c, catalogs.allergens)) {
    add(fromSpec(`allergy-${allergen.id}`, `Allergie : ${allergen.label}${fold(as) !== fold(allergen.label) ? ` (${as})` : ""}`, allergen.attention));
    for (const d of plan?.drugs ?? []) {
      if (allergen.drugWords.some((w) => fold(d.name).includes(fold(w))))
        add({ id: `allergy-plan-${allergen.id}-${d.id}`, level: "high", title: `${d.name} au plan malgré l'allergie : ${allergen.label}`, detail: "Revoir ce produit (réactivité croisée possible) ou confirmer qu'il est toléré." });
    }
  }

  // --- Antecedents (catalogue) -----------------------------------------------------------
  for (const item of catalogs.conditions) {
    const e = cond[item.id];
    if (!e?.present) continue;
    const q = (Object.keys(item.attentionIf ?? {}) as Qualifier[]).find((k) => e[k]);
    const spec = q ? item.attentionIf![q]! : item.attention;
    if (spec) add(fromSpec(`cond-${item.id}`, item.label, spec));
  }

  // --- Treatments (catalogue: the product, then its classes) ------------------------------
  for (const t of c.treatments) {
    const med = catalogs.medications.find((m) => m.atc === t.atc || m.id === t.atc);
    if (med?.attention) add(fromSpec(`med-${med.id}`, t.name, med.attention));
    for (const k of catalogs.drugClasses) if (k.attention && atcMatches(t.atc, k.atc)) add(fromSpec(`class-${k.id}`, k.label, k.attention));
  }

  // --- Computed from the scores and the intervention ----------------------------------------
  if (r.airway.level === "high" && !has(cond, "difficult_airway"))
    add({
      id: "airway",
      level: "high",
      title: "Intubation difficile prévisible",
      detail: "Stratégie décidée à l'avance selon l'algorithme du service ; préoxygénation optimisée ; matériel en salle.",
      material: ["Vidéolaryngoscope", "Chariot d'intubation difficile", "Dispositifs supraglottiques"],
      risk: { title: "Intubation difficile", conduct: "Appel à l'aide précoce, plan B supraglottique, plan C oxygénation, plan D abord cervical selon l'algorithme." },
    });
  if (r.mask.level === "high") add({ id: "mask", level: "medium", title: "Ventilation au masque difficile prévisible", detail: "Préoxygénation optimisée, canule oropharyngée et ventilation à deux mains prêtes.", material: ["Canules oropharyngées"] });
  if (r.stopBang.level === "high" && !has(cond, "osa")) add({ id: "osa-risk", level: "medium", title: "Risque élevé de SAOS (STOP-BANG)", detail: "Épargne morphinique, ALR si possible, surveillance de la SpO₂ au réveil." });
  if (r.ariscat.level === "high") add({ id: "lung", level: "high", title: "Risque élevé de complications pulmonaires (ARISCAT)", detail: "Ventilation protectrice, kinésithérapie respiratoire, analgésie épargnant les morphiniques." });
  if ((p.sbp ?? 0) >= 180 || (p.dbp ?? 0) >= 110)
    add({ id: "bp", level: "high", title: bpLabel(p.sbp, p.dbp), detail: "Contrôler la mesure ; hypertension non contrôlée : discuter l'optimisation, voire le report d'une chirurgie programmée." });
  if (r.rcri.value >= 2 || (r.dasi.missing === 0 && r.dasi.mets < 4 && c.surgery.cardiacRisk !== "low"))
    add({ id: "cardiac-risk", level: "medium", title: "Risque cardiaque augmenté", detail: "Évaluation selon ESC 2022 : ECG, biomarqueurs, échocardiographie selon la capacité fonctionnelle (voir les examens)." });
  if (c.surgery.bleedingRisk === "high")
    add({ id: "bleeding", level: "medium", title: "Chirurgie à risque hémorragique élevé", detail: "Groupe sanguin et recherche d'agglutinines irrégulières selon la procédure du service ; épargne sanguine.", material: ["Groupe / RAI valides", "Accès veineux de bon calibre"] });
  if (r.hemstop.value > 0 && !has(cond, "bleeding_disorder")) add({ id: "hemstop", level: "medium", title: "Questionnaire hémorragique positif", detail: "Bilan d'hémostase ciblé ; avis hématologique selon les réponses." });
  if ((c.frailty ?? 0) >= 5 || (p.age ?? 0) >= 75)
    add({ id: "delirium", level: "medium", title: "Risque de delirium postopératoire", detail: "Limiter benzodiazépines et anticholinergiques, repères, lunettes et appareils auditifs, mobilisation précoce." });
  if (r.apfel.level === "high") add({ id: "ponv", level: "medium", title: "Risque élevé de NVPO (Apfel)", detail: "Prophylaxie multimodale, épargne morphinique." });

  // --- Substance use ------------------------------------------------------------------
  const s = c.substances;
  if (s.alcoholDependence) add({ id: "alcohol", level: "high", title: "Dépendance à l'alcool", detail: "Prévenir et surveiller le sevrage (échelle adaptée), vitamine B1." });
  if (s.drugs?.includes("opioids")) add({ id: "opioid-use", level: "medium", title: "Consommation d'opioïdes", detail: "Tolérance : analgésie multimodale et ALR ; besoins en morphiniques majorés ; substitution poursuivie." });
  if (s.drugs?.includes("cocaine")) add({ id: "cocaine", level: "medium", title: "Cocaïne", detail: "Demander la dernière consommation ; risque cardiovasculaire en cas d'usage récent." });
  if (s.tobacco === "current") add({ id: "tobacco", level: "info", title: "Tabagisme actif", detail: "Proposer l'arrêt : le bénéfice est d'autant plus grand que l'arrêt est précoce." });
  if (c.surgery.emergency) add({ id: "emergency", level: "info", title: "Chirurgie urgente", detail: "Jeûne à vérifier ; risque majoré." });

  const order: Record<AttentionLevel, number> = { high: 0, medium: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
