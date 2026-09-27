// Working time and pay of a specialist doctor in training (MACCS / MSF,
// Belgium) — an ESTIMATE from the days you log, to check your payslip and
// your legal limits, never a payslip.
//
// Status « sui generis » (art. 15bis AR 28/11/1969): assujetti to the
// employees' social security for health-disability, family allowances,
// occupational diseases, work accidents and wage moderation only — no
// pension, no unemployment. Personal contribution 4,70 % (3,55 % health
// care + 1,15 % benefits) instead of 13,07 %; no double holiday pay, no
// 13th month. Income taxed as a salary (withholding tax « précompte
// professionnel »). A yearly INAMI « statut social » allowance is paid into a
// pension contract (not in the salary).
//
// Working time: law of 12/12/2010 (48 h/week on average over 13 weeks,
// 60 h absolute; with « opting out » +12 h: 60 h average, 72 h absolute;
// ≤ 24 h in a row; 12 h rest after a shift of 12–24 h). Pay: collective
// agreements of the Commission paritaire nationale médecins-hôpitaux of
// 19/05/2021 and 21/12/2023 (uncomfortable hours 135 % / 160 %, opting-out
// hours 110 %, callable duty lump sums per 12 h, expense allowance) —
// amounts indexed each 1 January. Every number below is a parameter: when
// the law, the index or your agreement changes, add a new version dated
// from the change (Carnet › Journées › Réglages).

import type { CarnetWorkday, WorkdayKind } from "./types";

// ─── Parameters ────────────────────────────────────────────────────────────

export interface TaxBracket {
  /** Upper bound of the bracket (annual taxable income, €); null for the last one. */
  upTo: number | null;
  rate: number;
}

export interface PayParams {
  /** First day this version applies (YYYY-MM-DD). */
  from: string;
  note: string;
  /** Contract (convention de stage) — prorates the base salary and starts the 13-week reference periods. */
  contractStart: string;
  contractEnd: string;
  /** Monthly gross base salary (full time), €. */
  baseMonthly: number;
  /** Hours the base salary pays per month: hourly base = baseMonthly / this (48 h × 52 / 12 = 208). */
  monthlyReferenceHours: number;
  /** 20 h–8 h on weekdays. */
  nightRate: number;
  saturdayRate: number;
  /** Sundays and public holidays. */
  sundayHolidayRate: number;
  /** « supplement »: the base already pays these hours, only the extra (rate − 100 %) is added; « total »: the whole rate is paid on top. */
  uncomfortableMode: "supplement" | "total";
  nightStart: string;
  nightEnd: string;
  optingOut: boolean;
  optingOutRate: number;
  /** Lump sum per started 12 h of callable duty, weekday 8 h–20 h. */
  onCallDay: number;
  /** Lump sum per started 12 h of callable duty, night or weekend. */
  onCallNightWeekend: number;
  expenseAllowance: number;
  /** Not due for a month with fewer worked days. */
  expenseMinDays: number;
  /** Personal social security contribution (sui generis: 4,70 %). */
  personalContributionRate: number;
  /** Withholding tax: « scale » = estimate from the tax brackets; « rate » = the effective rate read on your payslip. */
  withholdingMode: "scale" | "rate";
  withholdingRate: number;
  taxBrackets: TaxBracket[];
  /** Tax-free allowance (quotité exemptée), annual, €. */
  taxFreeAllowance: number;
  professionalExpensesRate: number;
  professionalExpensesMax: number;
  /** Special social security contribution withheld each month (see your payslip), €. */
  specialContributionMonthly: number;
  /** Hours a day of leave, holiday, sick leave or scientific day counts for in the averages. */
  assimilatedDayHours: number;
  leaveDays: number;
  publicHolidays: number;
  scientificDays: number;
  /** Extra days off treated like public holidays (YYYY-MM-DD), e.g. a regional or hospital holiday. */
  extraHolidays: string[];
  maxMonthlyHours: number;
  referenceWeeks: number;
  weeklyAverage: number;
  weeklyAverageOptingOut: number;
  weeklyAbsolute: number;
  weeklyAbsoluteOptingOut: number;
  maxShiftHours: number;
  restAfterLongShift: number;
  /** INAMI « statut social » for doctors in training, annual, paid into a pension/income-insurance contract. */
  inamiSocialAdvantage: number;
  /** Additional communal tax (% of the income tax), not withheld from the salary. */
  communalTaxRate: number;
}

/**
 * Default values (1 January 2026): amounts of the standard convention after
 * the 2026 index; tax brackets for 2026 income. Check them against your own
 * convention and payslip — every one can be changed.
 */
export const DEFAULT_PAY: PayParams = {
  from: "2026-01-01",
  note: "Valeurs par défaut au 01/01/2026 (convention type, CC 19/05/2021 et 21/12/2023, index 2026) — à vérifier avec votre convention et votre fiche de paie.",
  contractStart: "",
  contractEnd: "",
  baseMonthly: 3813.82,
  monthlyReferenceHours: 208,
  nightRate: 1.35,
  saturdayRate: 1.35,
  sundayHolidayRate: 1.6,
  uncomfortableMode: "supplement",
  nightStart: "20:00",
  nightEnd: "08:00",
  optingOut: false,
  optingOutRate: 1.1,
  onCallDay: 56.23,
  onCallNightWeekend: 84.33,
  expenseAllowance: 165.45,
  expenseMinDays: 10,
  personalContributionRate: 0.047,
  withholdingMode: "scale",
  withholdingRate: 0.28,
  taxBrackets: [
    { upTo: 16720, rate: 0.25 },
    { upTo: 29510, rate: 0.4 },
    { upTo: 51070, rate: 0.45 },
    { upTo: null, rate: 0.5 },
  ],
  taxFreeAllowance: 11180,
  professionalExpensesRate: 0.3,
  professionalExpensesMax: 6070,
  specialContributionMonthly: 0,
  assimilatedDayHours: 9.6,
  leaveDays: 22,
  publicHolidays: 10,
  scientificDays: 10,
  extraHolidays: [],
  maxMonthlyHours: 260,
  referenceWeeks: 13,
  weeklyAverage: 48,
  weeklyAverageOptingOut: 60,
  weeklyAbsolute: 60,
  weeklyAbsoluteOptingOut: 72,
  maxShiftHours: 24,
  restAfterLongShift: 12,
  inamiSocialAdvantage: 8403.62,
  communalTaxRate: 0.07,
};

export const PAY_SOURCES = [
  "Statut sui generis : art. 15bis AR 28/11/1969 — cotisation personnelle 4,70 % (soins de santé 3,55 % + indemnités 1,15 %), pas de pension ni de chômage, pas de pécule de vacances ni de 13e mois.",
  "Temps de travail : loi du 12/12/2010 (48 h en moyenne sur 13 semaines, 60 h maximum ; opting out : 60 h en moyenne, 72 h maximum ; 24 h consécutives au plus ; 12 h de repos après 12–24 h).",
  "Rémunération : conventions collectives de la Commission paritaire nationale médecins-hôpitaux du 19/05/2021 et du 21/12/2023 (heures inconfortables 135 %/160 %, opting out 110 %, forfaits de garde appelable par 12 h, indemnité de frais) ; montants indexés au 1er janvier.",
  "Précompte : estimation par le barème de l'impôt (revenus 2026) ; pour un chiffre exact, reprenez le taux de votre fiche de paie (mode « taux »).",
  "Avantage INAMI (statut social) des médecins en formation : versé sur un contrat de pension ou de revenu garanti, hors salaire.",
];

export interface PaySettings {
  versions: PayParams[];
}

/** The settings as stored, completed with the defaults (older or partial versions stay valid). */
export function paySettingsFrom(value: Record<string, unknown> | undefined): PaySettings {
  const raw = Array.isArray(value?.versions) ? (value!.versions as Partial<PayParams>[]) : [];
  const versions = raw.map((v) => ({ ...DEFAULT_PAY, ...v })).sort((a, b) => a.from.localeCompare(b.from));
  return { versions: versions.length ? versions : [DEFAULT_PAY] };
}

/** The version in force on a date (the oldest one before any version starts). */
export function paramsOn(settings: PaySettings, date: string): PayParams {
  const v = settings.versions;
  return [...v].reverse().find((p) => p.from <= date) ?? v[0];
}

// ─── Calendar ──────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => isoOf(toMs(iso) + n * DAY);
/** 0 = Sunday … 6 = Saturday. */
const weekday = (iso: string) => new Date(toMs(iso)).getUTCDay();
const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

function easter(year: number): string {
  // Anonymous Gregorian algorithm.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The 10 Belgian public holidays of a year. */
export function belgianHolidays(year: number): { date: string; label: string }[] {
  const e = easter(year);
  return [
    { date: `${year}-01-01`, label: "Nouvel An" },
    { date: addDays(e, 1), label: "Lundi de Pâques" },
    { date: `${year}-05-01`, label: "Fête du Travail" },
    { date: addDays(e, 39), label: "Ascension" },
    { date: addDays(e, 50), label: "Lundi de Pentecôte" },
    { date: `${year}-07-21`, label: "Fête nationale" },
    { date: `${year}-08-15`, label: "Assomption" },
    { date: `${year}-11-01`, label: "Toussaint" },
    { date: `${year}-11-11`, label: "Armistice" },
    { date: `${year}-12-25`, label: "Noël" },
  ];
}

const holidayCache = new Map<number, Set<string>>();
function isHoliday(iso: string, extra: string[]): boolean {
  const y = Number(iso.slice(0, 4));
  if (!holidayCache.has(y)) holidayCache.set(y, new Set(belgianHolidays(y).map((h) => h.date)));
  return holidayCache.get(y)!.has(iso) || extra.includes(iso);
}

/** Monday of the ISO week of a date. */
export function weekStart(iso: string): string {
  return addDays(iso, -((weekday(iso) + 6) % 7));
}

// ─── Hours ─────────────────────────────────────────────────────────────────

/** A worked stretch, in minutes from 00:00 UTC of its date (wall-clock time, no DST shift). */
export interface Interval {
  start: number;
  end: number;
}

const WORKED: WorkdayKind[] = ["work", "on_site"];
const ASSIMILATED: WorkdayKind[] = ["leave", "holiday", "sick", "scientific", "course"];

function span(date: string, start: string, end: string, nextDay: boolean): Interval | null {
  if (!start || !end) return null;
  const s = toMs(date) + minutesOf(start) * 60_000;
  let e = toMs(date) + minutesOf(end) * 60_000;
  if (nextDay || e <= s) e += DAY;
  return { start: s, end: e };
}

/** The stretches actually worked on a day (the break taken off the end), and a callable duty's availability window. */
export function workedIntervals(w: CarnetWorkday): { worked: Interval[]; availability: Interval | null } {
  if (WORKED.includes(w.kind)) {
    const i = span(w.work_date, w.start_time, w.end_time, w.end_next_day);
    if (!i) return { worked: [], availability: null };
    const end = Math.max(i.start, i.end - w.break_minutes * 60_000);
    return { worked: end > i.start ? [{ start: i.start, end }] : [], availability: null };
  }
  if (w.kind === "on_call") {
    const availability = span(w.work_date, w.start_time, w.end_time, w.end_next_day);
    // A call-out's « next_day » means it happened the day after the duty started (it may itself cross midnight).
    const worked = (w.callouts ?? []).map((c) => span(c.next_day ? addDays(w.work_date, 1) : w.work_date, c.start, c.end, false)).filter((x): x is Interval => !!x);
    // A call-out after midnight of an evening duty belongs to the next day.
    const fixed = availability ? worked.map((c) => (c.start < availability.start ? { start: c.start + DAY, end: c.end + DAY } : c)) : worked;
    return { worked: fixed, availability };
  }
  return { worked: [], availability: null };
}

export interface HourSplit {
  total: number;
  normal: number;
  night: number;
  saturday: number;
  sundayHoliday: number;
}

const emptySplit = (): HourSplit => ({ total: 0, normal: 0, night: 0, saturday: 0, sundayHoliday: 0 });
const addSplit = (a: HourSplit, b: HourSplit): HourSplit => ({ total: a.total + b.total, normal: a.normal + b.normal, night: a.night + b.night, saturday: a.saturday + b.saturday, sundayHoliday: a.sundayHoliday + b.sundayHoliday });

/** Hours of an interval by pay category (Sunday/holiday > Saturday > night > normal), in 5-minute steps. */
export function splitHours(i: Interval, p: PayParams): HourSplit {
  // Counted in whole minutes, converted to hours at the end (no float drift).
  const min = { total: 0, normal: 0, night: 0, saturday: 0, sundayHoliday: 0 };
  const nightStart = minutesOf(p.nightStart);
  const nightEnd = minutesOf(p.nightEnd);
  const STEP = 5 * 60_000;
  for (let t = i.start; t < i.end; t += STEP) {
    const len = Math.round(Math.min(STEP, i.end - t) / 60_000);
    const date = isoOf(t);
    const minute = Math.floor((t - toMs(date)) / 60_000);
    const wd = weekday(date);
    min.total += len;
    if (wd === 0 || isHoliday(date, p.extraHolidays)) min.sundayHoliday += len;
    else if (wd === 6) min.saturday += len;
    else if (minute >= nightStart || minute < nightEnd) min.night += len;
    else min.normal += len;
  }
  return { total: min.total / 60, normal: min.normal / 60, night: min.night / 60, saturday: min.saturday / 60, sundayHoliday: min.sundayHoliday / 60 };
}

/** Callable duty lump sums: one per started 12 h, day rate when most of the 12 h fall on a weekday between 8 h and 20 h. */
export function onCallBlocks(a: Interval, p: PayParams): { day: number; nightWeekend: number } {
  let day = 0;
  let nightWeekend = 0;
  for (let s = a.start; s < a.end; s += 12 * 3_600_000) {
    const block = splitHours({ start: s, end: Math.min(a.end, s + 12 * 3_600_000) }, p);
    if (block.normal * 2 > block.total) day++;
    else nightWeekend++;
  }
  return { day, nightWeekend };
}

// ─── Month ─────────────────────────────────────────────────────────────────

export interface PayLine {
  label: string;
  detail: string;
  amount: number;
}

export interface Alert {
  level: "critical" | "warning" | "info";
  text: string;
}

export interface MonthPay {
  month: string;
  params: PayParams;
  hours: HourSplit;
  /** Hours counted for the averages: worked + assimilated days. */
  countedHours: number;
  workedDays: number;
  onCall: { day: number; nightWeekend: number };
  optingOutHours: number;
  hourly: number;
  lines: PayLine[];
  gross: number;
  contribution: number;
  taxable: number;
  withholding: number;
  special: number;
  expenses: number;
  /** Salary after contribution and withholding tax — without the expense allowance. */
  netSalary: number;
  /** What reaches the bank account: net salary + expense allowance. */
  paid: number;
  /** Communal tax is not withheld: settled a year later with the tax bill — the monthly amount to set aside. */
  communalProvision: number;
  alerts: Alert[];
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const eur = (x: number) => `${x.toLocaleString("fr-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const h1 = (x: number) => `${(Math.round(x * 10) / 10).toLocaleString("fr-BE")} h`;

function progressive(income: number, brackets: TaxBracket[]): number {
  let tax = 0;
  let floor = 0;
  for (const b of brackets) {
    const top = b.upTo ?? Infinity;
    if (income > floor) tax += (Math.min(income, top) - floor) * b.rate;
    floor = top;
  }
  return tax;
}

/** Monthly withholding tax estimated from the annual tax brackets (single person, no dependants). */
export function estimateWithholding(monthlyTaxable: number, p: PayParams): number {
  if (p.withholdingMode === "rate") return round2(monthlyTaxable * p.withholdingRate);
  const annual = monthlyTaxable * 12;
  const net = annual - Math.min(annual * p.professionalExpensesRate, p.professionalExpensesMax);
  const tax = progressive(net, p.taxBrackets) - progressive(p.taxFreeAllowance, p.taxBrackets);
  return round2(Math.max(0, tax) / 12);
}

/** Share of the month covered by the contract (base salary prorated by calendar days). */
function contractShare(month: string, p: PayParams): number {
  const first = `${month}-01`;
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const last = `${month}-${String(days).padStart(2, "0")}`;
  const from = p.contractStart && p.contractStart > first ? p.contractStart : first;
  const to = p.contractEnd && p.contractEnd < last ? p.contractEnd : last;
  if (to < from) return 0;
  return ((toMs(to) - toMs(from)) / DAY + 1) / days;
}

interface DayInfo {
  worked: Interval[];
  hours: HourSplit;
  counted: number;
}

function dayInfo(w: CarnetWorkday, p: PayParams): DayInfo {
  const { worked } = workedIntervals(w);
  const hours = worked.map((i) => splitHours(i, p)).reduce(addSplit, emptySplit());
  const counted = hours.total + (ASSIMILATED.includes(w.kind) && weekday(w.work_date) % 6 !== 0 ? p.assimilatedDayHours : 0);
  return { worked, hours, counted };
}

/** Hours counted per ISO week (Monday date → hours). */
export function weeklyHours(days: CarnetWorkday[], settings: PaySettings): Map<string, number> {
  const weeks = new Map<string, number>();
  for (const w of days) {
    const k = weekStart(w.work_date);
    weeks.set(k, (weeks.get(k) ?? 0) + dayInfo(w, paramsOn(settings, w.work_date)).counted);
  }
  return weeks;
}

/**
 * Opting-out hours paid in a month: every week's hours beyond 60 (paid in
 * the month of the week's Sunday), and at the end of each 13-week
 * reference period, the hours beyond 48 h a week on average not already
 * paid that way (paid in the month the period ends).
 */
export function optingOutHours(month: string, days: CarnetWorkday[], settings: PaySettings): number {
  const p = paramsOn(settings, `${month}-01`);
  if (!p.optingOut) return 0;
  const weeks = weeklyHours(days, settings);
  let hours = 0;
  for (const [monday, h] of weeks) if (addDays(monday, 6).slice(0, 7) === month) hours += Math.max(0, h - p.weeklyAbsolute);
  const start = p.contractStart || (days.length ? weekStart([...days].sort((a, b) => a.work_date.localeCompare(b.work_date))[0].work_date) : "");
  if (!start) return hours;
  const periodDays = p.referenceWeeks * 7;
  for (let s = weekStart(start); s <= `${month}-31`; s = addDays(s, periodDays)) {
    const end = addDays(s, periodDays - 1);
    if (end.slice(0, 7) !== month) continue;
    let total = 0;
    let over60 = 0;
    for (let k = 0; k < p.referenceWeeks; k++) {
      const h = weeks.get(addDays(s, k * 7)) ?? 0;
      total += h;
      over60 += Math.max(0, h - p.weeklyAbsolute);
    }
    hours += Math.max(0, total - p.referenceWeeks * p.weeklyAverage - over60);
  }
  return hours;
}

/** Legal limits over the days logged up to the end of the month. */
export function workTimeAlerts(month: string, days: CarnetWorkday[], settings: PaySettings): Alert[] {
  const alerts: Alert[] = [];
  const p = paramsOn(settings, `${month}-01`);
  const weeks = weeklyHours(days, settings);
  const absolute = p.optingOut ? p.weeklyAbsoluteOptingOut : p.weeklyAbsolute;
  const average = p.optingOut ? p.weeklyAverageOptingOut : p.weeklyAverage;
  for (const [monday, h] of [...weeks].sort()) {
    const sunday = addDays(monday, 6);
    if (sunday.slice(0, 7) !== month && monday.slice(0, 7) !== month) continue;
    if (h > absolute) alerts.push({ level: "critical", text: `Semaine du ${fr(monday)} : ${h1(h)} (maximum absolu ${absolute} h${p.optingOut ? " avec opting out" : ""}).` });
    else if (!p.optingOut && h > p.weeklyAverage + 0.01 && h <= absolute) alerts.push({ level: "info", text: `Semaine du ${fr(monday)} : ${h1(h)} — au-delà de ${p.weeklyAverage} h, à compenser dans la période de ${p.referenceWeeks} semaines.` });
  }
  // Rolling average over the reference period ending with the last week of the month.
  const lastMonday = weekStart(`${month}-28`);
  let total = 0;
  for (let k = 0; k < p.referenceWeeks; k++) total += weeks.get(addDays(lastMonday, -7 * k)) ?? 0;
  const avg = total / p.referenceWeeks;
  if (avg > average) alerts.push({ level: "critical", text: `Moyenne des ${p.referenceWeeks} dernières semaines : ${h1(avg)} par semaine (maximum ${average} h).` });

  // Shifts: ≤ 24 h in a row, 12 h of rest after 12–24 h.
  const shifts = days
    .filter((w) => w.work_date.slice(0, 7) === month || addDays(w.work_date, 1).slice(0, 7) === month)
    .flatMap((w) => workedIntervals(w).worked.map((i) => ({ ...i, date: w.work_date })))
    .sort((a, b) => a.start - b.start);
  for (let k = 0; k < shifts.length; k++) {
    const len = (shifts[k].end - shifts[k].start) / 3_600_000;
    if (len > p.maxShiftHours) alerts.push({ level: "critical", text: `${fr(shifts[k].date)} : ${h1(len)} d'affilée (maximum ${p.maxShiftHours} h).` });
    const next = shifts[k + 1];
    if (len >= 12 && next) {
      const rest = (next.start - shifts[k].end) / 3_600_000;
      if (rest < p.restAfterLongShift) alerts.push({ level: "warning", text: `${fr(shifts[k].date)} : ${h1(rest)} de repos après ${h1(len)} de travail (minimum ${p.restAfterLongShift} h).` });
    }
  }
  return alerts;
}

const fr = (iso: string) => iso.split("-").reverse().join("/");

/** Everything for one calendar month (YYYY-MM): hours, pay lines, gross to net, legal alerts. */
export function monthPay(month: string, allDays: CarnetWorkday[], settings: PaySettings): MonthPay {
  const p = paramsOn(settings, `${month}-01`);
  const days = allDays.filter((w) => w.work_date.slice(0, 7) === month);
  const hourly = p.baseMonthly / p.monthlyReferenceHours;
  let hours = emptySplit();
  let counted = 0;
  const onCall = { day: 0, nightWeekend: 0 };
  for (const w of days) {
    const pd = paramsOn(settings, w.work_date);
    const info = dayInfo(w, pd);
    hours = addSplit(hours, info.hours);
    counted += info.counted;
    const { availability } = workedIntervals(w);
    if (availability) {
      const b = onCallBlocks(availability, pd);
      onCall.day += b.day;
      onCall.nightWeekend += b.nightWeekend;
    }
  }
  // Days « prestés »: with worked hours, or leave, holiday, sick, scientific or course days (paid days). A date with several rows counts once.
  const workedDays = new Set(days.filter((w) => ASSIMILATED.includes(w.kind) || dayInfo(w, paramsOn(settings, w.work_date)).hours.total > 0).map((w) => w.work_date)).size;

  const share = contractShare(month, p);
  const lines: PayLine[] = [];
  const base = round2(p.baseMonthly * share);
  lines.push({ label: "Rémunération de base", detail: share < 1 ? `${eur(p.baseMonthly)} × ${Math.round(share * 100)} % du mois (convention)` : "temps plein", amount: base });
  const factor = (rate: number) => (p.uncomfortableMode === "supplement" ? rate - 1 : rate);
  const unc = [
    { label: `Heures de nuit (${p.nightStart}–${p.nightEnd})`, h: hours.night, rate: p.nightRate },
    { label: "Heures du samedi", h: hours.saturday, rate: p.saturdayRate },
    { label: "Heures du dimanche et jours fériés", h: hours.sundayHoliday, rate: p.sundayHolidayRate },
  ];
  for (const u of unc)
    if (u.h > 0)
      lines.push({
        label: u.label,
        detail: `${h1(u.h)} × ${eur(hourly)} × ${Math.round(factor(u.rate) * 100)} %${p.uncomfortableMode === "supplement" ? ` (supplément, ${Math.round(u.rate * 100)} % en tout)` : ""}`,
        amount: round2(u.h * hourly * factor(u.rate)),
      });
  const opting = optingOutHours(month, allDays, settings);
  if (opting > 0) lines.push({ label: "Heures d'opting out", detail: `${h1(opting)} × ${eur(hourly)} × ${Math.round(p.optingOutRate * 100)} %`, amount: round2(opting * hourly * p.optingOutRate) });
  if (onCall.day) lines.push({ label: "Gardes appelables (jour)", detail: `${onCall.day} × ${eur(p.onCallDay)} par 12 h entamées`, amount: round2(onCall.day * p.onCallDay) });
  if (onCall.nightWeekend) lines.push({ label: "Gardes appelables (nuit, week-end)", detail: `${onCall.nightWeekend} × ${eur(p.onCallNightWeekend)} par 12 h entamées`, amount: round2(onCall.nightWeekend * p.onCallNightWeekend) });

  const gross = round2(lines.reduce((s, l) => s + l.amount, 0));
  const contribution = round2(gross * p.personalContributionRate);
  const taxable = round2(gross - contribution);
  const withholding = estimateWithholding(taxable, p);
  const special = round2(p.specialContributionMonthly);
  const expenses = share > 0 && workedDays >= p.expenseMinDays ? round2(p.expenseAllowance * Math.min(1, share)) : 0;
  const netSalary = round2(taxable - withholding - special);
  const paid = round2(netSalary + expenses);
  const communalProvision = round2(withholding * p.communalTaxRate);

  const alerts = workTimeAlerts(month, allDays, settings);
  if (hours.total > p.maxMonthlyHours) alerts.push({ level: "warning", text: `${h1(hours.total)} ce mois : repos compensatoire dû pour ${h1(hours.total - p.maxMonthlyHours)} (au-delà de ${p.maxMonthlyHours} h).` });
  if (share > 0 && workedDays < p.expenseMinDays && days.length > 0) alerts.push({ level: "info", text: `${workedDays} jour(s) presté(s) : indemnité de frais non due sous ${p.expenseMinDays} jours (sauf maladie ≤ 30 jours ou congés — à vérifier).` });

  return { month, params: p, hours, countedHours: counted, workedDays, onCall, optingOutHours: opting, hourly, lines, gross, contribution, taxable, withholding, special, expenses, netSalary, paid, communalProvision, alerts };
}

/** Days of leave, holidays and scientific days used over the contract year (or the calendar year without contract dates). */
export function leaveBalance(days: CarnetWorkday[], p: PayParams, on: string): { from: string; to: string; used: Record<"leave" | "holiday" | "scientific" | "sick" | "course", number> } {
  let from = `${on.slice(0, 4)}-01-01`;
  let to = `${on.slice(0, 4)}-12-31`;
  if (p.contractStart && p.contractStart <= on) {
    from = p.contractStart;
    while (addDays(from, 365) <= on) from = addDays(from, 365);
    to = p.contractEnd && p.contractEnd < addDays(from, 364) ? p.contractEnd : addDays(from, 364);
  }
  const used = { leave: 0, holiday: 0, scientific: 0, sick: 0, course: 0 };
  for (const w of days) if (w.work_date >= from && w.work_date <= to && w.kind in used) used[w.kind as keyof typeof used]++;
  return { from, to, used };
}

export const WORKDAY_KINDS: { code: WorkdayKind; label: string; timed: boolean }[] = [
  { code: "work", label: "Journée", timed: true },
  { code: "on_site", label: "Garde sur place", timed: true },
  { code: "on_call", label: "Garde appelable", timed: true },
  { code: "leave", label: "Congé", timed: false },
  { code: "holiday", label: "Férié", timed: false },
  { code: "scientific", label: "Journée scientifique", timed: false },
  { code: "course", label: "Cours / examen", timed: false },
  { code: "sick", label: "Maladie", timed: false },
  { code: "recovery", label: "Récupération", timed: false },
];
