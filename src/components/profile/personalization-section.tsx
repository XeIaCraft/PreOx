"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAccentTheme, updateDensity, setWidgetHidden } from "@/app/actions/personalization";

const ACCENTS = [
  { value: "forest" as const, label: "Forêt", swatch: "#2f5d54" },
  { value: "slate" as const, label: "Ardoise", swatch: "#3b5a72" },
];

const WIDGET_LABELS: Record<string, string> = {
  todo: "À traiter",
  changelog: "Nouveautés",
  recent: "Récemment consulté",
};

export function PersonalizationSection({
  accentTheme,
  density,
  hiddenWidgets,
}: {
  accentTheme: "forest" | "slate";
  density: "comfortable" | "compact";
  hiddenWidgets: string[];
}) {
  const router = useRouter();
  const [accent, setAccent] = useState(accentTheme);
  const [dens, setDens] = useState(density);
  const [hidden, setHidden] = useState(new Set(hiddenWidgets));
  const [, startTransition] = useTransition();

  function handleShowWidget(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    startTransition(async () => {
      await setWidgetHidden(key, false);
      router.refresh();
    });
  }

  function handleAccentChange(value: "forest" | "slate") {
    setAccent(value);
    if (value === "forest") document.documentElement.removeAttribute("data-accent");
    else document.documentElement.setAttribute("data-accent", value);
    try {
      if (value === "forest") window.localStorage.removeItem("preox-accent");
      else window.localStorage.setItem("preox-accent", value);
    } catch {
      // ignore
    }
    startTransition(() => {
      void updateAccentTheme(value);
    });
  }

  function handleDensityChange(value: "comfortable" | "compact") {
    setDens(value);
    if (value === "comfortable") document.documentElement.removeAttribute("data-density");
    else document.documentElement.setAttribute("data-density", value);
    try {
      if (value === "comfortable") window.localStorage.removeItem("preox-density");
      else window.localStorage.setItem("preox-density", value);
    } catch {
      // ignore
    }
    startTransition(() => {
      void updateDensity(value);
    });
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6">
      <h2 className="font-serif-display text-lg font-medium text-foreground">Personnalisation</h2>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-sm font-medium text-foreground">Couleur d&rsquo;accent</p>
          <div className="mt-2 flex gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => handleAccentChange(a.value)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                  accent === a.value ? "border-primary bg-primary-tint text-primary-strong" : "border-border text-foreground-muted"
                }`}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: a.swatch }} />
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">Densité des listes</p>
          <p className="text-sm text-foreground-muted">Affecte les tableaux d&rsquo;administration et les bibliothèques.</p>
          <div className="mt-2 flex gap-2">
            {(["comfortable", "compact"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => handleDensityChange(value)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  dens === value ? "border-primary bg-primary-tint text-primary-strong" : "border-border text-foreground-muted"
                }`}
              >
                {value === "comfortable" ? "Confortable" : "Compacte"}
              </button>
            ))}
          </div>
        </div>

        {hidden.size > 0 && (
          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground">Widgets masqués sur la page d&rsquo;accueil</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[...hidden].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleShowWidget(key)}
                  className="rounded-full border border-border px-3 py-1.5 text-sm text-foreground-muted hover:border-primary/40 hover:text-foreground"
                >
                  + {WIDGET_LABELS[key] ?? key}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
