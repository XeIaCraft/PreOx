// Pure logic of the "Carnet de stage" module — no IndexedDB, no network,
// no clock unless passed in — so every rule the screens rely on is unit
// tested (logic.test.ts): applying queued local changes, case numbering,
// the tutor pre-fill rule, grouping of what still needs a signature, and
// the official activity report.
import { OPERATION_CATEGORIES, REGIONAL_TYPES, ACTIVITY_COUNTERS } from "./referentiel";
import { upgradePatch, upgradeProfile, upgradeRow } from "./compat";
import type { CarnetCase, CarnetCollection, CarnetData, CarnetDuty, CarnetMutation, CarnetStage } from "./types";

// ---------------------------------------------------------------------------
// Dates (always local calendar dates, "YYYY-MM-DD")
// ---------------------------------------------------------------------------

export function localDateIso(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function shiftDateIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return localDateIso(new Date(y, m - 1, d + days));
}

export function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// ---------------------------------------------------------------------------
// Local changes
// ---------------------------------------------------------------------------

/** Rows other rows point to with "on delete set null" — mirrored locally so a deletion looks the same before and after the server has it. */
const SET_NULL_REFERENCES: Partial<Record<CarnetCollection, { collection: CarnetCollection; field: string }[]>> = {
  supervisors: [
    { collection: "stages", field: "coordinator_id" },
    { collection: "stages", field: "supervisor_id" },
    { collection: "cases", field: "tutor_id" },
    { collection: "duties", field: "supervisor_id" },
    { collection: "signatures", field: "supervisor_id" },
  ],
  signatures: [
    { collection: "cases", field: "signature_id" },
    { collection: "duties", field: "signature_id" },
  ],
};

function withRows<C extends CarnetCollection>(data: CarnetData, collection: C, rows: CarnetData[C]): CarnetData {
  return { ...data, [collection]: rows };
}

/** Applies one queued change to the local copy — the same effect the server will have once it receives it. */
export function applyMutation(data: CarnetData, m: CarnetMutation): CarnetData {
  if (m.collection === "profile") {
    return m.op === "put" ? { ...data, profile: upgradeProfile(m.row) } : data;
  }
  const collection = m.collection;
  const rows = data[collection] as { id: string }[];

  if (m.op === "put") {
    const row = upgradeRow(collection, m.row) as { id: string };
    let next = rows;
    // carnet_years is unique per training year: a second row for the same year replaces the first, as the server's upsert does.
    if (collection === "years") {
      const year = (row as { training_year?: number }).training_year;
      next = next.filter((r) => (r as unknown as { training_year: number }).training_year !== year || r.id === row.id);
    }
    const exists = next.some((r) => r.id === row.id);
    next = exists ? next.map((r) => (r.id === row.id ? row : r)) : [...next, row];
    return withRows(data, collection, next as never);
  }

  if (m.op === "patch") {
    const patch = upgradePatch(collection, m.patch);
    return withRows(data, collection, rows.map((r) => (r.id === m.rowId ? { ...r, ...patch } : r)) as never);
  }

  // delete
  let next = withRows(data, collection, rows.filter((r) => r.id !== m.rowId) as never);
  for (const ref of SET_NULL_REFERENCES[collection] ?? []) {
    const refRows = next[ref.collection] as unknown as Record<string, unknown>[];
    next = withRows(next, ref.collection, refRows.map((r) => (r[ref.field] === m.rowId ? { ...r, [ref.field]: null } : r)) as never);
  }
  if (collection === "stages") {
    next = { ...next, stage_reviews: next.stage_reviews.filter((r) => r.stage_id !== m.rowId) };
  }
  return next;
}

export function applyMutations(data: CarnetData, mutations: CarnetMutation[]): CarnetData {
  return mutations.reduce(applyMutation, data);
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

/** Most recent first. */
export function sortStages(stages: CarnetStage[]): CarnetStage[] {
  return [...stages].sort((a, b) => b.start_date.localeCompare(a.start_date) || b.created_at.localeCompare(a.created_at));
}

/** The stage covering `date` (the most recently started one if several overlap), else the most recent stage started before it, else the most recent overall. */
export function stageForDate(stages: CarnetStage[], date: string): CarnetStage | null {
  const sorted = sortStages(stages);
  return (
    sorted.find((s) => s.start_date <= date && (!s.end_date || s.end_date >= date)) ??
    sorted.find((s) => s.start_date <= date) ??
    sorted[0] ??
    null
  );
}

export function stageLabel(stage: Pick<CarnetStage, "hospital" | "sector" | "training_year">): string {
  return `${stage.hospital}${stage.sector ? ` – ${stage.sector}` : ""} (année ${stage.training_year})`;
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

function byDateThenCreation<T extends { created_at: string }>(dateOf: (row: T) => string) {
  return (a: T, b: T) => dateOf(a).localeCompare(dateOf(b)) || a.created_at.localeCompare(b.created_at);
}

/**
 * The carnet's "N°" column: consecutive per training year (one carnet is
 * sent per year of training), in chronological order. Computed rather than
 * stored, so deleting or back-dating a case never leaves a gap or a
 * duplicate.
 */
export function caseNumbers(cases: CarnetCase[], stages: CarnetStage[]): Map<string, number> {
  const yearOfStage = new Map(stages.map((s) => [s.id, s.training_year]));
  const counters = new Map<number, number>();
  const numbers = new Map<string, number>();
  for (const c of [...cases].sort(byDateThenCreation((x: CarnetCase) => x.case_date))) {
    const year = yearOfStage.get(c.stage_id) ?? 0;
    const n = (counters.get(year) ?? 0) + 1;
    counters.set(year, n);
    numbers.set(c.id, n);
  }
  return numbers;
}

/**
 * Tutor pre-fill rule: empty for the first case of the day (the candidate
 * must choose), then the tutor of the most recently entered case of that
 * same day and stage — usually the same all day, one tap to change.
 */
export function defaultTutorId(cases: CarnetCase[], stageId: string, date: string): string | null {
  const sameDay = cases.filter((c) => c.stage_id === stageId && c.case_date === date).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return sameDay[0]?.tutor_id ?? null;
}

/** Same idea for the degree of participation: the last one used on this stage (it rarely changes within a stage), else "supervised". */
export function defaultParticipation(cases: CarnetCase[], stageId: string): 1 | 2 | 3 {
  const last = cases.filter((c) => c.stage_id === stageId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return last?.participation ?? 2;
}

export interface OperationSuggestion {
  operation: string;
  count: number;
  /** Category, technique and pediatric flag of the most recent case with this operation — re-applied when the suggestion is picked. */
  last: Pick<CarnetCase, "operation_category" | "general_anesthesia" | "regional_types" | "technical_acts" | "other_labels" | "details">;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Operations already logged, most frequent first, filtered by what's typed (accent- and case-insensitive, matching any word start). */
export function operationSuggestions(cases: CarnetCase[], query: string, limit = 6): OperationSuggestion[] {
  const byKey = new Map<string, OperationSuggestion & { lastAt: string }>();
  for (const c of cases) {
    const key = normalize(c.operation);
    if (!key) continue;
    const entry = byKey.get(key);
    if (!entry) {
      byKey.set(key, { operation: c.operation.trim(), count: 1, last: c, lastAt: c.created_at });
    } else {
      entry.count++;
      if (c.created_at > entry.lastAt) {
        entry.last = c;
        entry.lastAt = c.created_at;
        entry.operation = c.operation.trim();
      }
    }
  }
  const q = normalize(query);
  return [...byKey.entries()]
    .filter(([key]) => !q || key.startsWith(q) || key.includes(` ${q}`) || (q.length >= 3 && key.includes(q)))
    .filter(([key]) => key !== q)
    .sort((a, b) => b[1].count - a[1].count || b[1].lastAt.localeCompare(a[1].lastAt))
    .slice(0, limit)
    .map(([, v]) => ({
      operation: v.operation,
      count: v.count,
      last: {
        operation_category: v.last.operation_category,
        general_anesthesia: v.last.general_anesthesia,
        regional_types: v.last.regional_types,
        technical_acts: v.last.technical_acts,
        other_labels: v.last.other_labels,
        details: v.last.details,
      },
    }));
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

export interface PendingDay {
  date: string;
  cases: CarnetCase[];
  duties: CarnetDuty[];
}

export interface PendingGroup {
  /** null = no supervisor chosen yet — such items can't be signed until one is set. */
  supervisorId: string | null;
  days: PendingDay[];
  total: number;
}

/**
 * Everything not yet signed, grouped by supervisor (a case's tutor, a
 * duty's supervisor), then by day (oldest first) — the unit a supervisor
 * reviews and signs in one go. The group without a supervisor comes last.
 */
export function pendingSignatureGroups(data: Pick<CarnetData, "cases" | "duties">): PendingGroup[] {
  const groups = new Map<string, Map<string, PendingDay>>();
  function dayOf(supervisorId: string | null, date: string): PendingDay {
    const key = supervisorId ?? "";
    let days = groups.get(key);
    if (!days) groups.set(key, (days = new Map()));
    let day = days.get(date);
    if (!day) days.set(date, (day = { date, cases: [], duties: [] }));
    return day;
  }
  for (const c of data.cases) if (!c.signature_id) dayOf(c.tutor_id, c.case_date).cases.push(c);
  for (const d of data.duties) if (!d.signature_id) dayOf(d.supervisor_id, d.duty_date).duties.push(d);

  const result: PendingGroup[] = [...groups.entries()].map(([key, days]) => {
    const sortedDays = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
    for (const day of sortedDays) {
      day.cases.sort((a, b) => a.created_at.localeCompare(b.created_at));
      day.duties.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    return { supervisorId: key || null, days: sortedDays, total: sortedDays.reduce((n, d) => n + d.cases.length + d.duties.length, 0) };
  });
  return result.sort((a, b) => (a.supervisorId === null ? 1 : b.supervisorId === null ? -1 : a.days[0].date.localeCompare(b.days[0].date)));
}

export function pendingSignatureCount(data: Pick<CarnetData, "cases" | "duties">): number {
  return data.cases.filter((c) => !c.signature_id).length + data.duties.filter((d) => !d.signature_id).length;
}

// ---------------------------------------------------------------------------
// Rapport d'activité (official summary table, per training year)
// ---------------------------------------------------------------------------

export interface ReportRow {
  /** Stable key, used to place the row on the official form (pdf.ts). */
  key: string;
  label: string;
  /** Count per training year 1..5 (index 0 = year 1); years above 5 fold into the 5th column like the paper form's last column. */
  byYear: number[];
  total: number;
  /** Visual emphasis for subtotal lines. */
  emphasis?: boolean;
}

export interface ReportSection {
  title: string;
  rows: ReportRow[];
}

export const REPORT_YEARS = 5;

function row(key: string, label: string, counts: number[], emphasis = false): ReportRow {
  return { key, label, byYear: counts, total: counts.reduce((a, b) => a + b, 0), emphasis };
}

function countBy<T>(items: T[], yearOf: (item: T) => number, weight: (item: T) => number): number[] {
  const counts = Array.from({ length: REPORT_YEARS }, () => 0);
  for (const item of items) {
    const w = weight(item);
    if (!w) continue;
    const y = Math.min(Math.max(yearOf(item), 1), REPORT_YEARS);
    counts[y - 1] += w;
  }
  return counts;
}

const sum = (...lists: number[][]) => lists[0].map((_, i) => lists.reduce((n, l) => n + l[i], 0));

/** Acts of section II "* Autres" (T): any technical act but the central line and ultrasound for a block (reported in section III with the rest). */
const OTHER_TECHNIQUE_ACTS = new Set(["echo_vasculaire", "echo_cardiaque", "fibroscopie", "videolaryngoscope", "intubation_difficile_autre", "autre_acte"]);

/**
 * Mirrors the carnet's "Rapport d'activité" row by row: I (patients by
 * surgical category), II (techniques: general, each regional type, central
 * lines, other acts), III (other activity domains — entered per year — plus
 * ultrasound and difficult airway counts from the case log) and duties.
 * A case with several regional techniques counts once in each of their
 * rows, and every technique counts in TOTAL 2 (which must be ≥ TOTAL 1).
 */
export function activityReport(data: Pick<CarnetData, "cases" | "duties" | "stages" | "years">): ReportSection[] {
  const yearOfStage = new Map(data.stages.map((s) => [s.id, s.training_year]));
  const caseYear = (c: CarnetCase) => yearOfStage.get(c.stage_id) ?? 1;
  const dutyYear = (d: CarnetDuty) => yearOfStage.get(d.stage_id) ?? 1;
  const cases = data.cases;
  const count = (weight: (c: CarnetCase) => number | boolean) => countBy(cases, caseYear, (c) => Number(weight(c)));
  const hasAct = (code: string) => (c: CarnetCase) => c.technical_acts.includes(code);

  const categoryRows = OPERATION_CATEGORIES.map((cat) =>
    row(`cat_${cat.code}`, cat.code === "X" ? "Anesthésies pour autres procédures" : `${cat.code} ${cat.label}`, count((c) => c.operation_category === cat.code))
  );
  const total1 = row("total1", 'TOTAL 1 (doit inclure les enfants "H")', count(() => true), true);
  const pediatric = row("H", "H Enfants de moins de 4 ans", count((c) => c.pediatric_under_4));

  const general = row("N", "N Anesthésies générales ou sédations", count((c) => c.general_anesthesia));
  const regionalRows = REGIONAL_TYPES.map((t) => row(`alr_${t.code}`, `O ALR – ${t.label}`, count((c) => c.regional_types.includes(t.code))));
  const regionalTotal = row("alr_total", "Total ALR", sum(...regionalRows.map((r) => r.byYear)), true);
  const centralLines = row("act_voie_centrale", "Voies centrales", count(hasAct("voie_centrale")));
  const otherActs = row("act_autres", "T Autres actes techniques", count((c) => c.technical_acts.filter((a) => OTHER_TECHNIQUE_ACTS.has(a)).length));
  const total2 = row("total2", "TOTAL 2 (doit être ≥ au total 1)", sum(general.byYear, regionalTotal.byYear, centralLines.byYear, otherActs.byYear), true);

  const counterRows = ACTIVITY_COUNTERS.map((counter) => {
    const counts = Array.from({ length: REPORT_YEARS }, () => 0);
    for (const y of data.years) counts[Math.min(Math.max(y.training_year, 1), REPORT_YEARS) - 1] += y.activity_counts[counter.code] ?? 0;
    return row(`counter_${counter.code}`, `${counter.domain} – ${counter.label}`, counts);
  });
  const echoRows = [
    row("echo_alr", "Échographie pour ALR", count(hasAct("echo_alr"))),
    row("echo_vasculaire", "Échographie accès vasculaire", count(hasAct("echo_vasculaire"))),
    row("echo_cardiaque", "Échographie cardiaque", count(hasAct("echo_cardiaque"))),
  ];
  const airwayRows = [
    row("fibroscopie", "Intubations difficiles – fibroscopies", count(hasAct("fibroscopie"))),
    row("videolaryngoscope", "Intubations difficiles – Glidescope / vidéolaryngoscope", count(hasAct("videolaryngoscope"))),
    row("intubation_difficile_autre", "Intubations difficiles – autres", count(hasAct("intubation_difficile_autre"))),
  ];

  const onSite = row("duty_on_site", "Gardes sur place", countBy(data.duties, dutyYear, (d) => Number(d.duty_type === "on_site")));
  const onCall = row("duty_on_call", "Gardes à domicile, rappelables", countBy(data.duties, dutyYear, (d) => Number(d.duty_type === "on_call")));

  return [
    { title: "I. Patients anesthésiés", rows: [...categoryRows, total1, pediatric] },
    { title: "II. Techniques utilisées", rows: [general, ...regionalRows, regionalTotal, centralLines, otherActs, total2] },
    { title: "III. Autres domaines d'activité", rows: [...counterRows, ...echoRows, ...airwayRows] },
    { title: "Gardes", rows: [onSite, onCall, row("duty_total", "TOTAL", sum(onSite.byYear, onCall.byYear), true)] },
  ];
}

// ---------------------------------------------------------------------------
// Stage pre-fill
// ---------------------------------------------------------------------------

/** The coordinator stays the same for the whole training unless it changes: the most recent stage's one. */
export function defaultCoordinatorId(stages: CarnetStage[]): string | null {
  return sortStages(stages).find((s) => s.coordinator_id)?.coordinator_id ?? null;
}

/** A stage's own maître de stage depends on the hospital and the department: the one of the latest stage there (same sector first). */
export function defaultStageSupervisorId(stages: CarnetStage[], hospital: string, sector: string): string | null {
  const h = normalize(hospital);
  if (!h) return null;
  const sameHospital = sortStages(stages).filter((s) => s.supervisor_id && normalize(s.hospital) === h);
  const sec = normalize(sector);
  return (sameHospital.find((s) => normalize(s.sector) === sec) ?? (sec ? undefined : sameHospital[0]))?.supervisor_id ?? null;
}

/** Every drug recorded in past cases, oldest first — feeds the drug suggestions (most used first, with the route used last). */
export function drugHistory(cases: CarnetCase[]): { name: string; route: string }[] {
  return [...cases]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .flatMap((c) => c.details?.drugs ?? [])
    .map((d) => ({ name: d.name, route: d.route }));
}
