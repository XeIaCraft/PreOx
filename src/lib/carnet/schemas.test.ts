import { describe, expect, it } from "vitest";
import { ROW_SCHEMAS, PATCH_SCHEMAS, profileSchema } from "./schemas";
import { upgradeRow } from "./compat";

const ID = "3f1c2a4e-9b7d-4c1e-8a2f-5d6e7f8a9b0c";
const STAGE = "7a2b3c4d-5e6f-4a1b-9c8d-0e1f2a3b4c5d";

/** A case exactly as the entry form saves it (case-form.tsx). */
function formCase(extra: Record<string, unknown> = {}) {
  return {
    id: ID,
    stage_id: STAGE,
    case_date: "2026-10-07",
    patient_initials: "JD",
    operation: "Prothèse totale de genou",
    operation_category: "K",
    pediatric_under_4: false,
    general_anesthesia: true,
    regional_types: [],
    technical_acts: [],
    other_labels: {},
    details: {},
    participation: 2,
    tutor_id: null,
    signature_id: null,
    notes: "",
    created_at: "2026-10-07T08:00:00.000Z",
    ...extra,
  };
}

describe("server validation of what the screens send", () => {
  it("accepts a plain case — no 'Autre' precision, no details", () => {
    const parsed = ROW_SCHEMAS.cases.safeParse(formCase());
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("accepts several techniques, one 'Autre' precision and drugs/procedures", () => {
    const parsed = ROW_SCHEMAS.cases.safeParse(
      formCase({
        regional_types: ["rachianesthesie", "autre_alr"],
        technical_acts: ["echo_alr", "voie_centrale"],
        other_labels: { autre_alr: "iPACK" },
        details: { drugs: [{ name: "Propofol", route: "bolus_iv", dose: "" }], procedures: ["iot"] },
      })
    );
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("refuses a case without any technique and an unknown 'Autre' key", () => {
    expect(ROW_SCHEMAS.cases.safeParse(formCase({ general_anesthesia: false })).success).toBe(false);
    expect(ROW_SCHEMAS.cases.safeParse(formCase({ other_labels: { nope: "x" } })).success).toBe(false);
  });

  it("accepts a case queued offline before the v2 schema, once upgraded", () => {
    const legacy: Record<string, unknown> = { ...formCase(), regional_type: "peridurale", technical_act: null };
    for (const key of ["regional_types", "technical_acts", "other_labels", "details"]) delete legacy[key];
    expect(ROW_SCHEMAS.cases.safeParse(upgradeRow("cases", legacy)).success).toBe(true);
  });

  it("accepts a patch of a single field and a profile without signature", () => {
    expect(PATCH_SCHEMAS.cases.safeParse({ signature_id: null }).success).toBe(true);
    const profile = {
      last_name: "L",
      first_name: "A",
      nationality: "",
      birth_place: "",
      birth_date: null,
      addresses: [],
      email: "",
      phone: "",
      university: "",
      graduation_year: null,
      pre_training_activities: "",
      signature: "",
    };
    expect(profileSchema.safeParse(profile).success).toBe(true);
  });

  it("accepts a stage with its own maître de stage", () => {
    const stage = { id: ID, hospital: "CHU Tivoli", city: "", sector: "Anesthésie - Réanimation", coordinator_id: null, supervisor_id: STAGE, training_year: 1, start_date: "2026-09-01", end_date: null, created_at: "2026-09-01T00:00:00Z" };
    expect(ROW_SCHEMAS.stages.safeParse(stage).success).toBe(true);
  });
});
