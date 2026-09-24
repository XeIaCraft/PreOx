"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BookMarked, FolderOpen, Loader2, NotebookTabs, Stethoscope } from "lucide-react";
import { ConsultationView } from "@/components/preop/consultation";
import { DossierList } from "@/components/preop/dossiers";
import { DOSSIER_TABS, DossierView, type DossierTab } from "@/components/preop/dossier-view";
import { ProtocolLibrary } from "@/components/preop/protocol-library";
import { RuleLibrary } from "@/components/preop/rule-library";
import { RuleWizard } from "@/components/preop/rule-wizard";
import { usePreopSession } from "@/components/preop/session";
import { useDossiers } from "@/components/preop/use-dossiers";
import { useProtocols } from "@/components/preop/use-protocols";
import { useRules } from "@/components/preop/use-rules";
import { useToast } from "@/components/ui/toast";
import { emptyDossier } from "@/lib/preop/dossier";
import type { QuestionInput } from "@/lib/preop/rules/question";
import { cn } from "@/lib/utils";

type View = "consultation" | "dossiers" | "dossier" | "protocoles" | "regles" | "nouvelle";

const TABS: { view: View; label: string; icon: typeof Stethoscope }[] = [
  { view: "consultation", label: "Consultation", icon: Stethoscope },
  { view: "dossiers", label: "Dossiers", icon: FolderOpen },
  { view: "protocoles", label: "Protocoles", icon: NotebookTabs },
  { view: "regles", label: "Règles", icon: BookMarked },
];

const VIEWS: View[] = ["consultation", "dossiers", "dossier", "protocoles", "regles", "nouvelle"];

/**
 * The "Préop" module, one client-side app: the consultation (kept only if
 * asked), patient dossiers (encrypted on this device: consultation →
 * préparation → bloc → transmission), the protocol and rule libraries.
 * The current screen lives in the URL (?v=, &id=, &t=) so the browser's
 * back button works; switching never reloads.
 */
export function PreopApp() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { userId, carnetEnabled } = usePreopSession();
  const { toast } = useToast();
  const fromUrl = searchParams.get("v") as View | null;
  const view: View = fromUrl && VIEWS.includes(fromUrl) ? fromUrl : "consultation";
  const dossierId = searchParams.get("id");
  const tabParam = searchParams.get("t") as DossierTab | null;
  const dossierTab: DossierTab = tabParam && DOSSIER_TABS.some((t) => t.tab === tabParam) ? tabParam : "consultation";

  const { rules, loading, error, save, remove } = useRules();
  const protocolLib = useProtocols();
  const dossierStore = useDossiers(userId);
  const [pendingQuestion, setPendingQuestion] = useState<QuestionInput | null>(null);
  const [wizardKey, setWizardKey] = useState(0);

  function go(next: View, params: Record<string, string> = {}) {
    const q = new URLSearchParams(next === "consultation" ? {} : { v: next, ...params });
    const qs = q.toString();
    window.history.pushState(null, "", qs ? `${pathname}?${qs}` : pathname);
    window.scrollTo(0, 0);
  }
  const openDossier = (id: string, tab: DossierTab = "consultation") => go("dossier", tab === "consultation" ? { id } : { id, t: tab });
  const askQuestion = (q: QuestionInput) => {
    setPendingQuestion(q);
    setWizardKey((k) => k + 1);
    go("nouvelle");
  };

  const dossier = view === "dossier" ? dossierStore.dossiers.find((d) => d.id === dossierId) : undefined;
  const activeTab: View = view === "dossier" ? "dossiers" : view === "nouvelle" ? "regles" : view;

  return (
    <div className="min-w-0 space-y-5 [&_.grid>*]:min-w-0">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif-display text-3xl font-medium text-foreground">Préop</h1>
          <span className="flex items-center gap-1.5 text-xs text-foreground-subtle">
            {(loading || protocolLib.loading) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {error ? <span className="text-danger">{error}</span> : `${rules.filter((r) => r.status === "active").length} règle(s) · ${protocolLib.protocols.length} protocole(s)`}
          </span>
        </div>
        <nav className="grid grid-cols-4 gap-1 sm:flex" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.view}
              type="button"
              onClick={() => go(t.view)}
              aria-current={activeTab === t.view ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center gap-0.5 rounded-[var(--radius-md)] px-1 py-1.5 text-[11px] font-medium transition-colors sm:flex-row sm:gap-1.5 sm:px-3 sm:py-2 sm:text-sm",
                activeTab === t.view ? "bg-primary text-primary-foreground" : "text-foreground-muted hover:bg-surface-muted"
              )}
            >
              <t.icon className="h-4 w-4 shrink-0" />
              <span className="max-w-full truncate">
                {t.label}
                {t.view === "dossiers" && dossierStore.dossiers.length > 0 && <span className="ml-1 tabular-nums opacity-80">({dossierStore.dossiers.length})</span>}
              </span>
            </button>
          ))}
        </nav>
      </header>
      {dossierStore.error && <p className="text-sm text-danger">{dossierStore.error}</p>}

      {/* The consultation stays mounted (hidden) so switching away and back doesn't wipe it. */}
      <div hidden={view !== "consultation"}>
        <ConsultationView
          rules={rules}
          onAskQuestion={askQuestion}
          onKeep={async (initials, consultation) => {
            const d = emptyDossier(initials, consultation);
            await dossierStore.put(d, true);
            toast(`Dossier ${d.initials} gardé sur cet appareil.`, { variant: "success", actionLabel: "Ouvrir", onAction: () => openDossier(d.id, "preparation") });
          }}
        />
      </div>

      {view === "dossiers" && (
        <DossierList
          dossiers={dossierStore.dossiers}
          status={dossierStore.status}
          onOpen={(id) => openDossier(id)}
          onCreate={async (initials) => {
            const d = emptyDossier(initials);
            await dossierStore.put(d, true);
            openDossier(d.id);
          }}
          onRemoveMany={async (ids) => {
            for (const id of ids) await dossierStore.remove(id);
            toast(`${ids.length} dossier(s) supprimé(s) de cet appareil.`, { variant: "success" });
          }}
          onExport={dossierStore.exportBackup}
          onImport={dossierStore.importBackup}
        />
      )}

      {view === "dossier" &&
        (dossier ? (
          <DossierView
            d={dossier}
            tab={dossierTab}
            onTab={(t) => {
              const q = new URLSearchParams({ v: "dossier", id: dossier.id, ...(t === "consultation" ? {} : { t }) });
              // Switching step within a dossier replaces the entry: « back » returns to the list.
              window.history.replaceState(null, "", `${pathname}?${q}`);
            }}
            onBack={() => go("dossiers")}
            onChange={(d) => void dossierStore.put(d)}
            onRemove={async () => {
              await dossierStore.remove(dossier.id);
              go("dossiers");
            }}
            rules={rules}
            protocols={protocolLib.protocols}
            onSaveProtocol={protocolLib.save}
            onAskQuestion={askQuestion}
            carnetEnabled={carnetEnabled}
          />
        ) : dossierStore.status === "loading" ? (
          <Loader2 className="h-5 w-5 animate-spin text-foreground-subtle" />
        ) : (
          <p className="text-sm text-foreground-muted">Ce dossier n&apos;est pas sur cet appareil.</p>
        ))}

      {view === "protocoles" && <ProtocolLibrary protocols={protocolLib.protocols} onSave={protocolLib.save} onRemove={protocolLib.remove} />}

      {view === "regles" && (
        <RuleLibrary
          rules={rules}
          onSave={save}
          onRemove={remove}
          onNew={() => {
            setPendingQuestion(null);
            setWizardKey((k) => k + 1);
            go("nouvelle");
          }}
        />
      )}
      {view === "nouvelle" && <RuleWizard key={wizardKey} initial={pendingQuestion} onSave={save} onDone={() => go("regles")} />}
    </div>
  );
}
