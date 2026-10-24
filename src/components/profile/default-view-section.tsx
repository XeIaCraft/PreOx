"use client";

import { useState, useTransition } from "react";
import { updateDefaultView } from "@/app/actions/view-mode";
import type { ViewMode } from "@/lib/auth/view-mode";
import { useToast } from "@/components/ui/toast";

const OPTIONS: { value: ViewMode; label: string; hint: string }[] = [
  { value: "admin", label: "Vue admin", hint: "Tous les onglets et les outils d'administration." },
  { value: "user", label: "Vue utilisateur", hint: "Les modules tels qu'un utilisateur les voit, pour étudier ou consulter." },
];

/** Admins only: the view El Profesor and Préop open in (src/lib/auth/view-mode.ts). */
export function DefaultViewSection({ defaultView }: { defaultView: ViewMode }) {
  const [view, setView] = useState(defaultView);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function choose(value: ViewMode) {
    const previous = view;
    setView(value);
    startTransition(async () => {
      const result = await updateDefaultView(value);
      if (result.error) {
        setView(previous);
        toast(result.error, { variant: "error" });
      } else toast(value === "user" ? "Les modules s'ouvriront en vue utilisateur." : "Les modules s'ouvriront en vue admin.", { variant: "success" });
    });
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6">
      <h2 className="font-serif-display text-lg font-medium text-foreground">Vue par défaut</h2>
      <p className="mt-1 text-sm text-foreground-muted">
        La vue dans laquelle s&rsquo;ouvrent El Profesor et Préop. Le bouton « Vue utilisateur » / « Vue admin » de chaque module la change encore pour le moment, sur cet appareil.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => choose(opt.value)}
            disabled={pending}
            title={opt.hint}
            aria-pressed={view === opt.value}
            className={`rounded-full border px-3 py-1.5 text-sm disabled:opacity-60 ${
              view === opt.value ? "border-primary bg-primary-tint text-primary-strong" : "border-border text-foreground-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-foreground-subtle">{OPTIONS.find((o) => o.value === view)?.hint}</p>
    </div>
  );
}
