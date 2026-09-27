"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, CircleAlert, Info, Plus, Settings2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { ChipGroup, EmptyState, Field, SectionTitle } from "@/components/carnet/ui";
import { deleteRow, newId, putRow } from "@/lib/carnet/mutations";
import { formatDateFr, localDateIso } from "@/lib/carnet/logic";
import {
  DEFAULT_PAY,
  PAY_SOURCES,
  WORKDAY_KINDS,
  belgianHolidays,
  leaveBalance,
  monthPay,
  paramsOn,
  paySettingsFrom,
  splitHours,
  workedIntervals,
  type Alert,
  type PayParams,
  type PaySettings,
} from "@/lib/carnet/pay";
import type { CarnetStage, CarnetWorkday, WorkCallout, WorkdayKind } from "@/lib/carnet/types";
import { cn } from "@/lib/utils";

const eur = (x: number) => `${x.toLocaleString("fr-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const hours = (x: number) => `${(Math.round(x * 10) / 10).toLocaleString("fr-BE")} h`;
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("fr-BE", { month: "long", year: "numeric", timeZone: "UTC" });
const shiftMonth = (m: string, n: number) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const kindLabel = (k: WorkdayKind) => WORKDAY_KINDS.find((x) => x.code === k)?.label ?? k;
const timed = (k: WorkdayKind) => WORKDAY_KINDS.find((x) => x.code === k)?.timed ?? false;

function usePaySettings(): { settings: PaySettings; save: (s: PaySettings) => void } {
  const { data, commit } = useCarnet();
  const row = data.settings.find((s) => s.key === "pay");
  const settings = useMemo(() => paySettingsFrom(row?.value), [row?.value]);
  return {
    settings,
    save: (s) => commit([putRow("settings", { id: row?.id ?? newId(), key: "pay", value: { versions: s.versions } as Record<string, unknown> })]),
  };
}

function AlertLine({ a }: { a: Alert }) {
  const Icon = a.level === "critical" ? CircleAlert : a.level === "warning" ? AlertTriangle : Info;
  return (
    <li className={cn("flex items-start gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-sm", a.level === "critical" ? "border-danger/30 bg-danger-tint text-danger" : a.level === "warning" ? "border-accent/30 bg-accent-tint text-accent" : "border-border bg-surface text-foreground-muted")}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{a.text}</span>
    </li>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">{label}</p>
      <p className="mt-1 font-serif-display text-xl tabular-nums text-foreground">{value}</p>
      {sub && <p className="text-xs text-foreground-muted">{sub}</p>}
    </div>
  );
}

interface Draft {
  id: string | null;
  work_date: string;
  kind: WorkdayKind;
  start_time: string;
  end_time: string;
  end_next_day: boolean;
  break_minutes: number;
  callouts: WorkCallout[];
  notes: string;
}

const DEFAULT_TIMES: Partial<Record<WorkdayKind, [string, string, number]>> = {
  work: ["08:00", "17:00", 30],
  on_site: ["08:00", "08:00", 0],
  on_call: ["20:00", "08:00", 0],
};

/** Times of the last day of this kind, else the usual ones — one tap for the usual day. */
function lastTimes(days: CarnetWorkday[], kind: WorkdayKind): Pick<Draft, "start_time" | "end_time" | "break_minutes"> {
  const last = [...days].filter((d) => d.kind === kind && d.start_time).sort((a, b) => b.work_date.localeCompare(a.work_date) || b.created_at.localeCompare(a.created_at))[0];
  if (last) return { start_time: last.start_time, end_time: last.end_time, break_minutes: last.break_minutes };
  const d = DEFAULT_TIMES[kind];
  return d ? { start_time: d[0], end_time: d[1], break_minutes: d[2] } : { start_time: "", end_time: "", break_minutes: 0 };
}

function DayForm({ draft, set, onSave, onCancel, onDelete }: { draft: Draft; set: (p: Partial<Draft>) => void; onSave: () => void; onCancel?: () => void; onDelete?: () => void }) {
  const { data } = useCarnet();
  const crosses = !!draft.start_time && !!draft.end_time && draft.end_time <= draft.start_time;
  const preview = useMemo(() => {
    if (!timed(draft.kind)) return null;
    const w = { ...draft, id: "x", stage_id: null, created_at: "", end_next_day: draft.end_next_day || crosses } as CarnetWorkday;
    const p = paramsOn(paySettingsFrom(data.settings.find((s) => s.key === "pay")?.value), draft.work_date);
    const { worked, availability } = workedIntervals(w);
    const h = worked.map((i) => splitHours(i, p)).reduce((a, b) => a + b.total, 0);
    const avail = availability ? (availability.end - availability.start) / 3_600_000 : 0;
    return draft.kind === "on_call" ? `Disponible ${hours(avail)} · presté ${hours(h)}` : `${hours(h)} de travail`;
  }, [draft, crosses, data.settings]);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Date">
          <Input type="date" value={draft.work_date} onChange={(e) => e.target.value && set({ work_date: e.target.value })} className="h-10 w-auto" />
        </Field>
      </div>
      <ChipGroup size="sm" options={WORKDAY_KINDS.map((k) => ({ code: k.code, label: k.label }))} value={draft.kind} onChange={(v) => v && set({ kind: v, ...(timed(v) && v !== draft.kind ? { ...lastTimes(data.workdays, v), end_next_day: false } : {}) })} />
      {timed(draft.kind) && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label={draft.kind === "on_call" ? "Disponible de" : "Début"}>
              <Input type="time" value={draft.start_time} onChange={(e) => set({ start_time: e.target.value })} className="h-10" />
            </Field>
            <Field label="Fin">
              <Input type="time" value={draft.end_time} onChange={(e) => set({ end_time: e.target.value })} className="h-10" />
            </Field>
            {draft.kind !== "on_call" && (
              <Field label="Pause (min)">
                <Input type="number" inputMode="numeric" min={0} max={720} value={draft.break_minutes} onChange={(e) => set({ break_minutes: Math.max(0, Math.min(720, Number(e.target.value) || 0)) })} className="h-10" />
              </Field>
            )}
            <label className="flex min-h-10 items-end gap-2 pb-2 text-xs text-foreground-muted">
              <Switch checked={draft.end_next_day || crosses} onCheckedChange={(v) => set({ end_next_day: v })} aria-label="Fin le lendemain" disabled={crosses} />
              Fin le lendemain{crosses ? " (auto)" : ""}
            </label>
          </div>
          {draft.kind === "on_call" && (
            <div className="space-y-1.5 rounded-[var(--radius-md)] border border-border bg-surface-muted/50 p-2.5">
              <p className="text-xs font-medium text-foreground-subtle">Rappels à l&apos;hôpital (temps réellement presté, compté comme travail)</p>
              {draft.callouts.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input type="time" value={c.start} onChange={(e) => set({ callouts: draft.callouts.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} className="h-9 w-28" aria-label="Arrivée" />
                  <span className="text-xs text-foreground-subtle">→</span>
                  <Input type="time" value={c.end} onChange={(e) => set({ callouts: draft.callouts.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} className="h-9 w-28" aria-label="Départ" />
                  <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
                    <Switch checked={c.next_day} onCheckedChange={(v) => set({ callouts: draft.callouts.map((x, j) => (j === i ? { ...x, next_day: v } : x)) })} aria-label="Le lendemain" />
                    le lendemain
                  </label>
                  <Button type="button" size="icon" variant="ghost" onClick={() => set({ callouts: draft.callouts.filter((_, j) => j !== i) })} aria-label="Retirer le rappel">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="ghost" onClick={() => set({ callouts: [...draft.callouts, { start: "", end: "", next_day: draft.start_time >= "18:00" }] })}>
                <Plus className="h-3.5 w-3.5" /> Rappel
              </Button>
            </div>
          )}
        </>
      )}
      <Input value={draft.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Remarque (facultatif)" className="h-10" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-foreground-subtle">{preview}</p>
        <div className="flex gap-2">
          {onDelete && (
            <Button type="button" variant="ghost" onClick={onDelete} className="text-danger">
              <Trash2 className="h-4 w-4" /> Supprimer
            </Button>
          )}
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Annuler
            </Button>
          )}
          <Button type="submit">{draft.id ? "Enregistrer" : "Ajouter"}</Button>
        </div>
      </div>
    </form>
  );
}

function num(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** One number of the settings, with its unit; percentages are shown ×100. */
function NumberInput({ label, value, onChange, unit, percent }: { label: string; value: number; onChange: (v: number) => void; unit?: string; percent?: boolean }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground-subtle">{label}</span>
      <span className="flex items-center gap-1.5">
        <Input inputMode="decimal" defaultValue={String(percent ? Math.round(value * 10000) / 100 : value).replace(".", ",")} onChange={(e) => onChange(percent ? num(e.target.value) / 100 : num(e.target.value))} className="h-9" />
        {unit && <span className="shrink-0 text-xs text-foreground-subtle">{unit}</span>}
      </span>
    </label>
  );
}

function PaySettingsEditor({ onClose }: { onClose: () => void }) {
  const { settings, save } = usePaySettings();
  const { toast } = useToast();
  const [versions, setVersions] = useState<PayParams[]>(settings.versions);
  const [index, setIndex] = useState(versions.length - 1);
  const v = versions[index];
  const set = (patch: Partial<PayParams>) => setVersions(versions.map((x, i) => (i === index ? { ...x, ...patch } : x)));
  const group = (title: string, children: React.ReactNode, hint?: string) => (
    <section className="space-y-2 rounded-[var(--radius-md)] border border-border p-3">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {hint && <p className="text-xs text-foreground-subtle">{hint}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>
    </section>
  );
  return (
    <div className="space-y-3" key={index}>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={index} onChange={(e) => setIndex(Number(e.target.value))} className="h-9 w-auto" aria-label="Version">
          {versions.map((x, i) => (
            <option key={i} value={i}>
              À partir du {formatDateFr(x.from)}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const from = prompt("Nouvelle version à partir du (AAAA-MM-JJ) — ex. le 1er janvier pour l'indexation :", `${new Date().getFullYear() + 1}-01-01`);
            if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return;
            const next = [...versions, { ...v, from, note: `Copie de la version du ${formatDateFr(v.from)} — à adapter.` }].sort((a, b) => a.from.localeCompare(b.from));
            setVersions(next);
            setIndex(next.findIndex((x) => x.from === from));
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Nouvelle version datée
        </Button>
        {versions.length > 1 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (!confirm("Supprimer cette version ?")) return;
              setVersions(versions.filter((_, i) => i !== index));
              setIndex(0);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Supprimer la version
          </Button>
        )}
      </div>
      <p className="text-xs text-foreground-muted">
        Une version s&apos;applique à partir de sa date : quand l&apos;index, la loi ou votre convention change, créez une version datée du changement — les mois
        passés gardent leurs anciennes valeurs.
      </p>
      {group(
        "Convention",
        <>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground-subtle">Version à partir du</span>
            <Input type="date" value={v.from} onChange={(e) => e.target.value && set({ from: e.target.value })} className="h-9" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground-subtle">Début de convention</span>
            <Input type="date" value={v.contractStart} onChange={(e) => set({ contractStart: e.target.value })} className="h-9" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground-subtle">Fin de convention</span>
            <Input type="date" value={v.contractEnd} onChange={(e) => set({ contractEnd: e.target.value })} className="h-9" />
          </label>
          <NumberInput label="Rémunération mensuelle brute" value={v.baseMonthly} onChange={(x) => set({ baseMonthly: x })} unit="€" />
          <NumberInput label="Heures payées par la base / mois" value={v.monthlyReferenceHours} onChange={(x) => set({ monthlyReferenceHours: x })} unit="h" />
          <NumberInput label="Indemnité de frais / mois" value={v.expenseAllowance} onChange={(x) => set({ expenseAllowance: x })} unit="€" />
          <NumberInput label="Jours prestés minimum pour les frais" value={v.expenseMinDays} onChange={(x) => set({ expenseMinDays: x })} unit="j" />
        </>,
        `Taux horaire de base : ${eur(v.baseMonthly / (v.monthlyReferenceHours || 1))} (base ÷ heures de référence ; 48 h × 52 / 12 = 208 h).`
      )}
      {group(
        "Heures inconfortables et opting out",
        <>
          <NumberInput label="Nuit" value={v.nightRate} onChange={(x) => set({ nightRate: x })} unit="%" percent />
          <NumberInput label="Samedi" value={v.saturdayRate} onChange={(x) => set({ saturdayRate: x })} unit="%" percent />
          <NumberInput label="Dimanche et férié" value={v.sundayHolidayRate} onChange={(x) => set({ sundayHolidayRate: x })} unit="%" percent />
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground-subtle">Nuit de</span>
            <Input type="time" value={v.nightStart} onChange={(e) => set({ nightStart: e.target.value })} className="h-9" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground-subtle">à</span>
            <Input type="time" value={v.nightEnd} onChange={(e) => set({ nightEnd: e.target.value })} className="h-9" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground-subtle">Calcul</span>
            <Select value={v.uncomfortableMode} onChange={(e) => set({ uncomfortableMode: e.target.value as PayParams["uncomfortableMode"] })} className="h-9">
              <option value="supplement">Supplément (la base paie déjà 100 %)</option>
              <option value="total">Taux entier en plus</option>
            </Select>
          </label>
          <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-1">
            <Switch checked={v.optingOut} onCheckedChange={(x) => set({ optingOut: x })} aria-label="Opting out signé" />
            Opting out signé
          </label>
          <NumberInput label="Heures d'opting out" value={v.optingOutRate} onChange={(x) => set({ optingOutRate: x })} unit="%" percent />
        </>
      )}
      {group(
        "Gardes appelables",
        <>
          <NumberInput label="Forfait 12 h, jour (8 h–20 h)" value={v.onCallDay} onChange={(x) => set({ onCallDay: x })} unit="€" />
          <NumberInput label="Forfait 12 h, nuit et week-end" value={v.onCallNightWeekend} onChange={(x) => set({ onCallNightWeekend: x })} unit="€" />
        </>,
        "Par période de 12 h entamée ; le temps réellement presté à l'hôpital (rappels) est payé en plus comme du travail."
      )}
      {group(
        "Cotisations et impôt",
        <>
          <NumberInput label="Cotisation personnelle ONSS" value={v.personalContributionRate} onChange={(x) => set({ personalContributionRate: x })} unit="%" percent />
          <NumberInput label="Cotisation spéciale de sécurité sociale / mois" value={v.specialContributionMonthly} onChange={(x) => set({ specialContributionMonthly: x })} unit="€" />
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground-subtle">Précompte</span>
            <Select value={v.withholdingMode} onChange={(e) => set({ withholdingMode: e.target.value as PayParams["withholdingMode"] })} className="h-9">
              <option value="scale">Estimé par le barème</option>
              <option value="rate">Taux de ma fiche de paie</option>
            </Select>
          </label>
          {v.withholdingMode === "rate" ? (
            <NumberInput label="Taux de précompte (fiche de paie)" value={v.withholdingRate} onChange={(x) => set({ withholdingRate: x })} unit="%" percent />
          ) : (
            <>
              <NumberInput label="Quotité exemptée (an)" value={v.taxFreeAllowance} onChange={(x) => set({ taxFreeAllowance: x })} unit="€" />
              <NumberInput label="Frais professionnels forfaitaires" value={v.professionalExpensesRate} onChange={(x) => set({ professionalExpensesRate: x })} unit="%" percent />
              <NumberInput label="Frais professionnels maximum (an)" value={v.professionalExpensesMax} onChange={(x) => set({ professionalExpensesMax: x })} unit="€" />
              {v.taxBrackets.map((b, i) => (
                <NumberInput key={i} label={`Tranche ${i + 1} : taux${b.upTo ? ` jusqu'à ${b.upTo.toLocaleString("fr-BE")} €` : ""}`} value={b.rate} onChange={(x) => set({ taxBrackets: v.taxBrackets.map((y, j) => (j === i ? { ...y, rate: x } : y)) })} unit="%" percent />
              ))}
              {v.taxBrackets.slice(0, -1).map((b, i) => (
                <NumberInput key={`l${i}`} label={`Limite de la tranche ${i + 1}`} value={b.upTo ?? 0} onChange={(x) => set({ taxBrackets: v.taxBrackets.map((y, j) => (j === i ? { ...y, upTo: x } : y)) })} unit="€" />
              ))}
            </>
          )}
          <NumberInput label="Avantage INAMI (statut social, an)" value={v.inamiSocialAdvantage} onChange={(x) => set({ inamiSocialAdvantage: x })} unit="€" />
        </>,
        "Statut sui generis : 4,70 % (soins de santé 3,55 % + indemnités 1,15 %) — pas de cotisation pension ni chômage. Le précompte « barème » est une estimation (personne isolée, sans charge) ; le mode « taux » reprend exactement votre fiche."
      )}
      {group(
        "Temps de travail et congés",
        <>
          <NumberInput label="Moyenne hebdomadaire max" value={v.weeklyAverage} onChange={(x) => set({ weeklyAverage: x })} unit="h" />
          <NumberInput label="Maximum absolu / semaine" value={v.weeklyAbsolute} onChange={(x) => set({ weeklyAbsolute: x })} unit="h" />
          <NumberInput label="Moyenne max (opting out)" value={v.weeklyAverageOptingOut} onChange={(x) => set({ weeklyAverageOptingOut: x })} unit="h" />
          <NumberInput label="Maximum absolu (opting out)" value={v.weeklyAbsoluteOptingOut} onChange={(x) => set({ weeklyAbsoluteOptingOut: x })} unit="h" />
          <NumberInput label="Période de référence" value={v.referenceWeeks} onChange={(x) => set({ referenceWeeks: Math.max(1, Math.round(x)) })} unit="sem." />
          <NumberInput label="Heures planifiables / mois" value={v.maxMonthlyHours} onChange={(x) => set({ maxMonthlyHours: x })} unit="h" />
          <NumberInput label="Prestation max d'affilée" value={v.maxShiftHours} onChange={(x) => set({ maxShiftHours: x })} unit="h" />
          <NumberInput label="Repos après 12–24 h" value={v.restAfterLongShift} onChange={(x) => set({ restAfterLongShift: x })} unit="h" />
          <NumberInput label="Heures comptées par jour de congé" value={v.assimilatedDayHours} onChange={(x) => set({ assimilatedDayHours: x })} unit="h" />
          <NumberInput label="Congés / an" value={v.leaveDays} onChange={(x) => set({ leaveDays: x })} unit="j" />
          <NumberInput label="Jours fériés / an" value={v.publicHolidays} onChange={(x) => set({ publicHolidays: x })} unit="j" />
          <NumberInput label="Journées scientifiques / an" value={v.scientificDays} onChange={(x) => set({ scientificDays: x })} unit="j" />
        </>
      )}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground-subtle">Autres jours fériés (AAAA-MM-JJ, virgules)</span>
        <Input defaultValue={v.extraHolidays.join(", ")} onChange={(e) => set({ extraHolidays: e.target.value.split(",").map((x) => x.trim()).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) })} className="h-9" />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground-subtle">Note</span>
        <Input value={v.note} onChange={(e) => set({ note: e.target.value })} className="h-9" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            save({ versions });
            toast("Réglages enregistrés.", { variant: "success" });
            onClose();
          }}
        >
          Enregistrer
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (!confirm("Remettre cette version aux valeurs par défaut (sauf dates de convention) ?")) return;
            set({ ...DEFAULT_PAY, from: v.from, contractStart: v.contractStart, contractEnd: v.contractEnd, optingOut: v.optingOut });
          }}
        >
          Valeurs par défaut
        </Button>
      </div>
      <details className="text-xs text-foreground-subtle">
        <summary className="cursor-pointer text-primary-strong">Sources et limites</summary>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          {PAY_SOURCES.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** « Journées » : the work log (amplitudes, duties, leave), legal limits, and the estimated pay of the month. */
export function WorkdaysView({ stage }: { stage: CarnetStage | null }) {
  const { data, commit } = useCarnet();
  const { toast } = useToast();
  const { settings } = usePaySettings();
  const today = localDateIso();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [editingSettings, setEditingSettings] = useState(false);
  const blank = (date = today, kind: WorkdayKind = "work"): Draft => ({ id: null, work_date: date, kind, ...lastTimes(data.workdays, kind), end_next_day: false, callouts: [], notes: "" });
  const [draft, setDraft] = useState<Draft>(() => blank());
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const pay = useMemo(() => monthPay(month, data.workdays, settings), [month, data.workdays, settings]);
  const monthDays = data.workdays.filter((w) => w.work_date.slice(0, 7) === month).sort((a, b) => a.work_date.localeCompare(b.work_date) || a.created_at.localeCompare(b.created_at));
  const p = paramsOn(settings, `${month}-01`);
  const balance = leaveBalance(data.workdays, p, month === today.slice(0, 7) ? today : `${month}-15`);
  const holidays = belgianHolidays(Number(month.slice(0, 4))).filter((h) => h.date.slice(0, 7) === month);
  const uncomfortable = pay.hours.night + pay.hours.saturday + pay.hours.sundayHoliday;

  function save() {
    const crosses = !!draft.start_time && !!draft.end_time && draft.end_time <= draft.start_time;
    const row: CarnetWorkday = {
      id: draft.id ?? newId(),
      stage_id: data.workdays.find((w) => w.id === draft.id)?.stage_id ?? stage?.id ?? null,
      work_date: draft.work_date,
      kind: draft.kind,
      start_time: timed(draft.kind) ? draft.start_time : "",
      end_time: timed(draft.kind) ? draft.end_time : "",
      end_next_day: timed(draft.kind) && (draft.end_next_day || crosses),
      break_minutes: draft.kind === "work" || draft.kind === "on_site" ? draft.break_minutes : 0,
      callouts: draft.kind === "on_call" ? draft.callouts.filter((c) => c.start && c.end) : [],
      notes: draft.notes.trim(),
      created_at: data.workdays.find((w) => w.id === draft.id)?.created_at ?? new Date().toISOString(),
    };
    if (timed(row.kind) && (!row.start_time || !row.end_time)) {
      toast("Indiquez le début et la fin.", { variant: "error" });
      return;
    }
    commit([putRow("workdays", row)]);
    toast(draft.id ? "Journée mise à jour." : `${kindLabel(row.kind)} du ${formatDateFr(row.work_date)} ajoutée.`, { variant: "success" });
    setMonth(row.work_date.slice(0, 7));
    setDraft(blank(draft.id ? today : row.work_date, row.kind));
  }

  if (editingSettings)
    return (
      <div className="space-y-4">
        <SectionTitle>Réglages de la rémunération</SectionTitle>
        <PaySettingsEditor onClose={() => setEditingSettings(false)} />
      </div>
    );

  return (
    <div className="space-y-5">
      <SectionTitle
        action={
          <Button size="sm" variant="ghost" onClick={() => setEditingSettings(true)}>
            <Settings2 className="h-4 w-4" /> Réglages
          </Button>
        }
      >
        Journées et rémunération
      </SectionTitle>

      <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <DayForm
          draft={draft}
          set={set}
          onSave={save}
          onCancel={draft.id ? () => setDraft(blank()) : undefined}
          onDelete={
            draft.id
              ? () => {
                  if (!confirm("Supprimer cette journée ?")) return;
                  commit([deleteRow("workdays", draft.id!)]);
                  setDraft(blank());
                }
              : undefined
          }
        />
      </section>

      <div className="flex items-center justify-between gap-2">
        <Button size="icon" variant="ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mois précédent">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h3 className="font-serif-display text-lg font-medium capitalize text-foreground">{monthLabel(month)}</h3>
        <Button size="icon" variant="ghost" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mois suivant">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Heures prestées" value={hours(pay.hours.total)} sub={`${pay.workedDays} jour(s) presté(s)`} />
        <Tile label="Heures inconfortables" value={hours(uncomfortable)} sub={`nuit ${hours(pay.hours.night)} · sam. ${hours(pay.hours.saturday)} · dim./fériés ${hours(pay.hours.sundayHoliday)}`} />
        <Tile label="Brut estimé" value={eur(pay.gross)} sub={pay.onCall.day + pay.onCall.nightWeekend ? `dont ${pay.onCall.day + pay.onCall.nightWeekend} forfait(s) de garde` : undefined} />
        <Tile label="Net estimé" value={eur(pay.net)} sub="avec l'indemnité de frais" />
      </div>

      {pay.alerts.length > 0 && (
        <ul className="space-y-1.5" aria-label="Temps de travail">
          {pay.alerts.map((a, i) => (
            <AlertLine key={i} a={a} />
          ))}
        </ul>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">Jours du mois</h3>
        {monthDays.length === 0 ? (
          <EmptyState title="Aucune journée ce mois-ci." />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
            {monthDays.map((w) => {
              const pd = paramsOn(settings, w.work_date);
              const h = workedIntervals(w).worked.reduce((s, i) => s + splitHours(i, pd).total, 0);
              return (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({ id: w.id, work_date: w.work_date, kind: w.kind, start_time: w.start_time, end_time: w.end_time, end_next_day: w.end_next_day, break_minutes: w.break_minutes, callouts: w.callouts ?? [], notes: w.notes });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-muted"
                  >
                    <span className="w-20 shrink-0 text-xs tabular-nums text-foreground-subtle">{new Date(`${w.work_date}T00:00:00Z`).toLocaleDateString("fr-BE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" })}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{kindLabel(w.kind)}</span>
                      {w.start_time && (
                        <span className="block truncate text-xs text-foreground-subtle">
                          {w.start_time}–{w.end_time}
                          {w.end_next_day ? " (+1)" : ""}
                          {w.break_minutes ? ` · pause ${w.break_minutes} min` : ""}
                          {w.callouts?.length ? ` · ${w.callouts.length} rappel(s)` : ""}
                          {w.notes ? ` · ${w.notes}` : ""}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-foreground-muted">{h ? hours(h) : ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {holidays.length > 0 && <p className="text-xs text-foreground-subtle">Fériés du mois : {holidays.map((x) => `${x.label} (${formatDateFr(x.date)})`).join(", ")}.</p>}
      </section>

      <section className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <h3 className="font-serif-display text-base font-medium text-foreground">Détail de la rémunération estimée</h3>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {pay.lines.map((l) => (
              <tr key={l.label}>
                <td className="py-1.5 pr-2">
                  <span className="text-foreground">{l.label}</span>
                  <span className="block text-xs text-foreground-subtle">{l.detail}</span>
                </td>
                <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{eur(l.amount)}</td>
              </tr>
            ))}
            <tr className="font-medium">
              <td className="py-1.5">Brut</td>
              <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{eur(pay.gross)}</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-2">
                Cotisation personnelle ONSS
                <span className="block text-xs text-foreground-subtle">{(p.personalContributionRate * 100).toLocaleString("fr-BE")} % — sui generis : soins de santé et indemnités, pas de pension ni de chômage</span>
              </td>
              <td className="whitespace-nowrap py-1.5 text-right tabular-nums">− {eur(pay.contribution)}</td>
            </tr>
            <tr>
              <td className="py-1.5">Imposable</td>
              <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{eur(pay.taxable)}</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-2">
                Précompte professionnel
                <span className="block text-xs text-foreground-subtle">{p.withholdingMode === "rate" ? `taux de votre fiche (${(p.withholdingRate * 100).toLocaleString("fr-BE")} %)` : "estimé par le barème (isolé, sans charge) — reprenez le taux de votre fiche pour plus de précision"}</span>
              </td>
              <td className="whitespace-nowrap py-1.5 text-right tabular-nums">− {eur(pay.withholding)}</td>
            </tr>
            {pay.special > 0 && (
              <tr>
                <td className="py-1.5">Cotisation spéciale de sécurité sociale</td>
                <td className="whitespace-nowrap py-1.5 text-right tabular-nums">− {eur(pay.special)}</td>
              </tr>
            )}
            <tr>
              <td className="py-1.5 pr-2">
                Indemnité de frais
                <span className="block text-xs text-foreground-subtle">non imposable, due à partir de {p.expenseMinDays} jours prestés</span>
              </td>
              <td className="whitespace-nowrap py-1.5 text-right tabular-nums">+ {eur(pay.expenses)}</td>
            </tr>
            <tr className="font-medium">
              <td className="py-1.5">Net estimé</td>
              <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{eur(pay.net)}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-foreground-subtle">
          Taux horaire de base {eur(pay.hourly)}. Pas de pécule de vacances ni de 13e mois (statut sui generis). Avantage INAMI annuel : {eur(p.inamiSocialAdvantage)}, versé sur un contrat de pension, hors salaire. Estimation à comparer à votre fiche de paie.
        </p>
      </section>

      <section className="space-y-1 rounded-[var(--radius-lg)] border border-border bg-surface p-4 text-sm">
        <h3 className="font-serif-display text-base font-medium text-foreground">Congés</h3>
        <p className="text-xs text-foreground-subtle">
          Du {formatDateFr(balance.from)} au {formatDateFr(balance.to)}
        </p>
        <ul className="grid grid-cols-2 gap-1 text-foreground-muted sm:grid-cols-4">
          <li>
            Congés : <span className="tabular-nums text-foreground">{balance.used.leave}</span> / {p.leaveDays}
          </li>
          <li>
            Fériés : <span className="tabular-nums text-foreground">{balance.used.holiday}</span> / {p.publicHolidays}
          </li>
          <li>
            Scientifiques : <span className="tabular-nums text-foreground">{balance.used.scientific}</span> / {p.scientificDays}
          </li>
          <li>
            Maladie : <span className="tabular-nums text-foreground">{balance.used.sick}</span> j
          </li>
        </ul>
      </section>
    </div>
  );
}
