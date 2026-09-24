"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BookMarked, ClipboardPlus, Loader2, Stethoscope } from "lucide-react";
import { ConsultationView } from "@/components/preop/consultation";
import { RuleLibrary } from "@/components/preop/rule-library";
import { RuleWizard } from "@/components/preop/rule-wizard";
import { useRules } from "@/components/preop/use-rules";
import type { QuestionInput } from "@/lib/preop/rules/question";
import { cn } from "@/lib/utils";

type View = "consultation" | "regles" | "nouvelle";

const TABS: { view: View; label: string; icon: typeof Stethoscope }[] = [
  { view: "consultation", label: "Consultation", icon: Stethoscope },
  { view: "regles", label: "Règles", icon: BookMarked },
  { view: "nouvelle", label: "Nouvelle règle", icon: ClipboardPlus },
];

/**
 * The "Préop" module, one client-side app: the consultation (nothing
 * saved), the rule library and the rule wizard. The current screen lives
 * in ?v= so the browser's back button works; switching never reloads.
 */
export function PreopApp() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const fromUrl = searchParams.get("v") as View | null;
  const view: View = fromUrl && TABS.some((t) => t.view === fromUrl) ? fromUrl : "consultation";
  const { rules, loading, error, save, remove } = useRules();
  const [pendingQuestion, setPendingQuestion] = useState<QuestionInput | null>(null);
  const [wizardKey, setWizardKey] = useState(0);

  function go(next: View) {
    window.history.pushState(null, "", next === "consultation" ? pathname : `${pathname}?v=${next}`);
    window.scrollTo(0, 0);
  }

  return (
    <div className="min-w-0 space-y-5 [&_.grid>*]:min-w-0">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif-display text-3xl font-medium text-foreground">Préop</h1>
          <span className="flex items-center gap-1.5 text-xs text-foreground-subtle">
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {error ? <span className="text-danger">{error}</span> : `${rules.filter((r) => r.status === "active").length} règle(s) active(s)`}
          </span>
        </div>
        <nav className="flex gap-1 overflow-x-auto" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.view}
              type="button"
              onClick={() => {
                if (t.view === "nouvelle") {
                  setPendingQuestion(null);
                  setWizardKey((k) => k + 1);
                }
                go(t.view);
              }}
              aria-current={view === t.view ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors",
                view === t.view ? "bg-primary text-primary-foreground" : "text-foreground-muted hover:bg-surface-muted"
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* The consultation stays mounted (hidden) so switching to the library and back doesn't wipe it. */}
      <div hidden={view !== "consultation"}>
        <ConsultationView
          rules={rules}
          onAskQuestion={(q) => {
            setPendingQuestion(q);
            setWizardKey((k) => k + 1);
            go("nouvelle");
          }}
        />
      </div>
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
