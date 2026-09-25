"use client";

import { useMemo, useState } from "react";
import { CircleAlert, ClipboardCopy, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChipGroup } from "@/components/carnet/ui";
import { useToast } from "@/components/ui/toast";
import { FieldLabel, Panel, TextArea } from "@/components/preop/ui";
import { evaluateConsultation } from "@/components/preop/consultation";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { buildIsbar, isbarText, suggestedCallCriteria } from "@/lib/preop/isbar";
import type { Dossier, Transmission } from "@/lib/preop/dossier";
import type { Rule } from "@/lib/preop/rules/types";

const DESTINATIONS = [
  { code: "uspa" as const, label: "Salle de réveil" },
  { code: "usi" as const, label: "Soins intensifs" },
  { code: "ward" as const, label: "Étage" },
];

// Same font as the carnet exports (already cached by the service worker).
const FONT_URL = "/carnet/carlito.ttf";

let fontPromise: Promise<ArrayBuffer> | null = null;
function loadFont(): Promise<ArrayBuffer> {
  if (!fontPromise)
    fontPromise = fetch(FONT_URL)
      .then((r) => {
        if (!r.ok) throw new Error("Police indisponible.");
        return r.arrayBuffer();
      })
      .catch((err) => {
        fontPromise = null;
        throw err;
      });
  return fontPromise;
}

export function HandoverView({ d, onChange, rules }: { d: Dossier; onChange: (d: Dossier) => void; rules: Rule[] }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const t = d.transmission;
  const set = (patch: Partial<Transmission>) => onChange({ ...d, transmission: { ...t, ...patch } });
  const { catalogs } = useCatalogs();
  const evaluation = useMemo(() => evaluateConsultation(rules, { ...d.consultation, techniques: d.plan.techniques.length ? d.plan.techniques : d.consultation.techniques }, catalogs), [rules, d.consultation, d.plan.techniques, catalogs]);
  // Recomputed at each render: the durations run until « Sortie de salle ».
  const now = new Date().toISOString();
  const sections = buildIsbar(d, now, evaluation, catalogs);
  const missing = sections.reduce((n, s) => n + s.missing.length, 0);
  const text = isbarText(d, sections);

  async function pdfBlob(): Promise<Blob> {
    const { buildIsbarPdf } = await import("@/lib/preop/isbar-pdf");
    const bytes = await buildIsbarPdf(d, sections, await loadFont());
    return new Blob([bytes as BlobPart], { type: "application/pdf" });
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
      <Panel title="À compléter">
        <div className="space-y-1.5">
          <FieldLabel>Destination</FieldLabel>
          <ChipGroup size="sm" options={DESTINATIONS} value={t.destination || null} onChange={(v) => set({ destination: v ?? "" })} allowClear />
        </div>
        <TextArea label="Prescriptions post-opératoires" rows={4} value={t.prescriptions} onChange={(prescriptions) => set({ prescriptions })} placeholder={"Analgésie : …\nNVPO : …\nThromboprophylaxie : …\nSurveillance : …"} />
        <div className="space-y-1">
          <TextArea label="Critères d'appel" value={t.callCriteria} onChange={(callCriteria) => set({ callCriteria })} placeholder="ex. PAS < 90, SpO₂ < 92 %, saignement du redon > 200 mL/h" />
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            title="Critères de la salle de réveil et du service (Manuel pratique d'anesthésie 2020, chap. 24), à adapter"
            onClick={() => {
              const lines = suggestedCallCriteria(d).filter((l) => !t.callCriteria.includes(l));
              if (lines.length) set({ callCriteria: [t.callCriteria.trim(), ...lines].filter(Boolean).join("\n") });
            }}
          >
            Proposer des critères (manuel, chap. 24)
          </button>
        </div>
        <label className="block space-y-1">
          <FieldLabel>Contact</FieldLabel>
          <Input defaultValue={t.contact} onChange={(e) => set({ contact: e.target.value })} placeholder="ex. anesthésiste de garde, bip 1234" />
        </label>
        <TextArea label="Autres informations" value={t.notes} onChange={(notes) => set({ notes })} />
      </Panel>

      <Panel
        title="ISBAR"
        actions={
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  toast("Transmission copiée.", { variant: "success" });
                } catch {
                  toast("Copie impossible sur ce navigateur.", { variant: "error" });
                }
              }}
            >
              <ClipboardCopy className="h-3.5 w-3.5" /> Copier
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const blob = await pdfBlob();
                  const file = new File([blob], `transmission-${d.initials}.pdf`, { type: "application/pdf" });
                  // On a phone: the share sheet (AirDrop, mail…); elsewhere a download.
                  if (navigator.canShare?.({ files: [file] })) {
                    await navigator.share({ files: [file], title: `Transmission ${d.initials}` }).catch(() => undefined);
                  } else {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = file.name;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }
                } catch (err) {
                  toast(err instanceof Error ? err.message : "PDF impossible.", { variant: "error" });
                } finally {
                  setBusy(false);
                }
              }}
            >
              <FileDown className="h-3.5 w-3.5" /> PDF
            </Button>
          </>
        }
      >
        {missing > 0 && (
          <p className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-accent-tint px-3 py-2 text-xs text-accent">
            <CircleAlert className="h-3.5 w-3.5 shrink-0" /> {missing} élément(s) non renseigné(s), listés sous chaque section.
          </p>
        )}
        <ol className="space-y-3">
          {sections.map((s) => (
            <li key={s.key} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-primary font-mono text-sm font-bold text-primary-foreground">{s.key}</span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium text-foreground">{s.title}</p>
                <ul className="space-y-0.5 text-sm text-foreground-muted">
                  {s.lines.filter(Boolean).map((l, i) => (
                    <li key={i} className="break-words">
                      {l}
                    </li>
                  ))}
                </ul>
                {s.missing.length > 0 && <p className="text-xs text-accent">Manque : {s.missing.join(", ")}</p>}
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
