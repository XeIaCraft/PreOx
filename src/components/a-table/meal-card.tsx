"use client";

import { useState } from "react";
import { Star, Trash2, CheckCircle2, GripVertical, Clock, Minus, Plus, Copy, Lock, LockOpen, Timer, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/input";
import { DAY_LABELS, PLACEMENTS } from "@/lib/a-table/constants";
import type { MealCard as MealCardType, Placement, Recipe } from "@/lib/a-table/types";

const SWATCHES: Record<string, string> = {
  leaf: "linear-gradient(135deg,#e5efe1,#c7dcbd)",
  bolt: "linear-gradient(135deg,#faedd6,#f0d19f)",
  flame: "linear-gradient(135deg,#f5ded3,#e6b298)",
  snow: "linear-gradient(135deg,#e2eef2,#c3dbe3)",
  dish: "linear-gradient(135deg,#efece3,#dcd6c5)",
};

function categoryFor(tags: string[]): keyof typeof SWATCHES {
  const lower = tags.map((t) => t.toLowerCase());
  if (lower.some((t) => ["vegetarien", "végétarien", "vegan", "végétalien"].includes(t))) return "leaf";
  if (lower.some((t) => ["rapide", "express"].includes(t))) return "bolt";
  if (lower.some((t) => ["four", "grill", "rôti"].includes(t))) return "flame";
  if (lower.some((t) => ["froid", "surgelé"].includes(t))) return "snow";
  return "dish";
}

interface MealCardProps {
  card: MealCardType;
  recipe: Recipe;
  onOpenDetail: () => void;
  onCook: () => void;
  onRemove: () => void;
  onMove: (placement: Placement) => void;
  onServingsChange?: (servings: number) => void;
  onDuplicate?: () => void;
  onToggleLock?: () => void;
  onStartTimer?: (minutes: number, label: string) => void;
  allergyWarning?: boolean;
  isPending?: boolean;
}

export function MealCard({
  card,
  recipe,
  onOpenDetail,
  onCook,
  onRemove,
  onMove,
  onServingsChange,
  onDuplicate,
  onToggleLock,
  onStartTimer,
  allergyWarning,
  isPending,
}: MealCardProps) {
  const [dragging, setDragging] = useState(false);
  const swatch = SWATCHES[categoryFor(recipe.tags)];

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", card.id);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface transition-opacity",
        dragging && "opacity-40"
      )}
    >
      <button
        type="button"
        onClick={onOpenDetail}
        className="relative flex h-20 w-full items-center justify-center overflow-hidden"
        style={
          recipe.image_url
            ? { backgroundImage: `url(${recipe.image_url})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { background: swatch }
        }
      >
        {recipe.is_favorite && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-surface/90 p-1">
            <Star className="h-3 w-3 fill-accent text-accent" />
          </span>
        )}
        {allergyWarning && (
          <span
            className="absolute left-1.5 top-1.5 rounded-full bg-danger-tint p-1 text-danger"
            title="Contient un ingrédient de votre liste d'allergies"
          >
            <ShieldAlert className="h-3 w-3" />
          </span>
        )}
        {card.locked && (
          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-surface/90 p-1 text-foreground-subtle">
            <Lock className="h-3 w-3" />
          </span>
        )}
      </button>

      <div className="flex-1 p-2.5">
        <p className="line-clamp-2 text-sm font-medium text-foreground">{recipe.title}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-foreground-subtle">
          {recipe.cooking_minutes != null && (
            <>
              <Clock className="h-3 w-3" />
              {recipe.cooking_minutes} min ·{" "}
            </>
          )}
          {onServingsChange ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onServingsChange(Math.max(1, card.servings - 1))}
                disabled={isPending || card.servings <= 1}
                aria-label="Moins de portions"
                className="rounded p-0.5 hover:bg-surface-muted disabled:opacity-30"
              >
                <Minus className="h-2.5 w-2.5" />
              </button>
              {card.servings} pers.
              <button
                type="button"
                onClick={() => onServingsChange(card.servings + 1)}
                disabled={isPending}
                aria-label="Plus de portions"
                className="rounded p-0.5 hover:bg-surface-muted"
              >
                <Plus className="h-2.5 w-2.5" />
              </button>
            </span>
          ) : (
            `${card.servings} pers.`
          )}
        </p>
      </div>

      <div className="flex items-center justify-between gap-1 border-t border-border px-2 py-1.5">
        <span className="cursor-grab text-foreground-subtle" title="Glisser pour déplacer">
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <Select
          value={card.placement}
          onChange={(e) => onMove(e.target.value as Placement)}
          disabled={isPending}
          className="h-7 w-24 border-none bg-transparent px-1 text-xs"
          aria-label="Déplacer vers"
        >
          {PLACEMENTS.map((p) => (
            <option key={p} value={p}>
              {DAY_LABELS[p]}
            </option>
          ))}
        </Select>
        {onStartTimer && recipe.cooking_minutes != null && (
          <button
            type="button"
            onClick={() => onStartTimer(recipe.cooking_minutes!, recipe.title)}
            disabled={isPending}
            title={`Lancer un chrono de ${recipe.cooking_minutes} min`}
            className="rounded p-1 text-foreground-subtle hover:bg-surface-muted"
          >
            <Timer className="h-3.5 w-3.5" />
          </button>
        )}
        {onToggleLock && (
          <button
            type="button"
            onClick={onToggleLock}
            disabled={isPending}
            title={card.locked ? "Déverrouiller (peut être vidée)" : "Verrouiller (protégée de « Vider la semaine »)"}
            className="rounded p-1 text-foreground-subtle hover:bg-surface-muted"
          >
            {card.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
          </button>
        )}
        {onDuplicate && (
          <button
            type="button"
            onClick={onDuplicate}
            disabled={isPending}
            title="Dupliquer vers « À cuisiner »"
            className="rounded p-1 text-foreground-subtle hover:bg-surface-muted"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onCook}
          disabled={isPending}
          title="Marquer comme cuisiné"
          className="rounded p-1 text-foreground-subtle hover:bg-success-tint hover:text-success"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={isPending}
          title="Supprimer"
          className="rounded p-1 text-foreground-subtle hover:bg-danger-tint hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
