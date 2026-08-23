"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, CheckCircle2, Moon, Sun, MonitorSmartphone, Rows3, Rows2 } from "lucide-react";
import { SHOPPING_CATEGORIES, SHOPPING_OTHER_CATEGORY } from "@/lib/a-table/constants";
import type { MemberDisplayPrefs, SimpleBoardData } from "@/lib/a-table/types";

const CATEGORIES = [...SHOPPING_CATEGORIES, SHOPPING_OTHER_CATEGORY];

interface SimpleBoardProps {
  data: SimpleBoardData;
  readOnly: boolean;
  backHref?: string;
  memberName?: string;
  displayPrefs?: MemberDisplayPrefs;
  onToggleShopping?: (key: string) => void;
  onMarkCooked?: (cardId: string) => void;
  onChangeDisplayPrefs?: (patch: MemberDisplayPrefs) => void;
}

/** Applies theme/density to <html> for the duration this page is mounted — same mechanism as the hub's ThemeToggle, restored on unmount since these pages can be part of the app's client-side navigation. */
function useAppliedDisplayPrefs(prefs?: MemberDisplayPrefs) {
  useEffect(() => {
    if (!prefs) return;
    const prevTheme = document.documentElement.getAttribute("data-theme");
    const prevDensity = document.documentElement.getAttribute("data-density");

    if (prefs.theme && prefs.theme !== "system") document.documentElement.setAttribute("data-theme", prefs.theme);
    else document.documentElement.removeAttribute("data-theme");
    if (prefs.density === "compact") document.documentElement.setAttribute("data-density", "compact");
    else document.documentElement.removeAttribute("data-density");

    return () => {
      if (prevTheme) document.documentElement.setAttribute("data-theme", prevTheme);
      else document.documentElement.removeAttribute("data-theme");
      if (prevDensity) document.documentElement.setAttribute("data-density", prevDensity);
      else document.documentElement.removeAttribute("data-density");
    };
  }, [prefs]);
}

/**
 * "Une page, sans modal" — the épuré alternative to the full board: no
 * drag-and-drop, no dialogs, no toolbar clutter, just today/this week/the
 * shopping list, optionally read-only for a household member's personal
 * link. Every expandable bit uses plain <details>, never the Modal
 * component.
 */
export function SimpleBoard({
  data,
  readOnly,
  backHref,
  memberName,
  displayPrefs,
  onToggleShopping,
  onMarkCooked,
  onChangeDisplayPrefs,
}: SimpleBoardProps) {
  useAppliedDisplayPrefs(displayPrefs);
  const [isPending, startTransition] = useTransition();
  const unchecked = data.shoppingItems.filter((i) => !i.checked);

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">À table{memberName ? ` · ${memberName}` : ""}</p>
          <h1 className="font-serif-display text-2xl font-medium text-foreground">Vue épurée</h1>
        </div>
        {backHref && (
          <Link href={backHref} className="flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Vue complète
          </Link>
        )}
      </header>

      {onChangeDisplayPrefs && (
        <section className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface-muted/40 px-3 py-2.5 text-xs">
          <span className="font-medium text-foreground-subtle">Affichage :</span>
          <div className="flex gap-1">
            {(["system", "light", "dark"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChangeDisplayPrefs({ ...displayPrefs, theme: t })}
                className={`flex items-center gap-1 rounded-full border px-2 py-1 ${
                  (displayPrefs?.theme ?? "system") === t ? "border-primary/40 bg-primary-tint text-primary-strong" : "border-border text-foreground-subtle"
                }`}
              >
                {t === "system" ? <MonitorSmartphone className="h-3 w-3" /> : t === "light" ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
                {t === "system" ? "Système" : t === "light" ? "Clair" : "Sombre"}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {(["cozy", "compact"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onChangeDisplayPrefs({ ...displayPrefs, density: d })}
                className={`flex items-center gap-1 rounded-full border px-2 py-1 ${
                  (displayPrefs?.density ?? "cozy") === d ? "border-primary/40 bg-primary-tint text-primary-strong" : "border-border text-foreground-subtle"
                }`}
              >
                {d === "cozy" ? <Rows2 className="h-3 w-3" /> : <Rows3 className="h-3 w-3" />}
                {d === "cozy" ? "Confortable" : "Compact"}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Aujourd&rsquo;hui</p>
        {data.today?.recipeTitle ? (
          <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-3">
            {data.today.recipeImageUrl && (
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[var(--radius-sm)]">
                <Image src={data.today.recipeImageUrl} alt={data.today.recipeTitle} fill sizes="56px" className="object-cover" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{data.today.recipeTitle}</p>
              {data.today.servings != null && <p className="text-xs text-foreground-subtle">{data.today.servings} pers.</p>}
            </div>
            {!readOnly && onMarkCooked && data.today.cardId && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => onMarkCooked(data.today!.cardId!))}
                className="flex items-center gap-1 rounded-full border border-success/40 bg-success-tint px-2.5 py-1 text-xs text-success"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Cuisiné
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-foreground-subtle">Rien de prévu aujourd&rsquo;hui.</p>
        )}
      </section>

      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Cette semaine</p>
        <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
          {data.week.map((slot) => (
            <li
              key={slot.placement}
              className={`flex items-center justify-between gap-2 px-3 py-[var(--row-py)] ${slot.isToday ? "bg-primary-tint/40" : ""}`}
            >
              <span className={`text-sm ${slot.isToday ? "font-medium text-primary-strong" : "text-foreground-subtle"}`}>{slot.label}</span>
              <span className="truncate text-sm text-foreground">{slot.recipeTitle ?? "—"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Liste de courses</p>
        {unchecked.length === 0 ? (
          <p className="text-sm text-foreground-subtle">Rien à acheter pour l&rsquo;instant.</p>
        ) : (
          <div className="space-y-3">
            {CATEGORIES.map((category) => {
              const items = unchecked.filter((i) => i.category === category.key);
              if (items.length === 0) return null;
              return (
                <div key={category.key}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">{category.label}</p>
                  <ul className="space-y-0.5">
                    {items.map((item) => (
                      <li key={item.key}>
                        <label className="flex items-center gap-2 py-[var(--row-py)] text-sm text-foreground">
                          {!readOnly && onToggleShopping ? (
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={() => onToggleShopping(item.key)}
                              className="h-4 w-4 rounded border-border-strong text-primary focus-visible:ring-primary/30"
                            />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-foreground-subtle" />
                          )}
                          {item.uncertain ? `${item.name} (quantité à ajuster)` : `${item.quantity ? Math.round(item.quantity * 100) / 100 : ""} ${item.unit} ${item.name}`}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
