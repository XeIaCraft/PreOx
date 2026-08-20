"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ActivityEntryView {
  id: string;
  actorLabel: string;
  actionLabel: string;
  targetLabel: string | null;
  createdAt: string;
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function ActivityLogList({ entries }: { entries: ActivityEntryView[] }) {
  function handleExport() {
    const header = ["Date", "Acteur", "Action", "Cible"];
    const rows = entries.map((e) => [new Date(e.createdAt).toLocaleString("fr-FR"), e.actorLabel, e.actionLabel, e.targetLabel ?? ""]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "journal-activite.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div>
      <div className="flex justify-end px-5 pt-4">
        <Button variant="secondary" size="sm" onClick={handleExport} disabled={entries.length === 0}>
          <Download className="h-4 w-4" />
          Exporter en CSV
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-foreground-subtle">Aucune activité pour ces filtres.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.id} className="px-5 py-[var(--row-py)] text-sm">
              <span className="font-medium text-foreground">{entry.actorLabel}</span>{" "}
              <span className="text-foreground-muted">{entry.actionLabel}</span>{" "}
              {entry.targetLabel && <span className="font-medium text-foreground">{entry.targetLabel}</span>}
              <span className="ml-2 text-xs text-foreground-subtle">{new Date(entry.createdAt).toLocaleString("fr-FR")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
