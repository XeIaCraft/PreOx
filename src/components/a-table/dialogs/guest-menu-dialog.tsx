"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Wine, Trash2 } from "lucide-react";
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
} from "@/app/apps/a-table/actions/guest_menu";
import { useToast } from "@/components/ui/toast";
import type { GuestCourse, GuestCourseDish, GuestCourseKey, GuestMenu } from "@/lib/a-table/types";

interface GuestMenuDialogProps {
  menu: GuestMenu | null;
  onClose: () => void;
  onSaved: () => void;
  onCreated: (menuId: string) => void;
}

function isComposed(course: GuestCourse): course is { items: GuestCourseDish[] } {
  return "items" in course;
}

function DishCard({
  dish,
  onRegenerate,
  onRefine,
  onApplied,
  isPending,
}: {
  dish: GuestCourseDish;
  onRegenerate: () => void;
  onRefine: (m: string) => Promise<{ error?: string; success?: string }>;
  onApplied: () => void;
  isPending: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-foreground">{dish.title}</p>
        <button type="button" onClick={onRegenerate} disabled={isPending} className="rounded p-1 text-foreground-subtle hover:bg-surface-muted">
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
        </button>
      </div>
      {dish.notes && <p className="mt-1 text-sm text-foreground-muted">{dish.notes}</p>}
      <ul className="mt-2 space-y-0.5 text-xs text-foreground-subtle">
        {dish.ingredients.slice(0, 6).map((ing, i) => (
          <li key={i}>
            {ing.quantity ?? ""} {ing.unit} {ing.name}
          </li>
        ))}
      </ul>
      <div className="mt-2">
        <RefineBox onSubmit={onRefine} onApplied={onApplied} placeholder="Ajuster ce plat…" />
      </div>
    </div>
  );
}

export function GuestMenuDialog({ menu, onClose, onSaved, onCreated }: GuestMenuDialogProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null);
  const [guests, setGuests] = useState(6);
  const [notes, setNotes] = useState("");
  const [courseKeys, setCourseKeys] = useState<Set<GuestCourseKey>>(new Set(GUEST_COURSE_KEYS));
  const [composedKeys, setComposedKeys] = useState<Set<GuestCourseKey>>(new Set());
  const [composedCounts, setComposedCounts] = useState<Record<string, number>>({});

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
        <Button variant="danger" size="sm" onClick={handleDismiss} disabled={isPending}>
          <Trash2 className="h-4 w-4" /> Supprimer ce menu
        </Button>
      }
    >
      <div className="space-y-4">
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
                      isPending={regeneratingKey === `${key}:${i}`}
                      onRegenerate={() => handleRegenerateCourse(key, i)}
                      onRefine={(m) => refineGuestCourse(menu.id, key, m, i)}
                      onApplied={onSaved}
                    />
                  ))}
                </div>
              ) : (
                <DishCard
                  dish={course}
                  isPending={regeneratingKey === key}
                  onRegenerate={() => handleRegenerateCourse(key)}
                  onRefine={(m) => refineGuestCourse(menu.id, key, m)}
                  onApplied={onSaved}
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
            <button type="button" onClick={handleRegenerateWine} disabled={isPending} className="rounded p-1 text-foreground-subtle hover:bg-surface-muted">
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
    </Modal>
  );
}
