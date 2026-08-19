"use client";

import { useState } from "react";
import { Sparkles, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GeneratorBarProps {
  defaultCount: number;
  onGenerate: (count: number) => void;
  isPending: boolean;
}

export function GeneratorBar({ defaultCount, onGenerate, isPending }: GeneratorBarProps) {
  const [count, setCount] = useState(defaultCount || 6);

  return (
    <div
      id="a-table-generator"
      className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-border bg-primary-tint/40 p-4"
    >
      <div>
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <Sparkles className="h-4 w-4 text-primary-strong" />
          Proposer des repas
        </p>
        <p className="text-sm text-foreground-muted">L&rsquo;IA génère des idées selon vos préférences.</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-full border border-border bg-surface px-1">
          <button
            type="button"
            onClick={() => setCount((c) => Math.max(1, c - 1))}
            className="rounded-full p-1.5 text-foreground-muted hover:bg-surface-muted"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-6 text-center text-sm font-medium">{count}</span>
          <button
            type="button"
            onClick={() => setCount((c) => Math.min(8, c + 1))}
            className="rounded-full p-1.5 text-foreground-muted hover:bg-surface-muted"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <Button onClick={() => onGenerate(count)} disabled={isPending}>
          {isPending ? "Génération en cours…" : "Générer"}
        </Button>
      </div>
    </div>
  );
}
