"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Timer, X, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateCookPlan, type CookPlanStep } from "@/app/apps/a-table/actions/cook_mode";
import type { Ingredient } from "@/lib/a-table/types";

export interface CookModeRecipe {
  id: string;
  title: string;
  ingredients: Ingredient[];
  steps: string[];
}

interface CookModeDialogProps {
  recipes: CookModeRecipe[];
  onClose: () => void;
}

interface RunningTimer {
  id: number;
  label: string;
  endsAt: number;
}

function detectMinutes(step: string): number | null {
  const hourMatch = step.match(/(\d+)\s*h(?:eure)?s?/i);
  const minMatch = step.match(/(\d+)\s*min/i);
  let minutes = 0;
  if (hourMatch) minutes += Number(hourMatch[1]) * 60;
  if (minMatch) minutes += Number(minMatch[1]);
  return minutes > 0 ? minutes : null;
}

export function CookModeDialog({ recipes, onClose }: CookModeDialogProps) {
  const [phase, setPhase] = useState<"prep" | "steps">("prep");
  const [plan, setPlan] = useState<CookPlanStep[] | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const wakeLockRef = useState<{ current: WakeLockSentinel | null }>(() => ({ current: null }))[0];

  useEffect(() => {
    let cancelled = false;
    generateCookPlan(recipes.map((r) => ({ name: r.title, steps: r.steps }))).then((result) => {
      if (!cancelled) setPlan(result.plan ?? []);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if ("wakeLock" in navigator) {
      navigator.wakeLock.request("screen").then((lock) => {
        wakeLockRef.current = lock;
      }).catch(() => {});
    }
    return () => {
      wakeLockRef.current?.release().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (timers.length === 0) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timers.length]);

  useEffect(() => {
    if (phase !== "steps" || !plan) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setStepIndex((i) => Math.min((plan?.length ?? 1) - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setStepIndex((i) => Math.max(0, i - 1));
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [phase, plan]);

  const currentStep = plan?.[stepIndex];

  function startTimer(label: string, minutes: number) {
    setTimers((prev) => [...prev, { id: Date.now(), label, endsAt: Date.now() + minutes * 60 * 1000 }]);
  }

  function dismissTimer(id: number) {
    setTimers((prev) => prev.filter((t) => t.id !== id));
  }

  function formatRemaining(endsAt: number) {
    const remaining = Math.max(0, Math.round((endsAt - now) / 1000));
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const detectedMinutes = currentStep ? detectMinutes(currentStep.step_text) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <p className="font-serif-display text-lg font-medium text-foreground">Mode recette</p>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {timers.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-border bg-surface-muted px-5 py-2">
          {timers.map((t) => {
            const done = t.endsAt - now <= 0;
            return (
              <span
                key={t.id}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                  done ? "animate-pulse bg-danger-tint text-danger" : "bg-surface text-foreground-muted"
                }`}
              >
                {done ? <BellRing className="h-3 w-3" /> : <Timer className="h-3 w-3" />}
                {t.label} — {formatRemaining(t.endsAt)}
                <button type="button" onClick={() => dismissTimer(t.id)} aria-label="Arrêter ce chrono" className="hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {phase === "prep" ? (
          <div className="mx-auto max-w-xl space-y-6">
            <h2 className="font-serif-display text-xl font-medium text-foreground">Préparation</h2>
            {recipes.map((recipe) => (
              <div key={recipe.id}>
                <p className="font-medium text-foreground">{recipe.title}</p>
                <ul className="mt-1 space-y-0.5 text-sm text-foreground-muted">
                  {recipe.ingredients.map((ing, i) => (
                    <li key={i}>
                      {ing.quantity ?? ""} {ing.unit} {ing.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <Button onClick={() => setPhase("steps")} disabled={!plan}>
              {plan ? "Commencer" : "Préparation d'un plan de cuisson entrelacé…"}
            </Button>
          </div>
        ) : (
          <div className="mx-auto flex max-w-xl flex-col items-center text-center">
            {currentStep && recipes.length > 1 && (
              <span className="mb-3 rounded-full bg-primary-tint px-3 py-1 text-xs font-medium text-primary-strong">
                {recipes[currentStep.recipe_index]?.title}
              </span>
            )}
            <p className="text-xl text-foreground">{currentStep?.step_text ?? "Terminé !"}</p>

            {detectedMinutes && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => startTimer(currentStep?.step_text.slice(0, 30) ?? "Chrono", detectedMinutes)}
              >
                <Timer className="h-4 w-4" /> Lancer un chrono ({detectedMinutes} min)
              </Button>
            )}
          </div>
        )}
      </div>

      {phase === "steps" && plan && (
        <div className="flex items-center justify-between border-t border-border px-5 py-4">
          <Button variant="secondary" size="sm" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0}>
            <ChevronLeft className="h-4 w-4" /> Précédent
          </Button>
          <span className="text-sm text-foreground-subtle">
            {Math.min(stepIndex + 1, plan.length)} / {plan.length}
          </span>
          <Button
            size="sm"
            onClick={() => (stepIndex < plan.length - 1 ? setStepIndex((i) => i + 1) : onClose())}
          >
            {stepIndex < plan.length - 1 ? "Suivant" : "Terminer"} <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
