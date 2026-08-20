"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, ListOrdered, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderIcon } from "@/lib/icon-map";
import { updateAppOrder } from "@/app/actions/personalization";
import type { AppWithAccess } from "@/lib/apps";

export function AppReorder({ apps }: { apps: AppWithAccess[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState(apps.map((a) => a.id));
  const [isPending, startTransition] = useTransition();

  if (apps.length < 2) return null;

  if (!editing) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
        <ListOrdered className="h-4 w-4" />
        Réorganiser mes modules
      </Button>
    );
  }

  const byId = new Map(apps.map((a) => [a.id, a]));

  function move(index: number, direction: -1 | 1) {
    const next = [...order];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    startTransition(() => {
      void updateAppOrder(next);
    });
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Ordre de vos modules</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setEditing(false);
            router.refresh();
          }}
        >
          <Check className="h-4 w-4" />
          Terminé
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {order.map((id, i) => {
          const app = byId.get(id);
          if (!app) return null;
          return (
            <li key={id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-surface-muted text-foreground-muted">
                  {renderIcon(app.icon, "h-4 w-4")}
                </span>
                <span className="text-sm text-foreground">{app.name}</span>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0 || isPending}
                  className="rounded p-1 text-foreground-subtle hover:bg-surface-muted disabled:opacity-30"
                  aria-label="Monter"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === order.length - 1 || isPending}
                  className="rounded p-1 text-foreground-subtle hover:bg-surface-muted disabled:opacity-30"
                  aria-label="Descendre"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
