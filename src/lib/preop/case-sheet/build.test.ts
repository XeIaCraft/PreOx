import { describe, expect, it } from "vitest";
import { parseConsultation } from "./parse";
import { buildCaseSheet, surgeryCandidates, type CaseContext } from "./build";
import { DEFAULT_CATALOGS } from "../catalog-defaults";
import { REFERENCE_PROTOCOLS } from "../reference-protocols";
import { PROPOSED_GROUPS } from "../rules/proposed";
import { DEFAULT_SERVICE_PREFS } from "../service-prefs";
import type { Rule } from "../rules/types";

// A hospital's printed note (placeholders for every name), and another layout.
const HOSPITAL = `Centre Hospitalier
Universitaire de XXXX
NOM, PRENOM PRENOM
Née le 11/12/1996 - Dossier n° 9999999
Passage n° M999999 du 01/01/2026 au 01/12/2026
Nomanest, Prenomanest
Note du 01/05/2026 11h54
Anesthésie - Avis Anesth Pré-opératoire
Intitulé intervention Salpingectomie coelio + retrait DIU Nom du chirurgien Nom
Date opératoire 03/05/2026 Hospitalisation Jour
Type d'anesthésie souhaitée AG
Age 38 ans Poids 100 kg Taille 176 cm BMI 32 kg/m²
Consignes préopératoires
A jeun strict à partir de 00h00 Liquides clairs (eau plate) jusqu'à 06h00
Antécédents médicaux
Psoriasis
Antécédents chirurgicaux
DDS
Curetage
Antécédents anesthésiques
RAS
Allergies - Hypersensibilité - Intolérances
Non connues
Traitement
/
Mode de vie
Témoin de Jéhovah Non Tabac Oui 10 cig/j
Alcool Non Stupéfiants Non
Score HEMSTOP adulte
1. Avez-vous déjà consulté un médecin ou reçu un traitement pour un
saignement prolongé ou inhabituel par exemple un saignement de nez ou une
petite coupure ?
Non
Imprimé par Nomimp, Prenomimp le 27/10/2026 à 06h51 Page 1 sur 2 Avis Anesth Pré-opératoire NOM, PRENOM PRENOM
2. Avez-vous tendance à faire des bleus de plus de 2 cm ou des hématomes
importants, sans choc ou traumatisme ou bien après un choc ou un
traumatisme sans importance ?
Non
3. Avez-vous reconsulté votre dentiste pour saignement après une extraction
dentaire ?
Non
4. Avez-vous saigné de manière anormale après une intervention chirurgicale
par exemple opération pour les végétations ou les amygdales ou après une
circoncision ?
Non
5. Y a-t-il des membres de votre famille proche suivis pour une maladie de
la coagulation qui est responsable de saignements importants par exemple
maladie de Willebrand, hémophilie ?
Non
6. POUR LES FEMMES : a) Avez-vous consulté un médecin ou reçu un
traitement pour des règles trop abondantes par exemple contraception orale
(« pilule ») traitement par fer, médicament pour coaguler le sang comme
l’Exacyl...?
Non
b) Avez-vous saigné de façon anormale après un accouchement ? Non
Score établi sur le nombre de OUI obtenus sur ces 6 questions 0 / 6
• Un score à l’HEMSTOP adulte ≥
2 rend hautement probable la présence d’un sur-risque hémorragique
péri-opératoire
Evaluation pour intubation
Mallampati Score 2
Ouverture buccale > 35 mm
Mobilité cervicale bonne (>90°)
Information données au patient
Techniques d'anesthésie
Note rédigée par Nomanest Prenomanest le 01/03/2026
Imprimé par Nomimp, Prenomimp le 27/10/2026 à 06h51 Page 2 sur 2`;

const CLINIC = `Clinique Saint-Exemple — Consultation d'anesthésie
Monsieur DUPONT DE LA TOUR, Jean-Pierre
Né le 03/04/1957
Intervention prévue : Résection endoscopique de prostate (RTUP)
Chirurgien : Dr Martin
Date d'intervention : 28/10/2026
Anesthésie proposée : Rachianesthésie
Poids : 85 kg   Taille : 1,76 m
ASA : 2
Antécédents :
HTA
Glaucome à angle fermé
Diabète de type 2 non insulinorequérant
SAOS appareillé
Antécédents chirurgicaux : cholécystectomie 2010 (AG sans particularité)
Traitement habituel :
Lodoz 5 mg 1-0-0
Metformine 1000 mg 1-0-1
Tadalafil 5 mg le soir
Allergies : pénicilline (urticaire)
Examen clinique :
Mallampati III, ouverture buccale 3 cm
Auscultation cardio-pulmonaire normale
Biologie : Hb 13,2 g/dL, plaquettes 245 G/L, créatinine 1,1 mg/dL`;

const ctx: CaseContext = {
  catalogs: DEFAULT_CATALOGS,
  rules: PROPOSED_GROUPS.flatMap((g) => g.rules).map((r) => ({ ...r, status: "active", created_at: "", updated_at: "" })) as unknown as Rule[],
  protocols: REFERENCE_PROTOCOLS.map((p) => ({ ...p, created_at: "", updated_at: "" })),
  service: DEFAULT_SERVICE_PREFS,
};

describe("case sheet", () => {
  it("finds the catalogue's intervention behind the surgeon's wording", () => {
    const names = (t: string, sex?: "M" | "F") => surgeryCandidates(DEFAULT_CATALOGS.surgeries, t, { sex }).map((s) => s.name);
    expect(names("MILLIN", "M")[0]).toBe("Adénomectomie prostatique");
    expect(names("RESECTION ENDOSCOPIQUE PROSTATE", "M")[0]).toBe("Résection transurétrale de prostate");
    expect(names("Salpingectomie coelio + retrait DIU", "F")).toEqual(["Salpingectomie ou kystectomie ovarienne par cœlioscopie", "Annexectomie par cœlioscopie"]);
    expect(names("VASECTOMIE, HDJ", "M")[0]).toMatch(/vasectomie/i);
  });

  it("asks which intervention when the wording isn't the catalogue's, then computes the plan for the patient", () => {
    const p = parseConsultation(HOSPITAL);
    const first = buildCaseSheet(p, ctx);
    expect(first.questions.map((q) => q.id)).toEqual(["surgery"]);
    const r = buildCaseSheet(p, ctx, { surgeryId: first.candidates[0].id });
    expect(r.questions).toEqual([]);
    expect(r.sheet.body).toBe("38 ans, F, 100 kg, 176 cm, IMC 32 → PI 67 kg (PA 80 kg)");
    expect(r.sheet.technique).toMatch(/^AG, IOT sonde 7, Vt 400–540 mL × 12–15, PEP 8–10$/);
    const row = (label: string) => r.sheet.rows.find((x) => x.label === label)?.parts.map((t) => t.text).join(" ") ?? "";
    expect(row("ATB")).toMatch(/^Céfazoline 2 g/);
    expect(row("Induction")).toMatch(/Propofol \d+ mg/);
    expect(row("Entretien")).toMatch(/Sévoflurane/);
    // TIVA: the TCI targets and rates for this patient.
    expect(buildCaseSheet(p, ctx, { surgeryId: first.candidates[0].id, tiva: true }).sheet.rows.find((x) => x.label === "Entretien (TIVA)")?.parts[0].text).toMatch(/Propofol AIVOC .* µg\/mL \(≈ [\d,]+ mL\/h à 1 h\)/);
  });

  it("puts in bold the antecedents that change the anaesthesia, with what they imply, and each treatment's conduct", () => {
    const r = buildCaseSheet(parseConsultation(CLINIC), ctx);
    expect(r.sheet.surgery).toBe("Résection transurétrale de prostate");
    expect(r.sheet.technique).toBe("Rachianesthésie");
    expect(r.sheet.rows.find((x) => x.label === "Rachi")?.parts[0].text).toMatch(/Bupivacaïne/);
    expect(r.sheet.antecedents.filter((a) => a.strong).map((a) => a.text)).toEqual(["Glaucome à angle fermé", "Diabète de type 2 non insulinorequérant", "SAOS appareillé"]);
    expect(r.sheet.implications.join(" ")).toMatch(/anticholinergiques/);
    expect(r.sheet.treatments.map((t) => t.text)).toEqual(expect.arrayContaining([expect.stringMatching(/^Tadalafil 5 mg le soir → STOP/)]));
    // A beta-lactam in the plan of a patient allergic to penicillin.
    expect(r.sheet.alerts.join(" ")).toMatch(/Céfuroxime au plan malgré l'allergie/);
  });

  it("asks for what is missing to compute the doses", () => {
    const r = buildCaseSheet(parseConsultation("Intervention : Cholécystectomie par cœlioscopie\nAntécédents : HTA"), ctx);
    expect(r.questions.map((q) => q.id)).toEqual(expect.arrayContaining(["sex", "age", "weightKg", "heightCm"]));
    expect(r.sheet.alerts).toContain("Allergies non renseignées dans la consultation");
  });

  it("reads a patient entered by hand, with a dictation or another consultation pasted under it", () => {
    const raw = [
      "Initiales : AB",
      "Sexe : M",
      "Intervention : Hémorroïdectomie",
      "Type d'anesthésie : AG",
      "Age 42 ans Poids 110 kg Taille 173 cm",
      "",
      "Diabète type 2 et HTA, sous metformine 1000 mg 2x/j et Coversyl 5 mg. Allergie au latex.",
    ].join("\n");
    const r = buildCaseSheet(parseConsultation(raw), ctx);
    expect(r.sheet.initials).toBe("AB");
    expect(r.sheet.body).toMatch(/^42 ans, M, 110 kg, 173 cm/);
    expect(r.sheet.antecedents.map((a) => a.text).join(" | ")).toMatch(/Diabète/);
    expect(r.sheet.treatments.map((t) => t.text).join(" | ")).toMatch(/metformine/i);
    expect(r.sheet.allergies.map((a) => a.text).join(" ")).toMatch(/latex/);

    // An emergency note added below a « --- » line: read too, under no heading.
    const more = buildCaseSheet(parseConsultation(`${raw}\n---\nUrgences : patient connu pour un SAOS appareillé.`), ctx);
    expect(more.sheet.antecedents.map((a) => a.text).join(" | ")).toMatch(/SAOS/);
  });

  it("uses the plan adapted for the patient instead of the protocol's", () => {
    const p = parseConsultation(CLINIC);
    const base = buildCaseSheet(p, ctx);
    const plan = { ...base.plan, drugs: base.plan.drugs.map((d) => (/bupivaca/i.test(d.name) ? { ...d, amount: 12.5 } : d)) };
    const r = buildCaseSheet(p, ctx, { plan });
    expect(r.sheet.rows.find((x) => x.label === "Rachi")?.parts[0].text).toMatch(/12,5 mg/);
  });

  it("prepares a general anaesthesia behind a spinal, even when the protocol has none", () => {
    const r = buildCaseSheet(parseConsultation(CLINIC), ctx);
    expect(r.sheet.fallback?.mode).toBe("general");
    expect(r.sheet.fallback?.technique).toMatch(/^AG, (ML|IOT)/);
    const induction = r.sheet.fallback?.rows.find((x) => x.label === "Induction")?.parts.map((t) => t.text).join(" ") ?? "";
    expect(induction).toMatch(/Propofol \d+ mg/);
    expect(induction).toMatch(/Sufentanil [\d,]+ µg/);
    expect(r.sheet.fallback?.rows.find((x) => x.label === "Entretien")?.parts[0].text).toMatch(/Sévoflurane/);
    // None asked: no plan B.
    expect(buildCaseSheet(parseConsultation(CLINIC), ctx, { fallback: null }).sheet.fallback).toBeUndefined();
  });

  it("offers the spinal as plan B of a general anaesthesia when the procedure allows it", () => {
    const p = parseConsultation(CLINIC);
    const ga = buildCaseSheet(p, ctx, { mode: "general" });
    expect(ga.sheet.fallback).toBeUndefined();
    expect(ga.fallbackModes).toContain("neuraxial");
    const withB = buildCaseSheet(p, ctx, { mode: "general", fallback: "neuraxial" });
    expect(withB.sheet.fallback?.rows.find((x) => x.label === "Rachi")?.parts[0].text).toMatch(/Bupivacaïne/);
  });
});
