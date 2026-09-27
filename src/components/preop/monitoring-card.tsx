"use client";

import { MONITORING_GROUPS, type MonitoringItem } from "@/lib/preop/monitoring";

/** One monitoring: its values (normal, target), what it is for, how it works, its traps and formulas. */
export function MonitoringCard({ m, open = false }: { m: MonitoringItem; open?: boolean }) {
  return (
    <details className="rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm" open={open}>
      <summary className="cursor-pointer font-medium text-foreground">
        {m.label} <span className="text-xs font-normal text-foreground-subtle">· {MONITORING_GROUPS.find((g) => g.code === m.group)?.label}</span>
      </summary>
      <div className="mt-2 space-y-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] text-xs">
            <thead>
              <tr className="text-left text-foreground-subtle">
                <th className="py-0.5 pr-2 font-medium">Valeur</th>
                <th className="py-0.5 pr-2 font-medium">Normale</th>
                <th className="py-0.5 font-medium">Cible / seuil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {m.values.map((v) => (
                <tr key={v.label}>
                  <td className="py-1 pr-2 font-medium text-foreground">{v.label}</td>
                  <td className="py-1 pr-2 tabular-nums text-foreground-muted">{v.normal}</td>
                  <td className="py-1 tabular-nums text-primary-strong">{v.target ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-foreground-muted">
          <span className="font-medium text-foreground">À quoi ça sert : </span>
          {m.what}
        </p>
        <p className="text-xs text-foreground-muted">
          <span className="font-medium text-foreground">Comment ça marche : </span>
          {m.how}
        </p>
        {m.pitfalls && (
          <p className="text-xs text-foreground-muted">
            <span className="font-medium text-accent">Pièges : </span>
            {m.pitfalls}
          </p>
        )}
        {m.formulas && m.formulas.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4 font-mono text-[11px] text-foreground-muted">
            {m.formulas.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        {m.source && <p className="text-[11px] text-foreground-subtle">Source : {m.source}</p>}
      </div>
    </details>
  );
}
