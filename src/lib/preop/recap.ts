// Everything of the consultation, in the order of a paper preoperative
// consultation sheet — to copy it onto the official form.

import { ASA_CLASSES, CLINICAL_FRAILTY_SCALE, MALLAMPATI_CLASSES } from "./scores";
import { SYSTEM_LABELS, SYSTEM_ORDER } from "./catalog";
import { QUALIFIER_LABELS, substanceSummary, type Qualifier } from "./history";
import { allergySummary, examSummary, RISK_GRADES, type ConsultationState } from "./dossier";
import { conditionDetailsShort } from "./attention";
import { BLEEDING_RISKS, SURGERY_GRADES } from "./surgeries";
import { EXAM_LABELS, autoExamState, type ExamCode } from "./exams";
import { INDICATIONS, TECHNIQUES } from "./rules/types";
import type { ConsultationScores } from "./consultation-scores";
import type { AttentionPoint } from "./attention";
import type { Instructions } from "./instructions";

export interface RecapSection {
  title: string;
  lines: string[];
}

const n = (v: number | undefined, unit = "") => (v === undefined ? "" : `${String(Math.round(v * 10) / 10).replace(".", ",")}${unit}`);
const ROMAN = ["I", "II", "III", "IV", "V"];

export function consultationRecap(c: ConsultationState, scores: ConsultationScores, extras: { points: AttentionPoint[]; instructions: Instructions; initials?: string }): RecapSection[] {
  const p = c.patient;
  const r = scores.results;
  const sections: RecapSection[] = [];
  const push = (title: string, lines: (string | false | 0 | null | undefined)[]) => {
    const kept = lines.filter((l): l is string => !!l && !!l.trim());
    if (kept.length) sections.push({ title, lines: kept });
  };

  push("Patient", [
    [extras.initials, p.sex === "M" ? "homme" : p.sex === "F" ? "femme" : "", p.age !== undefined ? `${p.age} ans` : ""].filter(Boolean).join(", "),
    [p.weightKg ? `Poids ${n(p.weightKg, " kg")}` : "", p.heightCm ? `taille ${n(p.heightCm, " cm")}` : "", scores.derived.bmi ? `IMC ${n(scores.derived.bmi)}` : ""].filter(Boolean).join(" · "),
  ]);

  const s = c.surgery;
  push("Intervention", [
    [s.name, s.side && `(${s.side})`, s.emergency && "— urgence"].filter(Boolean).join(" "),
    c.plannedAt && `Prévue le ${new Date(c.plannedAt).toLocaleString("fr-BE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}${c.hospital ? `, ${c.hospital}` : ""}`,
    s.surgeon && `Chirurgien : ${s.surgeon}`,
    [
      s.kce && `grade ${SURGERY_GRADES.find((g) => g.code === s.kce)?.label.toLowerCase()}`,
      s.cardiacRisk && `risque cardiaque ${RISK_GRADES.find((g) => g.code === s.cardiacRisk)?.label.toLowerCase()}`,
      s.bleedingRisk && `risque hémorragique ${BLEEDING_RISKS.find((g) => g.code === s.bleedingRisk)?.label.toLowerCase()}`,
    ]
      .filter(Boolean)
      .join(", "),
    [s.position && `Position : ${s.position}`, s.durationHours && `durée ≈ ${n(s.durationHours, " h")}`].filter(Boolean).join(" · "),
    c.techniques.length > 0 && `Anesthésie envisagée : ${c.techniques.map((t) => TECHNIQUES.find((x) => x.code === t)?.label.split(" (")[0] ?? t).join(" + ")}`,
  ]);

  // Antecedents, system by system, in catalogue order.
  const bySystem: string[] = [];
  const reviewed = new Set(c.historyReviewed ?? []);
  for (const sys of SYSTEM_ORDER) {
    const items = scores.catalogs.conditions.filter((i) => i.system === sys && scores.conditions[i.id]?.present);
    const labels = items.map((i) => {
      const e = scores.conditions[i.id]!;
      const short = conditionDetailsShort(i, e);
      const q = (Object.keys(i.qualifiers ?? {}) as Qualifier[]).filter((k) => e[k] && !short.qualifiers.includes(k)).map((k) => i.qualifiers?.[k] ?? QUALIFIER_LABELS[k]);
      const all = [...new Set([...q, ...short.text])];
      return `${i.label}${all.length ? ` (${all.join(", ")})` : ""}${e.detail ? ` : ${e.detail}` : ""}`;
    });
    if (labels.length) bySystem.push(`${SYSTEM_LABELS[sys]} : ${labels.join(", ")}`);
    else if (reviewed.has(sys)) bySystem.push(`${SYSTEM_LABELS[sys]} : RAS`);
  }
  push("Antécédents médicaux", [...bySystem, p.history]);
  push("Antécédents chirurgicaux et anesthésiques", [p.surgicalHistory]);
  push("Allergies", [allergySummary(p) || "Non renseignées"]);
  push("Assuétudes", [substanceSummary(c.substances)]);
  push(
    "Traitements",
    c.treatments.map((t) => {
      const ind = t.indication ? INDICATIONS.find((i) => i.code === t.indication)?.label.toLowerCase() : "";
      return `${t.name}${t.dailyDoseMg ? ` ${t.dailyDoseMg} mg/j` : ""}${ind ? ` (${ind})` : ""}`;
    })
  );

  const airway = [
    c.mallampati && `Mallampati ${MALLAMPATI_CLASSES[c.mallampati - 1].label}`,
    c.airway.mouthOpeningUnder4cm !== undefined && `ouverture de bouche ${c.airway.mouthOpeningUnder4cm ? "< 4 cm" : "≥ 4 cm"}`,
    c.airway.thyromentalCm !== undefined && `DTM ${n(c.airway.thyromentalCm, " cm")}`,
    c.airway.neckMovementDeg !== undefined && `mobilité cervicale ${c.airway.neckMovementDeg}°`,
    c.airway.canProtrudeMandible !== undefined && `propulsion mandibulaire ${c.airway.canProtrudeMandible ? "possible" : "impossible"}`,
    p.neckCm !== undefined && `tour de cou ${n(p.neckCm, " cm")}`,
    c.maskVentilation.edentulous && "édenté",
    c.maskVentilation.beard && "barbe",
  ].filter(Boolean);
  push("Examen clinique", [
    [p.sbp !== undefined && `PA ${p.sbp}${p.dbp !== undefined ? `/${p.dbp}` : ""} mmHg`, p.hr !== undefined && `FC ${p.hr}/min`, p.spo2 !== undefined && `SpO₂ ${p.spo2} %`].filter(Boolean).join(" · "),
    examSummary(p.exam) && `Examen : ${examSummary(p.exam)}`,
    airway.length > 0 && `Voies aériennes : ${airway.join(", ")}`,
    r.airway.label && `${r.airway.label} (El-Ganzouri ${r.airway.value})`,
    r.mask.label && `${r.mask.label} (Langeron ${r.mask.value}/5)`,
  ]);

  const bio = [p.hb !== undefined && `Hb ${n(p.hb)} g/dL`, p.platelets !== undefined && `plaquettes ${n(p.platelets)} G/L`, p.inr !== undefined && `INR ${n(p.inr)}`, p.creatinineMgDl !== undefined && `créatinine ${n(p.creatinineMgDl)} mg/dL`, scores.derived.egfr !== undefined && `DFGe ${Math.round(scores.derived.egfr)}`, p.hba1c !== undefined && `HbA1c ${n(p.hba1c)} %`].filter(Boolean);
  const examLines = scores.exams.recommendations.map((e) => {
    const st = c.exams[e.code] ?? autoExamState(e.code as ExamCode, p);
    const status = !st || st.status === "todo" ? "à demander" : st.status === "requested" ? "demandé" : st.status === "available" ? `disponible${st.note ? ` : ${st.note}` : ""}` : "non retenu";
    return `${EXAM_LABELS[e.code as ExamCode].split(" (")[0]} : ${status}`;
  });
  push("Biologie et examens", [bio.length > 0 && bio.join(" · "), ...examLines]);

  push("Scores", [
    scores.asa && `ASA ${ROMAN[scores.asa - 1]}${s.emergency ? "E" : ""}${c.asa ? "" : " (suggéré)"}`,
    [c.nyha && `NYHA ${ROMAN[c.nyha - 1]}`, c.frailty && `CFS ${c.frailty} (${CLINICAL_FRAILTY_SCALE[c.frailty - 1].detail.toLowerCase()})`, r.dasi.missing === 0 && `DASI ${r.dasi.value} (${r.dasi.mets} METs)`].filter(Boolean).join(" · "),
    r.rcri.label && `Lee ${r.rcri.value} (${r.rcri.label.toLowerCase()})`,
    r.stopBang.label && `STOP-BANG ${r.stopBang.value}/8 (${r.stopBang.label.toLowerCase()})`,
    r.apfel.label && `Apfel ${r.apfel.value}/4 (${r.apfel.label.toLowerCase()})`,
    r.ariscat.label && `ARISCAT ${r.ariscat.value} (${r.ariscat.label.toLowerCase()})`,
    r.hemstop.missing === 0 && `HEMSTOP ${r.hemstop.value}/7`,
    r.cha.label && (scores.conditions.arrhythmia?.present ?? false) && `CHA₂DS₂-VASc ${r.cha.value}`,
    r.hasBled.label && (scores.conditions.arrhythmia?.present ?? false) && `HAS-BLED ${r.hasBled.value}`,
  ]);

  push(
    "Points d'attention",
    extras.points.filter((x) => x.level !== "info").map((x) => `${x.title} — ${x.detail}`)
  );
  push("Consignes données", [...extras.instructions.fasting, ...extras.instructions.treatments]);
  push("Notes", [c.notes]);
  return sections;
}

export function recapText(sections: RecapSection[]): string {
  return sections.map((s) => `${s.title.toUpperCase()}\n${s.lines.join("\n")}`).join("\n\n");
}

export { ASA_CLASSES };
