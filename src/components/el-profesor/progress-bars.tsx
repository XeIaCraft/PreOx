/**
 * Compact read%/mastery% indicator shared by chapter cards (board.tsx) and
 * notion cards (glossary-view.tsx) — piste 2026-08-29. First version used
 * two separate stacked full-width bars per card; the user explicitly asked
 * for both on a single, small line matching the notion cards' size, so
 * this is the one shared implementation both call sites render, guaranteeing
 * identical sizing rather than two components that could drift apart.
 */
export interface CompactMastery {
  total: number;
  acquired: number;
  learning: number;
}

export function CompactProgressBars({ readPct, mastery }: { readPct: number; mastery: CompactMastery }) {
  if (readPct <= 0 && mastery.total === 0) return null;
  const masteryPct = mastery.total > 0 ? Math.round((mastery.acquired / mastery.total) * 100) : 0;
  const newCount = mastery.total - mastery.acquired - mastery.learning;
  const segPct = (n: number) => `${(n / mastery.total) * 100}%`;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {readPct > 0 && (
        <span className="flex items-center gap-1.5 text-[11px] text-foreground-subtle">
          <span className="h-1 w-12 overflow-hidden rounded-full bg-surface-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${readPct}%` }} />
          </span>
          {readPct}% lu
        </span>
      )}
      {mastery.total > 0 && (
        <span
          className="flex items-center gap-1.5 text-[11px] text-foreground-subtle"
          title={`${mastery.acquired} acquise${mastery.acquired > 1 ? "s" : ""} · ${mastery.learning} en cours · ${newCount} nouvelle${newCount > 1 ? "s" : ""}`}
        >
          <span className="flex h-1 w-12 overflow-hidden rounded-full bg-surface-muted">
            <span className="bg-success" style={{ width: segPct(mastery.acquired) }} />
            <span className="bg-accent" style={{ width: segPct(mastery.learning) }} />
          </span>
          {masteryPct}% maîtrisé
        </span>
      )}
    </div>
  );
}
