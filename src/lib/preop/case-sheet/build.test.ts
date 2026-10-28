import { describe, expect, it } from "vitest";
import { parseConsultation } from "./parse";
import { buildCaseSheet, surgeryCandidates, type CaseContext, type ItemSection } from "./build";
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

type Result = ReturnType<typeof buildCaseSheet>;
const sec = (r: Result, s: ItemSection) => r.sheet.items.filter((i) => i.section === s);
const texts = (r: Result, s: ItemSection) => sec(r, s).map((i) => i.text);
/** Treatments as printed: « line → conduct ». */
const ttt = (r: Result) => sec(r, "ttt").map((i) => `${i.text}${i.detail ? ` → ${i.detail}` : ""}`);

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
    expect(sec(r, "atcd").filter((a) => a.strong).map((a) => a.text)).toEqual(["Glaucome à angle fermé", "Diabète de type 2 non insulinorequérant", "SAOS appareillé"]);
    expect(sec(r, "atcd").map((a) => a.detail ?? "").join(" ")).toMatch(/anticholinergiques/);
    expect(ttt(r)).toEqual(expect.arrayContaining([expect.stringMatching(/^Tadalafil 5 mg le soir → STOP/)]));
    // A beta-lactam in the plan of a patient allergic to penicillin.
    expect(texts(r, "alert").join(" ")).toMatch(/Céfuroxime au plan malgré l'allergie/);
  });

  it("asks for what is missing to compute the doses", () => {
    const r = buildCaseSheet(parseConsultation("Intervention : Cholécystectomie par cœlioscopie\nAntécédents : HTA"), ctx);
    expect(r.questions.map((q) => q.id)).toEqual(expect.arrayContaining(["sex", "age", "weightKg", "heightCm"]));
    expect(texts(r, "alert")).toContain("Allergies non renseignées dans la consultation");
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
    expect(texts(r, "atcd").join(" | ")).toMatch(/Diabète/);
    expect(ttt(r).join(" | ")).toMatch(/metformine/i);
    expect(texts(r, "allergy").join(" ")).toMatch(/latex/);

    // An emergency note added below a « --- » line: read too, under no heading.
    const more = buildCaseSheet(parseConsultation(`${raw}\n---\nUrgences : patient connu pour un SAOS appareillé.`), ctx);
    expect(texts(more, "atcd").join(" | ")).toMatch(/SAOS/);
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

  it("knows the onset and context-sensitive half-time of the plan's anaesthesia drugs, plan B's too", () => {
    const r = buildCaseSheet(parseConsultation(CLINIC), ctx);
    const pk = r.sheet.kinetics.map((k) => `${k.name} : onset ${k.onset}${k.csht ? ` · ½-vie contextuelle ${k.csht}` : ""}`).join(" | ");
    expect(pk).toMatch(/Bupivacaïne hyperbare : onset 5–10 min/);
    expect(pk).toMatch(/Propofol : onset 30–45 s · ½-vie contextuelle ≈ 10 min \(1 h\)/);
    expect(pk).toMatch(/Sévoflurane : onset/);
    expect(pk).not.toMatch(/Paracétamol/);
  });

  it("sorts every line of another consultation in its own words, the ones it can't place in the notes", () => {
    const er = [
      "Motif d'admission : douleur anale",
      "Antécédents personnels :",
      "- HTA traitée depuis 2015",
      "- Tabagisme très ancien (sevré depuis 20 ans, 30 PA)",
      "- FA paroxystique sous Eliquis",
      "Traitement à domicile :",
      "Eliquis 5 mg 1-0-1",
      "Allergies : iode (éruption cutanée)",
    ].join("\n");
    const raw = `Initiales : AB\nSexe : M\nIntervention : Fissure anale\nAge 60 ans Poids 80 kg Taille 175 cm\n---\n${er}\n---\nTabagisme très ancien\nVit seul, autonome`;
    const r = buildCaseSheet(parseConsultation(raw), ctx);
    expect(texts(r, "atcd")).toEqual(["HTA traitée depuis 2015", "FA paroxystique sous Eliquis"]);
    expect(texts(r, "habit")).toEqual(["Tabagisme très ancien (sevré depuis 20 ans, 30 PA)", "Tabagisme très ancien"]);
    expect(ttt(r)).toEqual([expect.stringMatching(/^Eliquis 5 mg 1-0-1 → (STOP|arrêt)/)]);
    expect(texts(r, "allergy")).toEqual(["iode (éruption cutanée)"]);
    // Nothing recognised: in the notes as written, no question.
    expect(texts(r, "note")).toEqual(["Motif d'admission : douleur anale", "Vit seul, autonome"]);
    expect(r.questions).toEqual([]);
    // Moved, corrected, added, in bold on the sheet: read again.
    const changed = buildCaseSheet(parseConsultation(raw), ctx, {
      lines: { "Vit seul, autonome": "habit", "Motif d'admission : douleur anale": "ignore" },
      edits: { "HTA traitée depuis 2015": "HTA mal contrôlée" },
      added: [
        { id: "a1", section: "atcd", text: "Asthme sévère" },
        { id: "a2", section: "ttt", text: "Metformine 1 g 2x/j" },
      ],
      strong: { "atcd:HTA traitée depuis 2015": true },
    });
    expect(texts(changed, "note")).toEqual([]);
    expect(texts(changed, "habit")).toContain("Vit seul, autonome");
    const hta = sec(changed, "atcd").find((a) => a.text === "HTA mal contrôlée")!;
    expect(hta.strong).toBe(true);
    const asthma = sec(changed, "atcd").find((a) => a.text === "Asthme sévère")!;
    expect(asthma).toMatchObject({ key: "add:a1", strong: true });
    expect(asthma.detail).toBeTruthy();
    expect(ttt(changed)).toEqual(expect.arrayContaining([expect.stringMatching(/^Metformine 1 g 2x\/j → arrêt/)]));
  });

  it("uses another protocol of the library when one is chosen", () => {
    const p = parseConsultation(CLINIC);
    const other = ctx.protocols.find((x) => /cœlioscopie gynécologique/i.test(x.name))!;
    const r = buildCaseSheet(p, ctx, { protocolId: other.id, mode: "general" });
    expect(r.protocol?.id).toBe(other.id);
    expect(r.sheet.rows.find((x) => x.label === "ATB")?.parts[0].text).toMatch(/Céfazoline/);
    expect(buildCaseSheet(p, ctx, { protocolId: null }).protocol?.name).toMatch(/Résection transurétrale/);
  });

  it("says once what an antecedent or a treatment listed twice implies (two consultations of the patient)", () => {
    const raw = `${CLINIC}\n---\nAntécédents :\nDiabète de type 2\nDiabète de type 2 sous ADO, HbA1c 7,8 %\nTraitement :\nEliquis 5 mg 1-0-1\nApixaban 5 mg 2x/j`;
    const r = buildCaseSheet(parseConsultation(raw), ctx);
    const diabetes = sec(r, "atcd").filter((a) => /Diabète/.test(a.text));
    expect(diabetes.length).toBeGreaterThanOrEqual(2);
    expect(diabetes.filter((a) => a.detail)).toHaveLength(1);
    const apixaban = sec(r, "ttt").filter((t) => /Eliquis|Apixaban/.test(t.text));
    expect(apixaban.map((t) => t.detail)).toEqual([expect.stringMatching(/^STOP/), "idem"]);
    expect(apixaban[1].conduct).toBe("stop");
  });

  it("lists the work-up the procedure, the technique and the patient need, and finds what is there", () => {
    const raw = `${CLINIC}\n---\nTraitement :\nXarelto 20 mg le soir`;
    const r = buildCaseSheet(parseConsultation(raw), ctx, { mode: "neuraxial" });
    const w = (x: Result, code: string) => x.sheet.workup.find((y) => y.code === code);
    // The spinal: platelets — already in the consultation's biology.
    expect(w(r, "fbc")).toMatchObject({ status: "ok", value: "Hb 13,2, plaq. 245" });
    // Under a direct oral anticoagulant: haemostasis to plan, the creatinine there.
    expect(w(r, "haemostasis")).toMatchObject({ status: "todo", strength: "recommended" });
    expect(w(r, "renal")?.status).toBe("ok");
    // A biology pasted afterwards fills it; « groupe à faire » is asked for, not done; a result is not a note.
    const more = buildCaseSheet(parseConsultation(`${raw}\n---\nTP 95 %, TCA 1,1\nECG : rythme sinusal\nGroupe sanguin à faire`), ctx, { mode: "neuraxial" });
    expect(w(more, "haemostasis")?.status).toBe("ok");
    expect(texts(more, "note").join(" ")).not.toMatch(/ECG|TCA/);
    // Ticked on the sheet: done, or not needed (off the sheet).
    const ticked = buildCaseSheet(parseConsultation(raw), ctx, { mode: "neuraxial", workup: { haemostasis: "done", fbc: "skip" } });
    expect(w(ticked, "haemostasis")?.status).toBe("ok");
    expect(w(ticked, "fbc")).toBeUndefined();
  });

  it("asks the creatinine for an NSAID of the plan — recommended when the kidney is at risk", () => {
    const r = buildCaseSheet(parseConsultation(HOSPITAL), ctx, { mode: "general" });
    expect(r.sheet.rows.some((x) => x.parts.some((t) => /Kétorolac|Ibuprofène|Diclofénac|Kétoprofène/.test(t.text)))).toBe(true);
    const renal = (x: Result) => x.sheet.workup.find((w) => w.code === "renal");
    expect(renal(r)).toMatchObject({ strength: "consider", reason: expect.stringMatching(/au plan : créatinine/) });
    const atRisk = buildCaseSheet(parseConsultation(`${HOSPITAL}\n---\nTraitement :\nCoversyl 5 mg`), ctx, { mode: "general" });
    expect(renal(atRisk)).toMatchObject({ strength: "recommended" });
    expect(renal(atRisk)?.reason).toMatch(/IEC/);
  });

  it("keeps results, tests and a form's title out of the treatments and the notes", () => {
    const raw = `Initiales : XY
Intervention : Prothèse totale de genou
Age 66 ans Poids 112 kg Taille 170 cm
Traitement :
Belsar plus 40/25 1x
Zanidip 20 1x
Potassium (Sérum) : 4.9 mmol/l
Vitamine B12 : 224 ng/l
échocardiographie de stress à la dobutamine
Commentaires
PROTHESE TOTALE (AU ROBOT)
[hb < 13 g/dl ferritine <100 microg/l]
Examens complémentaires : Débit filt. glom. (EKFC) : 45 ml/min/1.73m²
Péricarde virtuel
ECG : Tachycardie sinusale à 104 bpm. Axe normal.`;
    const r = buildCaseSheet(parseConsultation(raw), ctx);
    expect(texts(r, "ttt")).toEqual(["Belsar plus 40/25 1x", "Zanidip 20 1x"]);
    // One conduct for a combination whose substances are stopped alike.
    expect(sec(r, "ttt")[0].detail).not.toMatch(/Olmésartan :/);
    expect(texts(r, "note")).toEqual(["échocardiographie de stress à la dobutamine"]);
    expect(r.sheet.workup.find((w) => w.code === "ecg")?.value).toBe("ECG : Tachycardie sinusale à 104 bpm");
  });
});

