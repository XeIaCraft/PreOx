"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  BookUser,
  CalendarRange,
  CircleCheck,
  CloudOff,
  FileDown,
  GraduationCap,
  LayoutGrid,
  ListOrdered,
  Loader2,
  Moon,
  PenTool,
  PlusCircle,
  RefreshCw,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { EntryView, CasesView } from "@/components/carnet/cases";
import { DutiesView } from "@/components/carnet/duties";
import { SignaturesView } from "@/components/carnet/signatures";
import { StagesView, StageFormModal } from "@/components/carnet/stages";
import { ProfileView } from "@/components/carnet/profile";
import { SupervisorsView } from "@/components/carnet/supervisors";
import { TrainingView } from "@/components/carnet/training";
import { YearsView } from "@/components/carnet/years";
import { ExportView } from "@/components/carnet/export";
import { localDateIso, pendingSignatureCount, sortStages, stageForDate, stageLabel } from "@/lib/carnet/logic";
import type { CarnetStage } from "@/lib/carnet/types";
import { cn } from "@/lib/utils";

type View = "saisie" | "releve" | "gardes" | "signatures" | "stages" | "profil" | "superviseurs" | "formation" | "annees" | "export" | "plus";

const NAV: { view: View; label: string; icon: typeof PlusCircle; primary?: boolean }[] = [
  { view: "saisie", label: "Saisie", icon: PlusCircle, primary: true },
  { view: "releve", label: "Relevé", icon: ListOrdered, primary: true },
  { view: "gardes", label: "Gardes", icon: Moon, primary: true },
  { view: "signatures", label: "Signatures", icon: PenTool, primary: true },
  { view: "stages", label: "Stages", icon: CalendarRange },
  { view: "profil", label: "Identification", icon: UserRound },
  { view: "superviseurs", label: "Superviseurs", icon: Users },
  { view: "formation", label: "Formation", icon: GraduationCap },
  { view: "annees", label: "Années & rapport", icon: BookUser },
  { view: "export", label: "Export", icon: FileDown },
];

const ACTIVE_STAGE_KEY = "preox:carnet:active-stage";

function readActiveStage(): string | null {
  try {
    return localStorage.getItem(ACTIVE_STAGE_KEY);
  } catch {
    return null;
  }
}

function SyncBadge() {
  const { status, store } = useCarnet();
  const label = !status.online
    ? `Hors ligne${status.pending ? ` · ${status.pending} en attente` : ""}`
    : status.syncing
      ? "Synchronisation…"
      : status.error
        ? status.pending
          ? `${status.pending} en attente`
          : "Non synchronisé"
        : status.pending
          ? `${status.pending} en attente`
          : "À jour";
  const Icon = !status.online ? CloudOff : status.syncing ? Loader2 : status.error ? AlertTriangle : status.pending ? RefreshCw : CircleCheck;
  return (
    <button
      type="button"
      onClick={() => void store.sync()}
      title={status.error ?? (status.lastSyncedAt ? `Dernière synchronisation : ${new Date(status.lastSyncedAt).toLocaleString("fr-BE")}` : "Synchroniser")}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        status.error || !status.online ? "border-accent/40 bg-accent-tint text-accent" : "border-border bg-surface text-foreground-muted hover:text-foreground"
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", status.syncing && "animate-spin")} /> {label}
    </button>
  );
}

function Welcome({ onCreateStage, onProfile }: { onCreateStage: () => void; onProfile: () => void }) {
  return (
    <div className="mx-auto max-w-xl space-y-5 rounded-[var(--radius-lg)] border border-border bg-surface p-6">
      <div>
        <h2 className="font-serif-display text-2xl font-medium text-foreground">Votre carnet de stage</h2>
        <p className="mt-2 text-sm text-foreground-muted">
          Loguez vos cas en quelques secondes entre deux patients, même sans réseau. Faites signer vos superviseurs par lot en fin de journée, puis
          exportez le carnet officiel prêt à envoyer à la Commission d&apos;agrément.
        </p>
      </div>
      <ol className="space-y-3 text-sm">
        <li className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">1</span>
          <span className="flex-1">
            Créez votre stage en cours (lieu, secteur, année de formation, maître de stage).
            <Button className="mt-2" onClick={onCreateStage}>
              <PlusCircle className="h-4 w-4" /> Créer mon stage
            </Button>
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-foreground">2</span>
          <span className="flex-1">
            Complétez votre identification quand vous avez un moment.{" "}
            <button type="button" onClick={onProfile} className="text-primary-strong underline-offset-4 hover:underline">
              Identification
            </button>
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-foreground">3</span>
          <span className="flex-1">Vos superviseurs se créent au fil de la saisie, en tapant leur nom.</span>
        </li>
      </ol>
    </div>
  );
}

/**
 * The whole module as one client-side app over the local-first store: the
 * current screen lives in `?v=` and changes through history.pushState (which
 * Next's useSearchParams follows), so switching screens is instant and never
 * waits on the server. The "active stage" (hospital + default tutors of
 * every new case) is chosen once and remembered on the device.
 */
export function CarnetApp() {
  const { data, status, store } = useCarnet();
  const { toast } = useToast();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = (searchParams.get("v") as View | null) ?? "saisie";
  const [activeStageId, setActiveStageId] = useState<string | null>(readActiveStage);
  const [creatingStage, setCreatingStage] = useState(false);

  const activeStage: CarnetStage | null = data.stages.find((s) => s.id === activeStageId) ?? stageForDate(data.stages, localDateIso());
  const pending = pendingSignatureCount(data);

  function go(next: View) {
    window.history.pushState(null, "", next === "saisie" ? pathname : `${pathname}?v=${next}`);
    window.scrollTo(0, 0);
  }

  function activate(id: string) {
    setActiveStageId(id);
    try {
      localStorage.setItem(ACTIVE_STAGE_KEY, id);
    } catch {
      // Remembered for this session only.
    }
  }

  if (!status.ready) {
    return (
      <div className="space-y-3" aria-hidden="true">
        <div className="h-8 w-56 animate-pulse rounded-[var(--radius-md)] bg-surface-muted" />
        <div className="h-96 animate-pulse rounded-[var(--radius-lg)] bg-surface-muted" />
      </div>
    );
  }

  const needsStage = (view === "saisie" || view === "gardes") && !activeStage;

  let content: React.ReactNode;
  if (needsStage) content = <Welcome onCreateStage={() => setCreatingStage(true)} onProfile={() => go("profil")} />;
  else if (view === "saisie" && activeStage) content = <EntryView stage={activeStage} />;
  else if (view === "releve") content = <CasesView stage={activeStage} />;
  else if (view === "gardes" && activeStage) content = <DutiesView stage={activeStage} />;
  else if (view === "signatures") content = <SignaturesView />;
  else if (view === "stages")
    content = (
      <StagesView
        activeStageId={activeStage?.id ?? null}
        onActivate={activate}
        onDownloadGrid={async (stage) => {
          try {
            const { downloadEvaluationGrid } = await import("@/lib/carnet/pdf");
            await downloadEvaluationGrid(data, stage);
          } catch (err) {
            console.error(err);
            toast("La génération du PDF a échoué.", { variant: "error" });
          }
        }}
      />
    );
  else if (view === "profil") content = <ProfileView key={data.profile ? "loaded" : "empty"} />;
  else if (view === "superviseurs") content = <SupervisorsView />;
  else if (view === "formation") content = <TrainingView />;
  else if (view === "annees") content = <YearsView />;
  else if (view === "export") content = <ExportView />;
  else
    content = (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {NAV.filter((n) => !n.primary).map((n) => (
          <button
            key={n.view}
            type="button"
            onClick={() => go(n.view)}
            className="flex min-h-24 flex-col items-start justify-between rounded-[var(--radius-lg)] border border-border bg-surface p-4 text-left hover:bg-surface-muted"
          >
            <n.icon className="h-5 w-5 text-primary-strong" />
            <span className="text-sm font-medium text-foreground">{n.label}</span>
          </button>
        ))}
      </div>
    );

  return (
    <div className="pb-24 sm:pb-0">
      <header className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif-display text-3xl font-medium text-foreground">Carnet de stage</h1>
          <SyncBadge />
        </div>
        {data.stages.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-foreground-subtle">Stage actif</span>
            <Select value={activeStage?.id ?? ""} onChange={(e) => activate(e.target.value)} className="h-9 max-w-md" aria-label="Stage actif">
              {sortStages(data.stages).map((s) => (
                <option key={s.id} value={s.id}>
                  {stageLabel(s)}
                </option>
              ))}
            </Select>
          </div>
        )}
        <nav className="hidden flex-wrap gap-1 border-b border-border sm:flex" aria-label="Sections du carnet">
          {NAV.map((n) => (
            <button
              key={n.view}
              type="button"
              onClick={() => go(n.view)}
              aria-current={view === n.view ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
                view === n.view ? "border-primary font-medium text-foreground" : "border-transparent text-foreground-muted hover:text-foreground"
              )}
            >
              <n.icon className="h-4 w-4" /> {n.label}
              {n.view === "signatures" && pending > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground">{pending}</span>}
            </button>
          ))}
        </nav>
      </header>

      {status.rejected.length > 0 && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">
          <p>
            {status.rejected.length > 1 ? `${status.rejected.length} modifications ont été refusées` : "Une modification a été refusée"} par le serveur et annulée :{" "}
            {status.rejected.slice(-3).join(" · ")}
          </p>
          <button type="button" onClick={() => store.dismissRejected()} aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {content}

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden" aria-label="Navigation">
        {[...NAV.filter((n) => n.primary), { view: "plus" as View, label: "Plus", icon: LayoutGrid }].map((n) => {
          const selected = view === n.view || (n.view === "plus" && !NAV.find((x) => x.view === view)?.primary && view !== "saisie");
          return (
            <button
              key={n.view}
              type="button"
              onClick={() => go(n.view)}
              className={cn("relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]", selected ? "text-primary-strong" : "text-foreground-muted")}
            >
              <n.icon className="h-5 w-5" />
              {n.label}
              {n.view === "signatures" && pending > 0 && (
                <span className="absolute right-3 top-1.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground">{pending}</span>
              )}
            </button>
          );
        })}
      </nav>

      {creatingStage && <StageFormModal onClose={() => setCreatingStage(false)} onSaved={(s) => activate(s.id)} />}
    </div>
  );
}
