"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { RefreshCw, Wine, Trash2, Printer, BookmarkPlus, CookingPot } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { RefineBox } from "@/components/a-table/ui/refine-box";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { GUEST_COURSE_KEYS, GUEST_COURSE_LABELS } from "@/lib/a-table/constants";
import {
  generateGuestMenu,
  regenerateGuestCourse,
  refineGuestCourse,
  regenerateWinePairings,
  dismissGuestMenu,
  saveDishAsRecipe,
} from "@/app/apps/a-table/actions/guest_menu";
import { useToast } from "@/components/ui/toast";
import { CookModeDialog, type CookModeRecipe } from "@/components/a-table/dialogs/cook-mode-dialog";
import type { RunningTimer } from "@/components/a-table/ui/timer-bar";
import type { GuestCourse, GuestCourseDish, GuestCourseKey, GuestMenu } from "@/lib/a-table/types";

interface GuestMenuDialogProps {
  menu: GuestMenu | null;
  onClose: () => void;
  onSaved: () => void;
  onCreated: (menuId: string) => void;
  timers: RunningTimer[];
  onStartTimer: (minutes: number, label: string) => void;
  onDismissTimer: (id: number) => void;
}

function isComposed(course: GuestCourse): course is { items: GuestCourseDish[] } {
  return "items" in course;
}

function GuestDishDetailDialog({ dish, onClose, onCookMode }: { dish: GuestCourseDish; onClose: () => void; onCookMode: () => void }) {
  return (
    <Modal title={dish.title} onClose={onClose} size="lg">
      {dish.image_url && (
        <div className="relative mb-4 h-48 w-full overflow-hidden rounded-[var(--radius-md)]">
          <Image src={dish.image_url} alt={dish.title} fill sizes="600px" className="object-cover" />
        </div>
      )}
      <Button className="mb-4 w-full" variant="outline" size="sm" onClick={onCookMode}>
        <CookingPot className="h-4 w-4" /> Mode recette
      </Button>
      {dish.notes && <p className="mb-4 text-sm text-foreground-muted">{dish.notes}</p>}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Ingrédients</h3>
          <ul className="space-y-1 text-sm text-foreground-muted">
            {dish.ingredients.map((ing, i) => (
              <li key={i}>
                {ing.quantity ?? ""} {ing.unit} {ing.name}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Nutrition (par portion)</h3>
          <div className="grid grid-cols-2 gap-2 text-sm text-foreground-muted">
            <span>Kcal : {dish.nutrition.kcal ?? "–"}</span>
            <span>Protéines : {dish.nutrition.protein_g ?? "–"} g</span>
            <span>Glucides : {dish.nutrition.carb_g ?? "–"} g</span>
            <span>Lipides : {dish.nutrition.fat_g ?? "–"} g</span>
          </div>
        </div>
      </div>
      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Étapes</h3>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground-muted">
          {dish.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}

function DishCard({
  dish,
  guests,
  onRegenerate,
  onRefine,
  onApplied,
  onOpenDetail,
  isPending,
  selectable,
  selected,
  onToggleSelect,
}: {
  dish: GuestCourseDish;
  guests: number;
  onRegenerate: () => void;
  onRefine: (m: string) => Promise<{ error?: string; success?: string }>;
  onApplied: () => void;
  onOpenDetail: () => void;
  isPending: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { toast } = useToast();
  const [savingRecipe, setSavingRecipe] = useState(false);

  function handleSaveAsRecipe() {
    setSavingRecipe(true);
    saveDishAsRecipe(dish, guests)
      .then((result) => {
        if (result.error) toast(result.error, { variant: "error" });
        else toast(result.success ?? "", { variant: "success" });
      })
      .finally(() => setSavingRecipe(false));
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-border">
      {dish.image_url && (
        <button type="button" onClick={selectable ? onToggleSelect : onOpenDetail} className="relative block h-28 w-full print:hidden">
          <Image src={dish.image_url} alt={dish.title} fill sizes="400px" className="object-cover" />
        </button>
      )}
      <div className="p-3">
      <div className="flex items-start justify-between gap-2">
        {selectable ? (
          <label className="flex flex-1 items-start gap-2">
            <input
              type="checkbox"
              checked={Boolean(selected)}
              onChange={onToggleSelect}
              className="mt-1 h-4 w-4 rounded border-border-strong text-primary focus-visible:ring-primary/30"
            />
            <span className="font-medium text-foreground">{dish.title}</span>
          </label>
        ) : (
          <button type="button" onClick={onOpenDetail} className="flex-1 text-left font-medium text-foreground hover:underline">
            {dish.title}
          </button>
        )}
        <div className="flex shrink-0 gap-1 print:hidden">
          <button
            type="button"
            onClick={handleSaveAsRecipe}
            disabled={savingRecipe}
            title="Enregistrer comme recette"
            className="rounded p-1 text-foreground-subtle hover:bg-surface-muted"
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onRegenerate} disabled={isPending} className="rounded p-1 text-foreground-subtle hover:bg-surface-muted">
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      {dish.nutrition.kcal != null && <p className="mt-1 text-xs text-foreground-subtle">{dish.nutrition.kcal} kcal</p>}
      {dish.notes && <p className="mt-1 text-sm text-foreground-muted">{dish.notes}</p>}
      <ul className="mt-2 space-y-0.5 text-xs text-foreground-subtle">
        {dish.ingredients.slice(0, 6).map((ing, i) => (
          <li key={i}>
            {ing.quantity ?? ""} {ing.unit} {ing.name}
          </li>
        ))}
        {dish.ingredients.length > 6 && <li>+ {dish.ingredients.length - 6} de plus</li>}
      </ul>
      <div className="mt-2 print:hidden">
        <RefineBox onSubmit={onRefine} onApplied={onApplied} placeholder="Ajuster ce plat…" />
      </div>
      </div>
    </div>
  );
}

export function GuestMenuDialog({ menu, onClose, onSaved, onCreated, timers, onStartTimer, onDismissTimer }: GuestMenuDialogProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null);
  const [guests, setGuests] = useState(6);
  const [notes, setNotes] = useState("");
  const [courseKeys, setCourseKeys] = useState<Set<GuestCourseKey>>(new Set(GUEST_COURSE_KEYS));
  const [composedKeys, setComposedKeys] = useState<Set<GuestCourseKey>>(new Set());
  const [composedCounts, setComposedCounts] = useState<Record<string, number>>({});
  const [detailDish, setDetailDish] = useState<GuestCourseDish | null>(null);
  const [selectingForCombinedCook, setSelectingForCombinedCook] = useState(false);
  const [selectedDishKeys, setSelectedDishKeys] = useState<Set<string>>(new Set());
  const [cookRecipes, setCookRecipes] = useState<CookModeRecipe[] | null>(null);

  function dishKey(courseKey: GuestCourseKey, itemIndex?: number) {
    return itemIndex != null ? `${courseKey}:${itemIndex}` : courseKey;
  }

  function collectDishes(): { key: string; dish: GuestCourseDish }[] {
    if (!menu) return [];
    const result: { key: string; dish: GuestCourseDish }[] = [];
    for (const key of menu.course_keys) {
      const course = menu.courses[key];
      if (!course) continue;
      if (isComposed(course)) {
        course.items.forEach((item, i) => result.push({ key: dishKey(key, i), dish: item }));
      } else {
        result.push({ key: dishKey(key), dish: course });
      }
    }
    return result;
  }

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateGuestMenu({
        guests,
        notes,
        courseKeys: Array.from(courseKeys),
        composedKeys: Array.from(composedKeys),
        composedCounts,
      });
      if (result.error) toast(result.error, { variant: "error" });
      else if (result.menuId) {
        onSaved();
        onCreated(result.menuId);
      }
    });
  }

  function handleDismiss() {
    if (!menu) return;
    startTransition(async () => {
      await dismissGuestMenu(menu.id);
      onSaved();
      onClose();
    });
  }

  function handleRegenerateCourse(key: GuestCourseKey, itemIndex?: number) {
    if (!menu) return;
    setRegeneratingKey(itemIndex != null ? `${key}:${itemIndex}` : key);
    startTransition(async () => {
      const result = await regenerateGuestCourse(menu.id, key, itemIndex);
      setRegeneratingKey(null);
      if (result.error) toast(result.error, { variant: "error" });
      else onSaved();
    });
  }

  function handleRegenerateWine() {
    if (!menu) return;
    startTransition(async () => {
      const result = await regenerateWinePairings(menu.id);
      if (result.error) toast(result.error, { variant: "error" });
      else onSaved();
    });
  }

  if (!menu) {
    return (
      <Modal title="Repas spécial" description="Composez un menu complet pour recevoir des invités." onClose={onClose} size="lg">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {GUEST_COURSE_KEYS.map((key) => {
              const active = courseKeys.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setCourseKeys((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  className={`rounded-full border px-3 py-1.5 text-sm ${active ? "border-primary/40 bg-primary-tint text-primary-strong" : "border-border text-foreground-muted"}`}
                >
                  {GUEST_COURSE_LABELS[key]}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            {Array.from(courseKeys).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm text-foreground-muted">
                <input
                  type="checkbox"
                  checked={composedKeys.has(key)}
                  onChange={() =>
                    setComposedKeys((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  className="h-4 w-4 rounded border-border-strong text-primary focus-visible:ring-primary/30"
                />
                Assortiment pour {GUEST_COURSE_LABELS[key].toLowerCase()}
                {composedKeys.has(key) && (
                  <Input
                    type="number"
                    min={2}
                    max={6}
                    value={composedCounts[key] ?? 3}
                    onChange={(e) => setComposedCounts((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                    className="ml-2 h-7 w-16"
                  />
                )}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nombre d&rsquo;invités</Label>
              <Input type="number" min={1} value={guests} onChange={(e) => setGuests(Number(e.target.value))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Occasion / contraintes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={handleGenerate} disabled={isPending || courseKeys.size === 0}>
              {isPending ? "Génération en cours…" : "Générer le menu"}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={`Menu pour ${menu.guests} invités`}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimer
          </Button>
          <Button variant="danger" size="sm" onClick={handleDismiss} disabled={isPending}>
            <Trash2 className="h-4 w-4" /> Supprimer ce menu
          </Button>
        </>
      }
    >
      <div className="print-area space-y-4">
        <h1 className="hidden font-serif-display text-xl font-medium text-foreground print:mb-2 print:block">
          Menu pour {menu.guests} invités
        </h1>

        <div className="flex items-center justify-between print:hidden">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Plats</p>
          {selectingForCombinedCook ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-foreground-subtle">{selectedDishKeys.size} sélectionné(s)</span>
              <Button
                size="sm"
                disabled={selectedDishKeys.size < 2}
                onClick={() => {
                  const dishes = collectDishes().filter((d) => selectedDishKeys.has(d.key));
                  setCookRecipes(dishes.map(({ key, dish }) => ({ id: `guest:${key}`, title: dish.title, ingredients: dish.ingredients, steps: dish.steps })));
                  setSelectingForCombinedCook(false);
                  setSelectedDishKeys(new Set());
                }}
              >
                Cuisiner ensemble
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectingForCombinedCook(false);
                  setSelectedDishKeys(new Set());
                }}
              >
                Annuler
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setSelectingForCombinedCook(true)}>
              Cuisiner plusieurs plats ensemble
            </Button>
          )}
        </div>

        {menu.course_keys.map((key) => {
          const course = menu.courses[key];
          if (!course) return null;
          return (
            <div key={key}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">{GUEST_COURSE_LABELS[key]}</p>
              {isComposed(course) ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {course.items.map((item, i) => (
                    <DishCard
                      key={i}
                      dish={item}
                      guests={menu.guests}
                      isPending={regeneratingKey === `${key}:${i}`}
                      onRegenerate={() => handleRegenerateCourse(key, i)}
                      onRefine={(m) => refineGuestCourse(menu.id, key, m, i)}
                      onApplied={onSaved}
                      onOpenDetail={() => setDetailDish(item)}
                      selectable={selectingForCombinedCook}
                      selected={selectedDishKeys.has(dishKey(key, i))}
                      onToggleSelect={() =>
                        setSelectedDishKeys((prev) => {
                          const next = new Set(prev);
                          const k = dishKey(key, i);
                          if (next.has(k)) next.delete(k);
                          else next.add(k);
                          return next;
                        })
                      }
                    />
                  ))}
                </div>
              ) : (
                <DishCard
                  dish={course}
                  guests={menu.guests}
                  isPending={regeneratingKey === key}
                  onRegenerate={() => handleRegenerateCourse(key)}
                  onRefine={(m) => refineGuestCourse(menu.id, key, m)}
                  onApplied={onSaved}
                  onOpenDetail={() => setDetailDish(course)}
                  selectable={selectingForCombinedCook}
                  selected={selectedDishKeys.has(dishKey(key))}
                  onToggleSelect={() =>
                    setSelectedDishKeys((prev) => {
                      const next = new Set(prev);
                      const k = dishKey(key);
                      if (next.has(k)) next.delete(k);
                      else next.add(k);
                      return next;
                    })
                  }
                />
              )}
            </div>
          );
        })}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              <Wine className="h-3.5 w-3.5" /> Accords mets-vins
            </p>
            <button
              type="button"
              onClick={handleRegenerateWine}
              disabled={isPending}
              className="rounded p-1 text-foreground-subtle hover:bg-surface-muted print:hidden"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {menu.wine_pairings.map((wine, i) => (
              <div key={i} className="rounded-[var(--radius-sm)] border border-border p-3 text-sm">
                <p className="font-medium text-foreground">{wine.style}</p>
                <p className="text-foreground-muted">{wine.description}</p>
                {wine.producers.length > 0 && <p className="mt-1 text-xs text-foreground-subtle">{wine.producers.join(", ")}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {detailDish && (
        <GuestDishDetailDialog
          dish={detailDish}
          onClose={() => setDetailDish(null)}
          onCookMode={() => {
            setCookRecipes([{ id: "guest:detail", title: detailDish.title, ingredients: detailDish.ingredients, steps: detailDish.steps }]);
            setDetailDish(null);
          }}
        />
      )}

      {cookRecipes && (
        <CookModeDialog
          recipes={cookRecipes}
          onClose={() => setCookRecipes(null)}
          timers={timers}
          onStartTimer={onStartTimer}
          onDismissTimer={onDismissTimer}
        />
      )}
    </Modal>
  );
}
