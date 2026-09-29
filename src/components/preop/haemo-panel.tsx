"use client";

import { Disclosure } from "@/components/preop/ui";
import { HAEMO_SOURCES, haemoProfile, type HaemoInput, type HaemoRow } from "@/lib/preop/haemo-profile";
import type { Dossier } from "@/lib/preop/dossier";

const CARDIAC = ["coronary", "stable_angina", "recent_mi", "coronary_stent", "cabg", "heart_failure"];

export function haemoInputOf(d: Dossier): HaemoInput {
  const p = d.consultation.patient;
  return { age: p.age, sex: p.sex, weightKg: p.weightKg, heightCm: p.heightCm, hb: p.hb, sbp: p.sbp, dbp: p.dbp, hr: p.hr, cardiac: CARDIAC.some((id) => d.consultation.conditions[id]?.present) || d.consultation.surgery.category === "F" };
}

function Rows({ title, rows }: { title: string; rows: HaemoRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">{title}</p>
      <dl className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
        {rows.map((x) => (
          <div key={x.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-1.5">
            <dt className="text-sm text-foreground">{x.label}</dt>
            <dd className="font-mono text-sm font-medium tabular-nums text-foreground">{x.value}</dd>
            {x.detail && <p className="w-full text-xs text-foreground-muted">{x.detail}</p>}
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Blood volume, tolerated losses, expected cardiac output and pressure targets for this patient. */
export function HaemoProfilePanel({ d, compact }: { d: Dossier; compact?: boolean }) {
  const h = haemoProfile(haemoInputOf(d));
  const main = (
    <>
      <Rows title="Volumes" rows={h.volumes} />
      <Rows title="Saignement" rows={h.bleeding} />
    </>
  );
  const more = (
    <>
      <Rows title="Pression, débit, oxygène" rows={h.pump} />
      <Rows title="Liquides" rows={h.fluids} />
      <Rows title="Gabarit" rows={h.body} />
      <ul className="list-disc space-y-0.5 pl-4 text-xs text-foreground-subtle">
        {HAEMO_SOURCES.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </>
  );
  return (
    <div className="space-y-3">
      {h.missing.length > 0 && <p className="text-xs text-accent">À compléter en consultation pour tout calculer : {h.missing.join(", ")}.</p>}
      {main}
      {compact ? (
        <Disclosure summary="Pression, débit, oxygène, liquides, gabarit" summaryClassName="cursor-pointer text-sm font-medium text-primary-strong">
          <div className="space-y-3 pt-2">{more}</div>
        </Disclosure>
      ) : (
        more
      )}
      <p className="text-xs text-foreground-subtle">Ordres de grandeur calculés pour ce patient, à confronter aux mesures (monitorage, gaz du sang, Hb au lit).</p>
    </div>
  );
}
