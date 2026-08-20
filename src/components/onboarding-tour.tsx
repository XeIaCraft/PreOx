"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markOnboardingSeen } from "@/lib/onboarding";

export interface OnboardingStep {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  /** CSS selector (e.g. `[data-tour="generator-bar"]`) of the real element this step points to.
      Absent = shown as a plain centered card, for intro/closing steps with no single anchor. */
  target?: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Anchors a step's tooltip to a real on-screen element, scrolling it into view and
    highlighting it with a spotlight cutout, so the tour shows "où et comment" rather
    than just describing features in a generic centered modal. */
function useTargetRect(selector: string | undefined): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!selector) {
      const raf = requestAnimationFrame(() => setRect(null));
      return () => cancelAnimationFrame(raf);
    }
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) {
      const raf = requestAnimationFrame(() => setRect(null));
      return () => cancelAnimationFrame(raf);
    }

    el.scrollIntoView({ behavior: "smooth", block: "center" });

    function measure() {
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }

    // Wait for the smooth scroll to settle before measuring.
    const timeout = setTimeout(measure, 350);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [selector]);

  return rect;
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
  const step = open ? steps[index] : undefined;
  const targetRect = useTargetRect(step?.target);

  if (!open || !step) return null;

  function finish() {
    markOnboardingSeen(moduleKey);
    onOpenChange(false);
    // Reset for next time "Revoir le tutoriel" is clicked.
    setIndex(0);
  }

  const Icon = step.icon;
  const isLast = index === steps.length - 1;

  const dots = (
    <div className="flex items-center justify-center gap-1.5">
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
  );

  const nav = (
    <div className="flex items-center justify-between gap-2">
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
  );

  if (step.target && targetRect) {
    const margin = 12;
    const spaceBelow = window.innerHeight - (targetRect.top + targetRect.height);
    const placeBelow = spaceBelow > 220 || spaceBelow > targetRect.top;
    const tooltipTop = placeBelow ? targetRect.top + targetRect.height + margin : undefined;
    const tooltipBottom = placeBelow ? undefined : window.innerHeight - targetRect.top + margin;

    return (
      <div className="fixed inset-0 z-50">
        <div
          className="pointer-events-none fixed rounded-[var(--radius-md)] ring-2 ring-primary transition-all duration-300"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.5)",
          }}
        />
        <button
          type="button"
          onClick={finish}
          aria-label="Fermer le tutoriel"
          className="fixed inset-0 h-full w-full cursor-default"
        />
        <div
          className="fixed z-10 w-[min(340px,calc(100vw-2rem))] rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-xl transition-all duration-300"
          style={{
            top: tooltipTop,
            bottom: tooltipBottom,
            left: Math.min(Math.max(targetRect.left, 16), window.innerWidth - 340 - 16),
          }}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary-strong">
              <Icon className="h-4 w-4" />
            </span>
            <button type="button" onClick={finish} aria-label="Fermer le tutoriel" className="rounded p-1 text-foreground-subtle hover:bg-surface-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
          <h2 className="font-serif-display text-base font-medium text-foreground">{step.title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground-muted">{step.description}</p>
          <div className="mt-3">{dots}</div>
          <div className="mt-3">{nav}</div>
        </div>
      </div>
    );
  }

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

        <div className="mt-2 py-4">{dots}</div>

        <div className="border-t border-border px-5 py-4">{nav}</div>
      </div>
    </div>
  );
}
