"use client";

import { useState } from "react";
import { Database, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { ChipGroup, SectionTitle } from "@/components/carnet/ui";
import { pendingSignatureCount } from "@/lib/carnet/logic";
import { localDateIso } from "@/lib/carnet/logic";

/** Final export: the official carnet as a PDF (per training year, or the whole training), plus a raw backup of everything. */
export function ExportView() {
  const { data } = useCarnet();
  const { toast } = useToast();
  const years = [...new Set(data.stages.map((s) => s.training_year))].sort((a, b) => a - b);
  const [year, setYear] = useState<number | "all">(years.at(-1) ?? "all");
  const [busy, setBusy] = useState(false);
  const yearStageIds = new Set(data.stages.filter((s) => year === "all" || s.training_year === year).map((s) => s.id));
  const pending = pendingSignatureCount({
    cases: data.cases.filter((c) => yearStageIds.has(c.stage_id)),
    duties: data.duties.filter((d) => yearStageIds.has(d.stage_id)),
  });

  async function exportPdf() {
    setBusy(true);
    try {
      const { downloadCarnet } = await import("@/lib/carnet/pdf");
      await downloadCarnet(data, year);
    } catch (err) {
      console.error(err);
      toast("La génération du PDF a échoué.", { variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `carnet-de-stage-sauvegarde-${localDateIso()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <SectionTitle>Export</SectionTitle>
      <section className="space-y-4 rounded-[var(--radius-lg)] border border-border bg-surface p-4 sm:p-5">
        <div>
          <p className="font-medium text-foreground">Carnet de stage officiel (PDF)</p>
          <p className="mt-1 text-sm text-foreground-muted">
            Toutes les sections du carnet, dans l&apos;ordre du formulaire : identification, grilles d&apos;évaluation (en-tête rempli, à compléter par le
            maître de stage), activités connexes, cours, séminaires, publications, relevé des prestations avec les signatures, journal de gardes,
            rapport d&apos;activité, évaluations personnelles et absences.
          </p>
        </div>
        <ChipGroup
          size="sm"
          options={[...years.map((y) => ({ code: y as number | "all", label: `Année ${y}` })), { code: "all", label: "Toute la formation" }]}
          value={year}
          onChange={(v) => v !== null && setYear(v)}
        />
        {pending > 0 && (
          <p className="rounded-[var(--radius-md)] bg-accent-tint px-3 py-2 text-sm text-accent">
            {pending} prestation{pending > 1 ? "s" : ""} de cette période {pending > 1 ? "ne sont" : "n'est"} pas encore signée{pending > 1 ? "s" : ""} — elle
            {pending > 1 ? "s" : ""} apparaîtr{pending > 1 ? "ont" : "a"} sans signature.
          </p>
        )}
        <Button onClick={exportPdf} disabled={busy || data.stages.length === 0} size="lg">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Télécharger le carnet
        </Button>
      </section>
      <section className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4 sm:p-5">
        <p className="font-medium text-foreground">Sauvegarde des données</p>
        <p className="text-sm text-foreground-muted">Toutes vos données au format JSON, signatures comprises — à garder de côté.</p>
        <Button variant="secondary" onClick={exportJson}>
          <Database className="h-4 w-4" /> Télécharger la sauvegarde
        </Button>
      </section>
    </div>
  );
}
