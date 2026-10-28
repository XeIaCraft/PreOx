import { describe, expect, it } from "vitest";
import { parseConsultation, parsePastedConsultations, splitConsultations } from "./parse";
import { parseQuickEntry } from "../quick-entry";
import { DEFAULT_CATALOGS } from "../catalog-defaults";

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

describe("pasted consultations", () => {
  it("reads the hospital's note: patient, intervention, fields sharing a line", () => {
    const c = parseConsultation(HOSPITAL);
    expect(c).toMatchObject({
      initials: "NP",
      sex: "F",
      age: 38,
      weightKg: 100,
      heightCm: 176,
      surgery: "Salpingectomie coelio + retrait DIU",
      plannedDate: "03/05/2026",
      admission: "HDJ",
      anaesthesia: "AG",
      mode: "general",
      mallampati: 2,
      hemstop: 0,
      jehovah: false,
      noKnownAllergy: true,
      noTreatment: true,
      history: ["Psoriasis"],
      surgical: ["DDS", "Curetage"],
      anaesthetic: [],
      habits: ["Fumeur 10 cig/j"],
    });
    expect(c.airway).toEqual(["Ouverture buccale > 35 mm", "Mobilité cervicale bonne (>90°)"]);
  });

  it("leaves the print furniture and the HEMSTOP questions out of the antecedents", () => {
    const q = parseQuickEntry(parseConsultation(HOSPITAL).normalized, DEFAULT_CATALOGS);
    expect(q.conditions.map((x) => x.id)).toEqual(["psoriasis_skin"]);
    expect(q.treatments).toEqual([]);
    expect(q.substances.tobacco).toBe("current");
    expect(q.unknown).toEqual([]);
  });

  it("reads another layout: « Champ : valeur », heights in metres, a compound surname", () => {
    const c = parseConsultation(CLINIC);
    expect(c.name).toBe("DUPONT DE LA TOUR Jean-Pierre");
    expect(c).toMatchObject({ initials: "DDLJ", sex: "M", heightCm: 176, weightKg: 85, mode: "neuraxial", surgeon: "Dr Martin", plannedDate: "28/10/2026", mallampati: 3 });
    expect(c.age).toBe(69);
    expect(c.surgery).toMatch(/^Résection endoscopique de prostate/);
    const q = parseQuickEntry(c.normalized, DEFAULT_CATALOGS);
    expect(q.conditions.map((x) => x.id)).toEqual(expect.arrayContaining(["hypertension", "glaucoma", "diabetes_oral", "osa"]));
    expect(q.treatments.map((t) => t.name)).toEqual(["Bisoprolol + hydrochlorothiazide", "Metformine", "Tadalafil"]);
    expect(q.allergies.map((a) => a.allergenId)).toEqual(["betalactams"]);
  });

  it("splits several consultations pasted together, or at « --- » lines", () => {
    expect(parsePastedConsultations(`${HOSPITAL}\n${CLINIC}`).map((c) => c.initials)).toEqual(["NP", "DDLJ"]);
    expect(splitConsultations("Patient A, 40 ans\n---\nPatient B, 50 ans")).toEqual(["Patient A, 40 ans", "Patient B, 50 ans"]);
  });

  it("keeps an antecedent that only mentions a field's word", () => {
    const c = parseConsultation("Antécédents :\nPerte de poids de 10 kg en 3 mois\nHospitalisation pour pneumopathie en 2020");
    expect(c.history).toEqual(["Perte de poids de 10 kg en 3 mois", "Hospitalisation pour pneumopathie en 2020"]);
    expect(c.weightKg).toBeUndefined();
  });

  it("takes the name typed for a patient without a consultation, and its initials", () => {
    expect(parseConsultation("Nom : dupont jean\nIntervention : Hernie inguinale")).toMatchObject({ name: "DUPONT Jean", initials: "DJ", surgery: "Hernie inguinale" });
    expect(parseConsultation("Nom du chirurgien : Dr Martin").name).toBeUndefined();
  });
});

