"use client";

import Link from "next/link";
import { Flame, Layers, ShieldAlert, Award, Trophy, BookCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReviewActivitySummary } from "@/lib/el-profesor/dal";

function ActivityHeatmap({ days }: { days: { date: string; count: number }[] }) {
  // Oldest-first list -> 12 columns (weeks) x 7 rows (days), left to right.
  const weeks: { date: string; count: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  function levelClass(count: number) {
    if (count === 0) return "bg-surface-muted";
    if (count < 5) return "bg-primary/30";
    if (count < 15) return "bg-primary/60";
    return "bg-primary";
  }

  return (
    <div className="flex gap-[3px] overflow-x-auto pb-1">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {week.map((day) => (
            <div
              key={day.date}
              title={`${day.date} — ${day.count} révision${day.count > 1 ? "s" : ""}`}
              className={`h-2.5 w-2.5 rounded-[2px] ${levelClass(day.count)}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface Badge {
  earned: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

export function LearningWidgets({
  activity,
  globalDueCount,
  difficultCount,
  totalAcquired,
  chaptersMastered,
}: {
  activity: ReviewActivitySummary;
  globalDueCount: number;
  difficultCount: number;
  totalAcquired: number;
  chaptersMastered: number;
}) {
  const badges: Badge[] = [
    { earned: activity.currentStreak >= 3, icon: Flame, label: "3 jours de suite" },
    { earned: activity.longestStreak >= 7, icon: Flame, label: "7 jours de suite" },
    { earned: totalAcquired >= 50, icon: Award, label: "50 cartes maîtrisées" },
    { earned: totalAcquired >= 200, icon: Trophy, label: "200 cartes maîtrisées" },
    { earned: chaptersMastered >= 1, icon: BookCheck, label: "1 chapitre maîtrisé" },
  ];
  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <div className="mt-6 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-tint text-accent">
            <Flame className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">
              {activity.currentStreak > 0 ? `${activity.currentStreak} jour${activity.currentStreak > 1 ? "s" : ""} de suite` : "Pas encore de série"}
            </p>
            <p className="text-xs text-foreground-subtle">Record : {activity.longestStreak} jour{activity.longestStreak > 1 ? "s" : ""}</p>
          </div>
        </div>
        <ActivityHeatmap days={activity.last12Weeks} />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {badges.map((b, i) => (
          <span
            key={i}
            title={b.label}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${
              b.earned ? "border-accent/40 bg-accent-tint text-accent" : "border-border text-foreground-subtle opacity-50"
            }`}
          >
            <b.icon className="h-3 w-3" /> {b.label}
          </span>
        ))}
        {earnedCount === 0 && <span className="text-[11px] text-foreground-subtle">Révisez pour débloquer vos premiers badges.</span>}
      </div>

      {(globalDueCount > 0 || difficultCount > 0) && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3.5">
          {globalDueCount > 0 && (
            <Link href="/apps/el-profesor/review?mode=due">
              <Button variant="secondary" size="sm">
                <Layers className="h-3.5 w-3.5" /> Révision globale ({globalDueCount})
              </Button>
            </Link>
          )}
          {difficultCount > 0 && (
            <Link href="/apps/el-profesor/review?mode=difficult">
              <Button variant="secondary" size="sm">
                <ShieldAlert className="h-3.5 w-3.5" /> Carnet d&apos;erreurs ({difficultCount})
              </Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
