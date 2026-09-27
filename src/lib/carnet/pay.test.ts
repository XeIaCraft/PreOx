import { describe, expect, it } from "vitest";
import { DEFAULT_PAY, belgianHolidays, estimateWithholding, leaveBalance, monthPay, onCallBlocks, paramsOn, paySettingsFrom, splitHours, workedIntervals, type PaySettings } from "./pay";
import type { CarnetWorkday } from "./types";

let seq = 0;
function day(work_date: string, kind: CarnetWorkday["kind"], start = "", end = "", extra: Partial<CarnetWorkday> = {}): CarnetWorkday {
  seq++;
  return { id: `w${seq}`, stage_id: null, work_date, kind, start_time: start, end_time: end, end_next_day: false, break_minutes: 0, callouts: [], notes: "", created_at: "2026-10-01T00:00:00Z", ...extra };
}
const settings = (patch: Partial<typeof DEFAULT_PAY> = {}): PaySettings => ({ versions: [{ ...DEFAULT_PAY, contractStart: "2026-10-05", contractEnd: "2027-10-03", ...patch }] });
const hourly = DEFAULT_PAY.baseMonthly / DEFAULT_PAY.monthlyReferenceHours;

/** Every weekday of a month, 8 h–17 h with a 1 h break (8 h a day). */
function fullMonth(month: string, from = 1): CarnetWorkday[] {
  const out: CarnetWorkday[] = [];
  for (let d = from; d <= 31; d++) {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    const date = new Date(`${iso}T00:00:00Z`);
    if (date.getUTCMonth() + 1 !== Number(month.slice(5)) || date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
    out.push(day(iso, "work", "08:00", "17:00", { break_minutes: 60 }));
  }
  return out;
}

describe("calendrier", () => {
  it("jours fériés belges (Pâques mobile)", () => {
    const d = belgianHolidays(2027).map((h) => h.date);
    expect(d).toContain("2027-03-29"); // lundi de Pâques
    expect(d).toContain("2027-05-06"); // Ascension
    expect(d).toContain("2027-05-17"); // Pentecôte
    expect(d).toHaveLength(10);
  });
});

describe("heures", () => {
  it("répartit nuit, samedi, dimanche et jours fériés", () => {
    const tue = workedIntervals(day("2026-10-06", "work", "07:00", "21:00")).worked[0];
    expect(splitHours(tue, DEFAULT_PAY)).toMatchObject({ total: 14, normal: 12, night: 2 });
    const friNight = workedIntervals(day("2026-10-09", "on_site", "20:00", "08:00")).worked[0];
    expect(splitHours(friNight, DEFAULT_PAY)).toMatchObject({ total: 12, night: 4, saturday: 8 });
    const nov11 = workedIntervals(day("2026-11-11", "work", "08:00", "16:00")).worked[0];
    expect(splitHours(nov11, DEFAULT_PAY).sundayHoliday).toBe(8);
  });

  it("garde appelable : forfaits par 12 h entamées et temps réellement presté", () => {
    const weekend = workedIntervals(day("2026-10-10", "on_call", "08:00", "08:00", { callouts: [{ start: "02:00", end: "04:30", next_day: true }] }));
    expect(onCallBlocks(weekend.availability!, DEFAULT_PAY)).toEqual({ day: 0, nightWeekend: 2 });
    expect(splitHours(weekend.worked[0], DEFAULT_PAY).total).toBe(2.5);
    const weekday = workedIntervals(day("2026-10-06", "on_call", "08:00", "08:00")).availability!;
    expect(onCallBlocks(weekday, DEFAULT_PAY)).toEqual({ day: 1, nightWeekend: 1 });
  });
});

describe("rémunération du mois", () => {
  it("base, suppléments d'heures inconfortables, cotisation sui generis 4,70 %, frais", () => {
    const days = [...fullMonth("2026-11"), day("2026-11-15", "on_site", "08:00", "16:00")];
    const m = monthPay("2026-11", days, settings());
    expect(m.lines[0].amount).toBe(DEFAULT_PAY.baseMonthly);
    const sunday = m.lines.find((l) => l.label.startsWith("Heures du dimanche"))!;
    // 11/11 (férié, 8 h) + dimanche 15/11 (8 h) : supplément de 60 %.
    expect(sunday.amount).toBeCloseTo(16 * hourly * 0.6, 1);
    expect(m.contribution).toBeCloseTo(m.gross * 0.047, 1);
    expect(m.expenses).toBe(DEFAULT_PAY.expenseAllowance);
    expect(m.netSalary).toBeCloseTo(m.taxable - m.withholding - m.special, 2);
    expect(m.paid).toBeCloseTo(m.netSalary + DEFAULT_PAY.expenseAllowance, 2);
  });

  it("proratise la base au début de la convention", () => {
    const m = monthPay("2026-10", fullMonth("2026-10", 5), settings());
    expect(m.lines[0].amount).toBeCloseTo((DEFAULT_PAY.baseMonthly * 27) / 31, 1);
  });

  it("pas d'indemnité de frais sous 10 jours prestés", () => {
    const m = monthPay("2026-12", fullMonth("2026-12").slice(0, 5), settings(), "2027-01-10");
    // En cours de mois : comptée d'office (temps plein), en attente.
    const now = monthPay("2026-12", fullMonth("2026-12").slice(0, 5), settings(), "2026-12-08");
    expect(now.expenses).toBe(DEFAULT_PAY.expenseAllowance);
    expect(now.expensesProvisional).toBe(true);
    expect(m.expenses).toBe(0);
    expect(m.alerts.some((a) => a.text.includes("indemnité de frais"))).toBe(true);
  });

  it("opting out : heures au-delà de 60 h par semaine payées à 110 %", () => {
    const week = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"].map((d) => day(d, "work", "06:00", "19:00"));
    const signed = monthPay("2026-11", week, settings({ optingOut: true }));
    expect(signed.optingOutHours).toBeCloseTo(5, 5);
    expect(signed.lines.find((l) => l.label === "Heures d'opting out")!.amount).toBeCloseTo(5 * hourly * 1.1, 1);
    const notSigned = monthPay("2026-11", week, settings());
    expect(notSigned.optingOutHours).toBe(0);
    expect(notSigned.alerts.some((a) => a.level === "critical" && a.text.includes("maximum absolu 60 h"))).toBe(true);
  });

  it("alerte sur plus de 24 h d'affilée et un repos trop court", () => {
    const days = [day("2026-11-02", "on_site", "08:00", "10:00", { end_next_day: true }), day("2026-11-03", "work", "18:00", "22:00")];
    const alerts = monthPay("2026-11", days, settings()).alerts.map((a) => a.text);
    expect(alerts.some((t) => t.includes("26 h d'affilée"))).toBe(true);
    expect(alerts.some((t) => t.includes("de repos après"))).toBe(true);
  });

  it("précompte : barème (estimation) ou taux de la fiche de paie", () => {
    const scale = estimateWithholding(3634, DEFAULT_PAY);
    expect(scale).toBeGreaterThan(700);
    expect(scale).toBeLessThan(1000);
    expect(estimateWithholding(3000, { ...DEFAULT_PAY, withholdingMode: "rate", withholdingRate: 0.25 })).toBe(750);
  });
});

describe("réglages", () => {
  it("versions datées : la version en vigueur à la date", () => {
    const s = paySettingsFrom({ versions: [{ from: "2026-01-01", baseMonthly: 3813.82 }, { from: "2027-01-01", baseMonthly: 3900 }] });
    expect(paramsOn(s, "2026-12-31").baseMonthly).toBe(3813.82);
    expect(paramsOn(s, "2027-02-01").baseMonthly).toBe(3900);
    expect(paramsOn(s, "2027-02-01").personalContributionRate).toBe(0.047);
  });

  it("compteur de congés sur l'année de convention", () => {
    const days = [day("2026-12-24", "leave"), day("2026-12-25", "holiday"), day("2027-01-15", "scientific"), day("2027-11-02", "leave")];
    const b = leaveBalance(days, settings().versions[0], "2027-02-01");
    expect(b.from).toBe("2026-10-05");
    expect(b.used).toMatchObject({ leave: 1, holiday: 1, scientific: 1 });
  });
});

describe("exemple : 8 h–18 h du lundi au vendredi, sans garde", () => {
  it("brut = base, net salaire ≈ 2 690 €, + frais 165,45 € ; un salarié ordinaire (13,07 %) ≈ 2 525 €", () => {
    const days: CarnetWorkday[] = [];
    for (let d = 1; d <= 30; d++) {
      const iso = `2026-11-${String(d).padStart(2, "0")}`;
      const wd = new Date(`${iso}T00:00:00Z`).getUTCDay();
      if (wd === 0 || wd === 6 || iso === "2026-11-11" || iso === "2026-11-02") continue;
      days.push(day(iso, "work", "08:00", "18:00", { break_minutes: 30 }));
    }
    const m = monthPay("2026-11", days, settings());
    expect(m.gross).toBe(3813.82);
    expect(m.contribution).toBe(179.25);
    expect(m.taxable).toBe(3634.57);
    // Formule-clé : taux fédéraux × 1,07 (additionnels communaux), frais forfaitaires 30 % plafonnés à 5 930 €.
    expect(m.withholding).toBeCloseTo(907.69, 1);
    // Cotisation spéciale : 18,60 € + 1,1 % × (3 813,82 − 2 190,18).
    expect(m.special).toBeCloseTo(36.46, 2);
    expect(m.netSalary).toBeCloseTo(2690.42, 1);
    expect(m.paid).toBeCloseTo(2855.87, 1);
    const employeeTaxable = m.gross * (1 - 0.1307);
    expect(employeeTaxable - estimateWithholding(employeeTaxable, DEFAULT_PAY) - m.special).toBeCloseTo(2524.9, 0);
  });
});
