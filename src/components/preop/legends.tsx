// Legends of the scores and classifications, shown in an « i » bubble
// (InfoTip) so they never take room on the screen. Each one says how the
// score is built and how to read it, with its source.

import { Legend } from "@/components/preop/ui";
import {
  APFEL_REFERENCE,
  ARISCAT_REFERENCE,
  CHA2DS2VASC_REFERENCE,
  CLINICAL_FRAILTY_SCALE,
  DASI_REFERENCE,
  HEMSTOP_REFERENCE,
  NYHA_CLASSES,
  RCRI_REFERENCE,
  STOP_BANG_REFERENCE,
} from "@/lib/preop/scores";

/** ASA with the examples of the KCE report 280 (table 1, after the ASA 2014–2020 examples). */
export const ASA_LEGEND = (
  <Legend
    rows={[
      { code: "I", text: "Patient en bonne santé." },
      { code: "II", text: "Anomalie systémique modérée : tabagisme, alcool « social », grossesse, obésité (IMC 30–40), diabète ou HTA bien contrôlés, affection pulmonaire sans gravité." },
      { code: "III", text: "Anomalie systémique sévère : diabète ou HTA mal contrôlés, BPCO, IMC ≥ 40, hépatite active, dépendance à l'alcool, pacemaker, FE modérément abaissée, dialyse régulière, IDM / AVC / AIT / stent > 3 mois." },
      { code: "IV", text: "Menace vitale : IDM / AVC / AIT / stent < 3 mois, ischémie continue ou valvulopathie sévère, FE fortement abaissée, sepsis, CIVD, insuffisance rénale terminale sans dialyse régulière." },
      { code: "V", text: "Moribond : ne survivrait pas sans l'intervention (rupture d'anévrisme, polytraumatisme grave…)." },
      { code: "E", text: "Ajouté si l'intervention est urgente." },
    ]}
    source="ASA Physical Status Classification ; exemples : KCE Report 280 (2016), tableau 1."
  />
);

export const NYHA_LEGEND = (
  <Legend rows={NYHA_CLASSES.map((c) => ({ code: ["I", "II", "III", "IV"][c.code - 1], text: c.detail }))} source="New York Heart Association : dyspnée ou fatigue d'origine cardiaque selon l'effort qui les déclenche." />
);

export const CFS_LEGEND = (
  <Legend
    rows={CLINICAL_FRAILTY_SCALE.map((c) => ({ code: String(c.code), text: c.detail }))}
    source="Clinical Frailty Scale (Rockwood et al., CMAJ 2005) : état des 2 semaines précédentes. ≥ 5 : fragile (risque de complications, de délirium et de perte d'autonomie) ; validée à partir de 65 ans."
  />
);

export const RCRI_LEGEND = (
  <Legend
    rows={[
      { code: "1 pt", text: "chirurgie intrapéritonéale, intrathoracique ou vasculaire sus-inguinale ; cardiopathie ischémique ; insuffisance cardiaque ; AVC ou AIT ; diabète sous insuline ; créatinine > 2 mg/dL" },
      { code: "0", text: "classe I — complication cardiaque majeure à 30 j ≈ 3,9 %" },
      { code: "1", text: "classe II — ≈ 6 %" },
      { code: "2", text: "classe III — ≈ 10 %" },
      { code: "≥ 3", text: "classe IV — ≈ 15 %" },
    ]}
    source={`${RCRI_REFERENCE.label} ; risques actualisés : Duceppe et al., Can J Cardiol 2017.`}
  />
);

export const STOP_BANG_LEGEND = (
  <Legend
    rows={[
      { code: "1 pt", text: "ronflement, fatigue diurne, apnées observées, HTA, IMC > 35, âge > 50 ans, cou > 40 cm, sexe masculin" },
      { code: "0–2", text: "risque faible de SAOS" },
      { code: "3–4", text: "risque intermédiaire" },
      { code: "5–8", text: "risque élevé (ou STOP ≥ 2 avec homme, IMC > 35 ou cou > 40 cm)" },
    ]}
    source={STOP_BANG_REFERENCE.label}
  />
);

export const APFEL_LEGEND = (
  <Legend
    rows={[
      { code: "1 pt", text: "sexe féminin, non-fumeur, antécédent de NVPO ou mal des transports, opioïdes postopératoires" },
      { code: "0–4", text: "risque de NVPO ≈ 10, 21, 39, 61, 79 %" },
    ]}
    source={`${APFEL_REFERENCE.label}. Prophylaxie : 2 antiémétiques dès 1–2 facteurs (Gan et al., Anesth Analg 2020).`}
  />
);

export const ARISCAT_LEGEND = (
  <Legend
    rows={[
      { code: "Âge", text: "51–80 ans : 3 · > 80 ans : 16" },
      { code: "SpO₂", text: "91–95 % : 8 · ≤ 90 % : 24 (air ambiant)" },
      { code: "Inf.", text: "infection respiratoire le mois précédent : 17" },
      { code: "Hb", text: "anémie préopératoire (Hb ≤ 10 g/dL) : 11" },
      { code: "Incis.", text: "abdominale haute : 15 · intrathoracique : 24" },
      { code: "Durée", text: "2–3 h : 16 · > 3 h : 23" },
      { code: "Urg.", text: "chirurgie urgente : 8" },
      { code: "< 26", text: "risque faible de complication pulmonaire postopératoire (≈ 1,6 %)" },
      { code: "26–44", text: "intermédiaire (≈ 13 %)" },
      { code: "≥ 45", text: "élevé (≈ 42 %) : kinésithérapie respiratoire, ventilation protectrice, analgésie épargnant la toux" },
    ]}
    source={`${ARISCAT_REFERENCE.label}. Complications : infection, insuffisance respiratoire, épanchement, atélectasie, pneumothorax, bronchospasme, pneumopathie d'inhalation.`}
  />
);

export const HEMSTOP_LEGEND = (
  <Legend
    rows={[
      { code: "7 q.", text: "hématomes spontanés, saignement prolongé après une plaie, règles abondantes traitées, saignement anormal opératoire, après extraction dentaire, hémorragie du post-partum, trouble familial" },
      { code: "≥ 1", text: "anamnèse hémorragique positive : compléter et envisager un bilan d'hémostase (KCE 280 : seulement sur anamnèse ou hépatopathie, jamais en routine)" },
    ]}
    source={HEMSTOP_REFERENCE.label}
  />
);

export const DASI_LEGEND = (
  <Legend
    rows={[
      { code: "12 q.", text: "activités que le patient peut faire, pondérées (2,75 à 8 points)" },
      { code: "METs", text: "(0,43 × DASI + 9,6) / 3,5" },
      { code: "> 34", text: "capacité suffisante (≈ ≥ 4 METs) : pas d'examen supplémentaire pour la capacité" },
      { code: "< 4 METs", text: "mauvaise capacité (ne monte pas 2 étages) : avec des facteurs de risque, une imagerie de stress peut être envisagée si elle change la stratégie (KCE 280)" },
    ]}
    source={DASI_REFERENCE.label}
  />
);

export const CHA2DS2VASC_LEGEND = (
  <Legend
    rows={[
      { code: "1 pt", text: "insuffisance cardiaque, HTA, diabète, maladie vasculaire, âge 65–74 ans, sexe féminin" },
      { code: "2 pts", text: "âge ≥ 75 ans, AVC / AIT / embolie" },
      { code: "> 6", text: "risque thrombotique élevé en péri-opératoire : relais à discuter (ESC 2022)" },
    ]}
    source={CHA2DS2VASC_REFERENCE.label}
  />
);
