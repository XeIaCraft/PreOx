"use client";

import { useMemo, useState } from "react";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { ChipGroup, EmptyState, SectionTitle } from "@/components/carnet/ui";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DRUG_CLASSES } from "@/lib/carnet/pharmaco";
import { filterCases, usageStats, type Count } from "@/lib/carnet/stats";
import { localDateIso, shiftDateIso, stageLabel } from "@/lib/carnet/logic";

type Period = "30" | "90" | "365" | "all" | "custom";

const PERIODS: { code: Period; label: string }[] = [
  { code: "30", label: "30 jours" },
  { code: "90", label: "3 mois" },
  { code: "365", label: "12 mois" },
  { code: "all", label: "Tout" },
  { code: "custom", label: "Dates" },
];

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)} %` : "—");

/** One ranked list as thin horizontal bars: label, bar scaled to the largest, count and share in text ink. */
function Bars({ items, of, limit = 12 }: { items: Count[]; of: number; limit?: number }) {
  const [all, setAll] = useState(false);
  const max = Math.max(1, ...items.map((i) => i.count));
  const shown = all ? items : items.slice(0, limit);
  return (
    <div className="space-y-1">
      <ul className="space-y-1.5">
        {shown.map((i) => (
          <li key={i.code} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-2 text-sm sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]" title={`${i.label} : ${i.count} cas (${pct(i.count, of)})`}>
            <span className="truncate text-foreground">{i.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${(i.count / max) * 100}%` }} />
            </span>
            <span className="min-w-16 text-right tabular-nums text-xs text-foreground-muted">
              {i.count} <span className="text-foreground-subtle">· {pct(i.count, of)}</span>
            </span>
          </li>
        ))}
      </ul>
      {items.length > limit && (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-xs font-medium text-primary-strong hover:underline">
          {all ? "Moins" : `Voir les ${items.length}`}
        </button>
      )}
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div>
        <h3 className="font-serif-display text-base font-medium text-foreground">{title}</h3>
        {hint && <p className="text-xs text-foreground-subtle">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">{label}</p>
      <p className="mt-1 font-serif-display text-2xl tabular-nums text-foreground">{value}</p>
      {sub && <p className="text-xs text-foreground-muted">{sub}</p>}
    </div>
  );
}

/** « Ce que j'utilise » : drugs, procedures and equipment, techniques — over a period, from the cases' details. */
export function StatsView() {
  const { data, offRecordCases } = useCarnet();
  const today = localDateIso();
  const [period, setPeriod] = useState<Period>("365");
  const [from, setFrom] = useState(shiftDateIso(today, -30));
  const [to, setTo] = useState(today);
  const [stageId, setStageId] = useState("");
  const [withOffRecord, setWithOffRecord] = useState(false);
  const [klass, setKlass] = useState("");

  const filter = period === "custom" ? { from, to } : period === "all" ? {} : { from: shiftDateIso(today, -Number(period)) };
  const base = withOffRecord ? [...data.cases, ...offRecordCases] : data.cases;
  const cases = useMemo(() => filterCases(base, { ...filter, stageId: stageId || undefined }), [base, filter.from, filter.to, stageId]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = useMemo(() => usageStats(cases), [cases]);
  const drugs = klass ? s.drugs.filter((d) => (d.klass ?? "autre") === klass) : s.drugs;

  return (
    <div className="space-y-4">
      <SectionTitle>Ce que j&apos;utilise</SectionTitle>
      <div className="space-y-2">
        <ChipGroup size="sm" options={PERIODS} value={period} onChange={(v) => v && setPeriod(v)} />
        {period === "custom" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-auto" aria-label="Du" />
            <span className="text-foreground-subtle">au</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-auto" aria-label="Au" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={stageId} onChange={(e) => setStageId(e.target.value)} className="h-9 max-w-xs" aria-label="Stage">
            <option value="">Tous les stages</option>
            {data.stages.map((st) => (
              <option key={st.id} value={st.id}>
                {stageLabel(st)}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-xs text-foreground-muted">
            <Switch checked={withOffRecord} onCheckedChange={setWithOffRecord} aria-label="Inclure les cas hors carnet" />
            Inclure les cas hors carnet ({offRecordCases.length})
          </label>
        </div>
      </div>

      {s.cases === 0 ? (
        <EmptyState title="Aucun cas sur cette période." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Cas" value={s.cases} sub={withOffRecord ? "carnet + hors carnet" : "du carnet"} />
            <Tile label="Avec détails" value={s.detailed} sub={`${pct(s.detailed, s.cases)} des cas`} />
            <Tile label="Produits différents" value={s.drugs.length} />
            <Tile label="Enfants < 4 ans" value={s.pediatricUnder4} sub={pct(s.pediatricUnder4, s.cases)} />
          </div>
          {s.detailed < s.cases && (
            <p className="text-xs text-foreground-subtle">
              Produits et matériel viennent du détail facultatif des cas ({s.detailed} sur {s.cases}) : les pourcentages de ces sections portent sur ces {s.detailed} cas.
            </p>
          )}

          <Block title="Produits" hint="Nombre de cas où le produit a été donné ; les voies utilisées en dessous.">
            <Select value={klass} onChange={(e) => setKlass(e.target.value)} className="h-9 max-w-xs" aria-label="Classe">
              <option value="">Toutes les classes</option>
              {DRUG_CLASSES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
            {drugs.length === 0 ? (
              <p className="text-sm text-foreground-subtle">Aucun produit noté.</p>
            ) : (
              <>
                <Bars items={drugs.map((d) => ({ code: d.name, label: d.name, count: d.cases }))} of={s.detailed} />
                <details className="text-xs">
                  <summary className="cursor-pointer text-primary-strong">Voies par produit</summary>
                  <ul className="mt-1.5 space-y-0.5 text-foreground-muted">
                    {drugs.slice(0, 40).map((d) => (
                      <li key={d.name}>
                        <span className="text-foreground">{d.name}</span> : {d.routes.map((r) => `${r.label} ${r.count}`).join(" · ")}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </Block>

          {s.drugClasses.length > 0 && (
            <Block title="Classes de produits">
              <Bars items={s.drugClasses} of={s.detailed} />
            </Block>
          )}

          <Block title="Procédures et matériel" hint="Induction, voies aériennes, abords, monitorage… cochés dans le détail des cas.">
            {s.procedures.length === 0 ? (
              <p className="text-sm text-foreground-subtle">Aucune procédure notée.</p>
            ) : (
              <div className="space-y-3">
                {s.procedures.map((g) => (
                  <div key={g.code} className="space-y-1">
                    <p className="text-xs font-medium text-foreground-subtle">{g.label}</p>
                    <Bars items={g.items} of={s.detailed} limit={8} />
                  </div>
                ))}
              </div>
            )}
          </Block>

          <div className="grid gap-4 lg:grid-cols-2">
            <Block title="Techniques">
              <Bars items={s.techniques} of={s.cases} />
            </Block>
            <Block title="Catégories chirurgicales">
              <Bars items={s.categories} of={s.cases} />
            </Block>
            {s.regional.length > 0 && (
              <Block title="ALR">
                <Bars items={s.regional} of={s.cases} />
              </Block>
            )}
            {s.acts.length > 0 && (
              <Block title="Actes techniques">
                <Bars items={s.acts} of={s.cases} />
              </Block>
            )}
          </div>
        </>
      )}
    </div>
  );
}
