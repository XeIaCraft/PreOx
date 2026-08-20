"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markOnboardingSeen } from "@/lib/onboarding";

export interface OnboardingStep {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

export function OnboardingTour({
  moduleKey,
  steps,
  open,
  onOpenChange,
}: {
  moduleKey: string;
  steps: OnboardingStep[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [index, setIndex] = useState(0);

  if (!open) return null;

  function finish() {
    markOnboardingSeen(moduleKey);
    onOpenChange(false);
    // Reset for next time "Revoir le tutoriel" is clicked.
    setIndex(0);
  }

  const step = steps[index];
  const Icon = step.icon;
  const isLast = index === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-[var(--radius-lg)] border border-border bg-surface shadow-xl sm:rounded-[var(--radius-lg)]">
        <div className="flex justify-end px-4 pt-4">
          <Button variant="ghost" size="icon" onClick={finish} aria-label="Fermer le tutoriel">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-col items-center px-6 pb-2 pt-2 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-tint text-primary-strong">
            <Icon className="h-7 w-7" />
          </span>
          <h2 className="mt-4 font-serif-display text-xl font-medium text-foreground">{step.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{step.description}</p>
        </div>

        <div className="mt-2 flex items-center justify-center gap-1.5 py-4">
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Étape ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-primary" : "w-1.5 bg-border-strong"}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-4">
          {index > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setIndex((i) => i - 1)}>
              <ArrowLeft className="h-3.5 w-3.5" /> Précédent
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={finish}>
              Passer
            </Button>
          )}
          {isLast ? (
            <Button size="sm" onClick={finish}>
              <Check className="h-3.5 w-3.5" /> Terminer
            </Button>
          ) : (
            <Button size="sm" onClick={() => setIndex((i) => i + 1)}>
              Suivant <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
