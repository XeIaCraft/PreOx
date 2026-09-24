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
  shiftDateIso,
  formatDateFr,
} from "./logic";
import { caseCode } from "./referentiel";
import { emptyCarnetData, type CarnetCase, type CarnetDuty, type CarnetStage, type CarnetMutation } from "./types";

function stage(id: string, start: string, end: string | null, year = 1): CarnetStage {
  return { id, hospital: `H-${id}`, city: "", sector: "", activity: "", coordinator_id: null, training_year: year, start_date: start, end_date: end, created_at: `${start}T00:00:00Z` };
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
    regional_type: null,
    technical_act: null,
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
      kase({ operation: "Césarienne", operation_category: "B", general_anesthesia: false, regional_type: "rachianesthesie" }),
      kase({ operation: "cesarienne ", operation_category: "B", general_anesthesia: false, regional_type: "peridurale" }),
      kase({ operation: "Cholécystectomie" }),
    ];
    const s = operationSuggestions(cases, "ces");
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ count: 2, last: { operation_category: "B", regional_type: "peridurale" } });
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
    expect(caseCode({ operation_category: "B", pediatric_under_4: false, general_anesthesia: false, regional_type: "peridurale", technical_act: null, participation: 2 })).toBe("BP2");
    expect(caseCode({ operation_category: "K", pediatric_under_4: false, general_anesthesia: true, regional_type: "membre_inferieur", technical_act: null, participation: 3 })).toBe("KNO3");
    expect(caseCode({ operation_category: "A", pediatric_under_4: true, general_anesthesia: true, regional_type: null, technical_act: null, participation: 1 })).toBe("AHN1");
    expect(caseCode({ operation_category: "X", pediatric_under_4: false, general_anesthesia: false, regional_type: null, technical_act: "voie_centrale", participation: 3 })).toBe("XT3");
  });
});

describe("activity report", () => {
  it("counts cases per category, techniques and duties per training year", () => {
    const stages = [stage("s1", "2025-01-01", null, 1), stage("s2", "2026-01-01", null, 2)];
    const cases = [
      kase({ stage_id: "s1", operation_category: "B", general_anesthesia: false, regional_type: "peridurale" }),
      kase({ stage_id: "s2", operation_category: "K", general_anesthesia: true, regional_type: "membre_inferieur", pediatric_under_4: true }),
    ];
    const report = activityReport({ cases, duties: [duty({ stage_id: "s2", duty_type: "on_call" })], stages, years: [{ id: "y", training_year: 2, absences: {}, activity_counts: { smur: 4 } }] });
    const find = (label: string) => report.flatMap((s) => s.rows).find((r) => r.label.startsWith(label))!;
    expect(find("B ").byYear).toEqual([1, 0, 0, 0, 0]);
    expect(find("TOTAL 1").total).toBe(2);
    expect(find("H ").byYear).toEqual([0, 1, 0, 0, 0]);
    expect(find("Total ALR").total).toBe(2);
    expect(find("TOTAL 2").total).toBe(3);
    expect(find("SMUR –").byYear).toEqual([0, 4, 0, 0, 0]);
    expect(find("Gardes à domicile").total).toBe(1);
  });
});

describe("dates", () => {
  it("shifts local dates across month ends and formats them the Belgian way", () => {
    expect(shiftDateIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(formatDateFr("2026-03-01")).toBe("01/03/2026");
  });
});
