// Chronic post-surgical pain: flags to spot at the consultation — red
// (biomedical) and yellow (psychosocial) — and what to do about them.
// Pain persisting at 3 months after 10–50 % of operations depending on the
// surgery, severe in 2–10 % (Kehlet, Jensen, Woolf, Lancet 2006, PMID
// 16698416); risk factors and transition from acute to chronic pain (Glare,
// Aubrey, Myles, Lancet 2019, PMID 30983589); IASP definition (Schug et al.,
// Pain 2019, PMID 30586070). Teaching of the university hospital (« prévenir
// la chronicisation »).
//
// Flags deduced from the consultation (antecedents, treatments, age, sex,
// surgery) are ticked by themselves; the others are asked and ticked by hand.

import { fold } from "./catalog";
import type { ConsultationState } from "./dossier";

export type PainFlagKind = "red" | "yellow";

export interface PainFlag {
  id: string;
  kind: PainFlagKind;
  label: string;
}

export const PAIN_FLAGS: PainFlag[] = [
  { id: "preop_pain", kind: "red", label: "Douleur préopératoire intense ou chronique (au site ou ailleurs)" },
  { id: "long_term_opioids", kind: "red", label: "Opioïdes au long cours" },
  { id: "neuropathic", kind: "red", label: "Douleur neuropathique ou diffuse préexistante" },
  { id: "nerve_surgery", kind: "red", label: "Chirurgie à risque nerveux, réintervention" },
  { id: "young_female", kind: "red", label: "Jeune âge, sexe féminin" },
  { id: "acute_pain", kind: "red", label: "Douleur aiguë postopératoire intense (antécédent ou attendue)" },
  { id: "catastrophizing", kind: "yellow", label: "Catastrophisme, peur du mouvement" },
  { id: "anxiety_depression", kind: "yellow", label: "Anxiété, dépression" },
  { id: "bad_experience", kind: "yellow", label: "Mauvaise expérience (soi ou proche), attentes irréalistes" },
  { id: "sleep", kind: "yellow", label: "Troubles du sommeil" },
  { id: "work_litigation", kind: "yellow", label: "Arrêt de travail prolongé, litige" },
  { id: "isolation_substances", kind: "yellow", label: "Isolement, consommation de substances" },
];

/** Surgeries with a high rate of chronic pain (nerve injury): Kehlet 2006. */
const NERVE_SURGERY = /thoracotom|thoracoscop|vats|sternotom|pontage coronar|mastectom|tumorectomie.*sein|curage axillaire|reconstruction mammaire|amputation|hernie inguinale|cure de hernie|prothese totale (du )?genou|ptg|arthrodese|laminectom|rachis|cesarienne|hysterectomie|nephrectomie|lombotomie|iliaque|prelevement (osseux|de greffon)|reprise|reintervention|iterative/;
const NERVE_RATE: [RegExp, string][] = [
  [/amputation/, "amputation : 30–50 %"],
  [/thoracotom|sternotom|pontage coronar/, "thoracotomie, sternotomie : 30–50 %"],
  [/mastectom|tumorectomie.*sein|curage axillaire/, "chirurgie du sein : 20–30 %"],
  [/prothese totale (du )?genou|ptg/, "prothèse de genou : ≈ 20 %"],
  [/hernie inguinale|cure de hernie/, "hernie inguinale : ≈ 10 %"],
  [/cesarienne/, "césarienne : ≈ 10 %"],
];

export interface PainFlagState {
  flag: PainFlag;
  present: boolean;
  /** Why it was ticked by itself (null: ticked or left by hand). */
  deduced: string | null;
}

export interface ChronicPainRisk {
  flags: PainFlagState[];
  red: number;
  yellow: number;
  level: "low" | "intermediate" | "high";
  /** Expected rate for this surgery, when known. */
  surgeryRate?: string;
  prevention: string[];
}

export const CHRONIC_PAIN_SOURCES =
  "Kehlet, Jensen, Woolf, Lancet 2006 (PMID 16698416) ; Glare, Aubrey, Myles, Lancet 2019 (PMID 30983589) ; Schug et al. (IASP), Pain 2019 (PMID 30586070) ; enseignement universitaire (drapeaux rouges et jaunes).";

export const DISPROPORTIONATE_PAIN = "Douleur disproportionnée après l'opération : chercher une complication (syndrome des loges, hématome, ischémie, infection) avant d'augmenter les antalgiques.";

const present = (c: ConsultationState, id: string) => !!c.conditions[id]?.present;

/** What the consultation already says about each flag. */
function deduce(c: ConsultationState): Record<string, string | null> {
  const p = c.patient;
  const name = fold(c.surgery.name ?? "");
  const treatments = c.treatments;
  const atc = (re: RegExp) => treatments.filter((t) => re.test(t.atc ?? "")).map((t) => t.name);
  const opioids = atc(/^N02A/);
  const neuro = atc(/^N03AX(12|16)|^N06AA|^N06AX21/); // gabapentine, prégabaline, tricycliques, duloxétine
  const young = p.age !== undefined && p.age < 50;
  const female = p.sex === "F";
  const subst = c.substances;
  return {
    preop_pain: present(c, "chronic_pain") ? "Antécédent : douleur chronique" : null,
    long_term_opioids: opioids.length ? `Traitement : ${opioids.join(", ")}` : present(c, "opioid_use_disorder") || subst.drugs?.includes("opioids") ? "Usage d'opioïdes" : null,
    neuropathic: present(c, "neuropathy") ? "Antécédent : neuropathie" : neuro.length ? `Traitement : ${neuro.join(", ")}` : /fibromyalg/.test(fold(p.history ?? "")) ? "Fibromyalgie" : null,
    nerve_surgery: NERVE_SURGERY.test(name) ? `Intervention : ${c.surgery.name}` : null,
    young_female: young && female ? `Femme de ${p.age} ans` : null,
    acute_pain: present(c, "severe_postop_pain") ? "Antécédent : douleur postopératoire difficile à contrôler" : null,
    anxiety_depression: present(c, "anxiety") || present(c, "depression") ? `Antécédent : ${[present(c, "anxiety") ? "anxiété" : "", present(c, "depression") ? "dépression" : ""].filter(Boolean).join(", ")}` : null,
    isolation_substances: subst.alcoholDependence || present(c, "alcohol_dependence") || (subst.drugs?.length ?? 0) > 0 || present(c, "cannabis") ? "Consommation de substances" : null,
  };
}

export function chronicPainRisk(c: ConsultationState): ChronicPainRisk {
  const manual = c.painFlags ?? {};
  const auto = deduce(c);
  const flags = PAIN_FLAGS.map((flag) => {
    const deduced = auto[flag.id] ?? null;
    const set = manual[flag.id];
    return { flag, present: set ?? !!deduced, deduced: set === undefined ? deduced : null };
  });
  const red = flags.filter((f) => f.present && f.flag.kind === "red").length;
  const yellow = flags.filter((f) => f.present && f.flag.kind === "yellow").length;
  const name = fold(c.surgery.name ?? "");
  const surgeryRate = NERVE_RATE.find(([re]) => re.test(name))?.[1];
  const has = (id: string) => flags.find((f) => f.flag.id === id)!.present;
  // Young age and female sex alone are too common to raise an alert by themselves.
  const total = red + yellow;
  const level: ChronicPainRisk["level"] = total >= 3 || (has("nerve_surgery") && total >= 2) ? "high" : total >= 2 || (red >= 1 && !(red === 1 && has("young_female"))) ? "intermediate" : "low";

  const prevention = [
    "Information sur la douleur attendue et objectifs réalistes (fonction plutôt que douleur zéro) ; plan analgésique expliqué avant l'intervention.",
    "Analgésie multimodale d'emblée : paracétamol, AINS si possible, ALR (bloc ou péridurale) chaque fois qu'elle est faisable ; technique chirurgicale épargnant les nerfs.",
    has("long_term_opioids") ? "Opioïdes au long cours : poursuivre la dose de fond (ou équivalent), besoins majorés ; kétamine peropératoire (0,15–0,5 mg/kg puis 0,1–0,25 mg/kg/h) ; plan de sevrage à la sortie." : "",
    has("neuropathic") || has("nerve_surgery") || has("preop_pain") ? "Kétamine peropératoire et lidocaïne IV (si pas d'ALR) à discuter ; poursuivre les gabapentinoïdes et antidépresseurs déjà pris (pas d'introduction systématique : bénéfice non démontré)." : "",
    has("anxiety_depression") || has("catastrophizing") ? "Anxiété, catastrophisme : en parler, réassurance, psychologue ou éducation préopératoire si possible ; poursuivre le traitement habituel." : "",
    has("sleep") ? "Troubles du sommeil : les prendre en charge, ils abaissent le seuil douloureux." : "",
    "Traiter vite et fort la douleur aiguë (EVA au repos et à la mobilisation, objectif ≤ 3) ; réévaluer à J1, à la sortie, puis à 1 et 3 mois : douleur persistante ou neuropathique (DN4) → consultation douleur.",
    DISPROPORTIONATE_PAIN,
  ].filter(Boolean);

  return { flags, red, yellow, level, surgeryRate, prevention };
}
