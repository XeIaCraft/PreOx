import { describe, expect, it } from "vitest";
import {
  applyMutation,
  applyMutations,
  caseNumbers,
  defaultTutorId,
  defaultParticipation,
  operationSuggestions,
  pendingSignatureGroups,
  pendingSignatureCount,
  stageForDate,
  activityReport,
  defaultCoordinatorId,
  defaultStageSupervisorId,
  shiftDateIso,
  formatDateFr,
} from "./logic";
import { caseCode } from "./referentiel";
import { emptyCarnetData, type CarnetCase, type CarnetDuty, type CarnetStage, type CarnetMutation } from "./types";

function stage(id: string, start: string, end: string | null, year = 1): CarnetStage {
  return { id, hospital: `H-${id}`, city: "", sector: "", coordinator_id: null, supervisor_id: null, training_year: year, start_date: start, end_date: end, created_at: `${start}T00:00:00Z` };
}

let seq = 0;
function kase(partial: Partial<CarnetCase> = {}): CarnetCase {
  seq++;
  return {
    id: `c${seq}`,
    stage_id: "s1",
    case_date: "2026-03-10",
    patient_initials: "AB",
    operation: "Cholécystectomie",
    operation_category: "A",
    pediatric_under_4: false,
    general_anesthesia: true,
    regional_types: [],
    technical_acts: [],
    other_labels: {},
    details: {},
    planned: false,
    participation: 2,
    tutor_id: null,
    signature_id: null,
    notes: "",
    created_at: `2026-03-10T08:${String(seq).padStart(2, "0")}:00Z`,
    ...partial,
  };
}

function duty(partial: Partial<CarnetDuty> = {}): CarnetDuty {
  seq++;
  return {
    id: `d${seq}`,
    stage_id: "s1",
    duty_date: "2026-03-10",
    duty_type: "on_site",
    institution: "",
    city: "",
    head_of_department: "",
    supervisor_id: null,
    signature_id: null,
    notes: "",
    created_at: `2026-03-10T20:${String(seq).padStart(2, "0")}:00Z`,
    ...partial,
  };
}

const meta = { id: "m", createdAt: "2026-01-01T00:00:00Z" };

describe("applyMutation", () => {
  it("inserts, replaces, patches and deletes rows", () => {
    const c = kase({ id: "x" });
    let data = applyMutation(emptyCarnetData(), { ...meta, collection: "cases", op: "put", row: { ...c } as Record<string, unknown> & { id: string } });
    expect(data.cases).toHaveLength(1);
    data = applyMutation(data, { ...meta, collection: "cases", op: "patch", rowId: "x", patch: { operation: "Hernie" } });
    expect(data.cases[0].operation).toBe("Hernie");
    data = applyMutation(data, { ...meta, collection: "cases", op: "put", row: { ...c, operation: "Autre" } as Record<string, unknown> & { id: string } });
    expect(data.cases).toHaveLength(1);
    expect(data.cases[0].operation).toBe("Autre");
    data = applyMutation(data, { ...meta, collection: "cases", op: "delete", rowId: "x" });
    expect(data.cases).toEqual([]);
  });

  it("deleting a signature puts its cases and duties back to pending, like the database's ON DELETE SET NULL", () => {
    const data = { ...emptyCarnetData(), cases: [kase({ id: "a", signature_id: "sig" })], duties: [duty({ id: "b", signature_id: "sig" })] };
    const next = applyMutation(data, { ...meta, collection: "signatures", op: "delete", rowId: "sig" });
    expect(next.cases[0].signature_id).toBeNull();
    expect(next.duties[0].signature_id).toBeNull();
  });

  it("keeps a single row per training year", () => {
    const m1: CarnetMutation = { ...meta, collection: "years", op: "put", row: { id: "y1", training_year: 1, absences: { A: 2 }, activity_counts: {} } };
    const m2: CarnetMutation = { ...meta, collection: "years", op: "put", row: { id: "y2", training_year: 1, absences: { A: 3 }, activity_counts: {} } };
    const data = applyMutations(emptyCarnetData(), [m1, m2]);
    expect(data.years).toEqual([{ id: "y2", training_year: 1, absences: { A: 3 }, activity_counts: {} }]);
  });
});

describe("stages", () => {
  const stages = [stage("old", "2025-01-01", "2025-06-30"), stage("cur", "2026-01-01", null, 2)];
  it("finds the stage covering a date, else the latest started before it", () => {
    expect(stageForDate(stages, "2025-03-01")?.id).toBe("old");
    expect(stageForDate(stages, "2026-05-01")?.id).toBe("cur");
    expect(stageForDate(stages, "2025-09-01")?.id).toBe("old");
    expect(stageForDate([], "2025-09-01")).toBeNull();
  });
});

describe("case numbering", () => {
  it("numbers cases consecutively per training year, in chronological order", () => {
    const stages = [stage("s1", "2025-01-01", null, 1), stage("s2", "2026-01-01", null, 2)];
    const a = kase({ id: "a", case_date: "2025-02-02", stage_id: "s1" });
    const b = kase({ id: "b", case_date: "2025-02-01", stage_id: "s1" });
    const c = kase({ id: "c", case_date: "2026-02-01", stage_id: "s2" });
    const numbers = caseNumbers([a, b, c], stages);
    expect([numbers.get("b"), numbers.get("a"), numbers.get("c")]).toEqual([1, 2, 1]);
  });
});

describe("pre-fill", () => {
  it("leaves the tutor empty for the first case of the day, then repeats the last one", () => {
    const cases = [kase({ case_date: "2026-03-09", tutor_id: "yesterday" })];
    expect(defaultTutorId(cases, "s1", "2026-03-10")).toBeNull();
    cases.push(kase({ tutor_id: "t1" }), kase({ tutor_id: "t2" }));
    expect(defaultTutorId(cases, "s1", "2026-03-10")).toBe("t2");
    expect(defaultTutorId(cases, "other-stage", "2026-03-10")).toBeNull();
  });

  it("reuses the last degree of participation on the stage", () => {
    expect(defaultParticipation([], "s1")).toBe(2);
    expect(defaultParticipation([kase({ participation: 3 })], "s1")).toBe(3);
  });

  it("suggests past operations by frequency, accent-insensitively, with their last category", () => {
    const cases = [
      kase({ operation: "Césarienne", operation_category: "B", general_anesthesia: false, regional_types: ["rachianesthesie"] }),
      kase({ operation: "cesarienne ", operation_category: "B", general_anesthesia: false, regional_types: ["peridurale"] }),
      kase({ operation: "Cholécystectomie" }),
    ];
    const s = operationSuggestions(cases, "ces");
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ count: 2, last: { operation_category: "B", regional_types: ["peridurale"] } });
    expect(operationSuggestions(cases, "")[0].count).toBe(2);
  });
});

describe("pending signatures", () => {
  it("groups unsigned cases and duties by supervisor then day, unassigned last", () => {
    const data = {
      cases: [
        kase({ tutor_id: "t1", case_date: "2026-03-11" }),
        kase({ tutor_id: "t1", case_date: "2026-03-10" }),
        kase({ tutor_id: "t2" }),
        kase({ tutor_id: null }),
        kase({ tutor_id: "t1", signature_id: "done" }),
      ],
      duties: [duty({ supervisor_id: "t1", duty_date: "2026-03-10" })],
    };
    const groups = pendingSignatureGroups(data);
    expect(groups.map((g) => [g.supervisorId, g.total])).toEqual([
      ["t1", 3],
      ["t2", 1],
      [null, 1],
    ]);
    expect(groups[0].days.map((d) => [d.date, d.cases.length, d.duties.length])).toEqual([
      ["2026-03-10", 1, 1],
      ["2026-03-11", 1, 0],
    ]);
    expect(pendingSignatureCount(data)).toBe(5);
  });
});

describe("case code (column 6)", () => {
  it("reproduces the carnet's own example and combinations", () => {
    const c = { pediatric_under_4: false, general_anesthesia: false, regional_types: [] as string[], technical_acts: [] as string[] };
    expect(caseCode({ ...c, operation_category: "B", regional_types: ["peridurale"], participation: 2 })).toBe("BP2");
    expect(caseCode({ ...c, operation_category: "K", general_anesthesia: true, regional_types: ["membre_inferieur", "plexus_brachial"], technical_acts: ["echo_alr"], participation: 3 })).toBe("KNO3");
    expect(caseCode({ ...c, operation_category: "A", pediatric_under_4: true, general_anesthesia: true, participation: 1 })).toBe("AHN1");
    expect(caseCode({ ...c, operation_category: "X", technical_acts: ["voie_centrale", "echo_vasculaire"], participation: 3 })).toBe("XT3");
    expect(caseCode({ ...c, operation_category: "B", regional_types: ["rachianesthesie", "peridurale"], participation: 2 })).toBe("BP2");
  });
});

describe("activity report", () => {
  it("counts cases per category, techniques and duties per training year", () => {
    const stages = [stage("s1", "2025-01-01", null, 1), stage("s2", "2026-01-01", null, 2)];
    const cases = [
      kase({ stage_id: "s1", operation_category: "B", general_anesthesia: false, regional_types: ["peridurale"] }),
      kase({ stage_id: "s2", operation_category: "K", general_anesthesia: true, regional_types: ["membre_inferieur", "plexus_brachial"], technical_acts: ["echo_alr"], pediatric_under_4: true }),
      kase({ stage_id: "s2", operation_category: "X", general_anesthesia: false, technical_acts: ["voie_centrale", "echo_vasculaire", "fibroscopie"] }),
    ];
    const report = activityReport({ cases, duties: [duty({ stage_id: "s2", duty_type: "on_call" })], stages, years: [{ id: "y", training_year: 2, absences: {}, activity_counts: { smur: 4 } }] });
    const find = (key: string) => report.flatMap((s) => s.rows).find((r) => r.key === key)!;
    expect(find("cat_B").byYear).toEqual([1, 0, 0, 0, 0]);
    expect(find("total1").total).toBe(3);
    expect(find("H").byYear).toEqual([0, 1, 0, 0, 0]);
    expect(find("alr_total").total).toBe(3);
    expect(find("act_voie_centrale").total).toBe(1);
    // Echo vasculaire + fibroscopie: technical acts other than the central line and the block's ultrasound.
    expect(find("act_autres").total).toBe(2);
    expect(find("total2").total).toBe(1 + 3 + 1 + 2);
    expect(find("echo_alr").total).toBe(1);
    expect(find("fibroscopie").total).toBe(1);
    expect(find("counter_smur").byYear).toEqual([0, 4, 0, 0, 0]);
    expect(find("duty_on_call").total).toBe(1);
  });
});

describe("stage pre-fill", () => {
  it("keeps the coordinator and finds the department's own maître de stage", () => {
    const a = { ...stage("a", "2025-01-01", "2025-06-30"), hospital: "CHU Saint-Pierre", sector: "Anesthésie", coordinator_id: "coord", supervisor_id: "msA" };
    const b = { ...stage("b", "2025-07-01", null), hospital: "Erasme", sector: "Soins intensifs", coordinator_id: "coord", supervisor_id: "msB" };
    expect(defaultCoordinatorId([a, b])).toBe("coord");
    expect(defaultCoordinatorId([])).toBeNull();
    expect(defaultStageSupervisorId([a, b], "chu saint-pierre", "anesthésie")).toBe("msA");
    expect(defaultStageSupervisorId([a, b], "CHU Saint-Pierre", "Soins intensifs")).toBeNull();
    expect(defaultStageSupervisorId([a, b], "Erasme", "")).toBe("msB");
  });
});

describe("offline changes written before the v2 schema", () => {
  it("upgrades single regional type / act and merges a stage's activity into its sector", () => {
    const legacyCase = { ...kase({ id: "old" }), regional_type: "rachianesthesie", technical_act: null } as Record<string, unknown>;
    delete legacyCase.regional_types;
    delete legacyCase.technical_acts;
    delete legacyCase.other_labels;
    delete legacyCase.details;
    let data = applyMutation(emptyCarnetData(), { ...meta, collection: "cases", op: "put", row: legacyCase as { id: string } });
    expect(data.cases[0]).toMatchObject({ regional_types: ["rachianesthesie"], technical_acts: [], other_labels: {}, details: {} });
    expect("regional_type" in data.cases[0]).toBe(false);
    data = applyMutation(data, { ...meta, collection: "cases", op: "patch", rowId: "old", patch: { technical_act: "voie_centrale" } });
    expect(data.cases[0].technical_acts).toEqual(["voie_centrale"]);
    const legacyStage = { ...stage("st", "2025-01-01", null), sector: "Bloc", activity: "Anesthésie" } as Record<string, unknown>;
    delete legacyStage.supervisor_id;
    data = applyMutation(data, { ...meta, collection: "stages", op: "put", row: legacyStage as { id: string } });
    expect(data.stages[0]).toMatchObject({ sector: "Bloc – Anesthésie", supervisor_id: null });
  });
});

describe("dates", () => {
  it("shifts local dates across month ends and formats them the Belgian way", () => {
    expect(shiftDateIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(formatDateFr("2026-03-01")).toBe("01/03/2026");
  });
});
