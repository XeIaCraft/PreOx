"use client";

import { ArrowLeft, ClipboardList, HeartPulse, MessagesSquare, Stethoscope, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { ConsultationForm } from "@/components/preop/consultation";
import { PreparationView } from "@/components/preop/preparation";
import { TheatreView } from "@/components/preop/theatre";
import { HandoverView } from "@/components/preop/handover";
import { STATUS_LABELS } from "@/components/preop/dossiers";
import type { ProtocolInput } from "@/components/preop/use-protocols";
import type { Dossier, DossierStatus } from "@/lib/preop/dossier";
import type { Protocol } from "@/lib/preop/protocols";
import type { QuestionInput } from "@/lib/preop/rules/question";
import type { Rule } from "@/lib/preop/rules/types";
import { cn } from "@/lib/utils";

export type DossierTab = "consultation" | "preparation" | "bloc" | "transmission";

export const DOSSIER_TABS: { tab: DossierTab; label: string; icon: typeof Stethoscope }[] = [
  { tab: "consultation", label: "Consultation", icon: Stethoscope },
  { tab: "preparation", label: "Préparation", icon: ClipboardList },
  { tab: "bloc", label: "Bloc", icon: HeartPulse },
  { tab: "transmission", label: "Transmission", icon: MessagesSquare },
];

export function DossierView({
  d,
  tab,
  onTab,
  onBack,
  onChange,
  onRemove,
  rules,
  protocols,
  onSaveProtocol,
  onAskQuestion,
  carnetEnabled,
}: {
  d: Dossier;
  tab: DossierTab;
  onTab: (t: DossierTab) => void;
  onBack: () => void;
  onChange: (d: Dossier) => void;
  onRemove: () => void;
  rules: Rule[];
  protocols: Protocol[];
  onSaveProtocol: (p: ProtocolInput) => Promise<Protocol>;
  onAskQuestion: (q: QuestionInput) => void;
  carnetEnabled: boolean;
}) {
  const when = d.consultation.plannedAt ? new Date(d.consultation.plannedAt).toLocaleString("fr-BE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "date à fixer";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Dossiers
        </Button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-tint font-mono text-sm font-semibold text-primary-strong">{d.initials}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{d.consultation.surgery.name || "Intervention à préciser"}</p>
          <p className="truncate text-xs text-foreground-subtle">{when}</p>
        </div>
        <Select value={d.status} onChange={(e) => onChange({ ...d, status: e.target.value as DossierStatus })} className="h-8 w-auto px-2 text-xs" aria-label="Statut du dossier">
          {(Object.keys(STATUS_LABELS) as DossierStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Supprimer le dossier"
          onClick={() => {
            if (confirm(`Supprimer le dossier ${d.initials} de cet appareil ? (Le cas planifié au carnet, s'il existe, n'est pas touché.)`)) onRemove();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <nav className="grid grid-cols-4 border-b border-border sm:flex sm:gap-1" aria-label="Étapes du dossier">
        {DOSSIER_TABS.map((t) => (
          <button
            key={t.tab}
            type="button"
            onClick={() => onTab(t.tab)}
            aria-current={tab === t.tab ? "page" : undefined}
            className={cn(
              "-mb-px flex min-w-0 flex-col items-center gap-0.5 border-b-2 px-1 py-1.5 text-[11px] font-medium transition-colors sm:flex-row sm:gap-1.5 sm:px-3 sm:py-2 sm:text-sm",
              tab === t.tab ? "border-primary text-primary-strong" : "border-transparent text-foreground-muted hover:text-foreground"
            )}
          >
            <t.icon className="h-4 w-4 shrink-0" />
            <span className="max-w-full truncate">{t.label}</span>
          </button>
        ))}
      </nav>

      {tab === "consultation" && (
        <ConsultationForm value={d.consultation} onChange={(consultation) => onChange({ ...d, consultation })} rules={rules} onAskQuestion={onAskQuestion} formKey={d.id} />
      )}
      {tab === "preparation" && <PreparationView d={d} onChange={onChange} rules={rules} protocols={protocols} onSaveProtocol={onSaveProtocol} carnetEnabled={carnetEnabled} />}
      {tab === "bloc" && <TheatreView d={d} onChange={onChange} carnetEnabled={carnetEnabled} />}
      {tab === "transmission" && <HandoverView d={d} onChange={onChange} rules={rules} />}
    </div>
  );
}
