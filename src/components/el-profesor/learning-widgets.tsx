"use client";

import { useState } from "react";
import Link from "next/link";
import { Flame, Layers, ShieldAlert, Award, Trophy, BookCheck, Sparkles, BookOpen, GraduationCap, Star, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDailyGoal, setDailyGoal } from "@/lib/el-profesor/local-prefs";
import type { ReviewActivitySummary, UpcomingForecastDay, BookmarkedEntity } from "@/lib/el-profesor/dal";
import type { Flashcard } from "@/lib/el-profesor/types";

/** Quick-access list of the user's bookmarked fiches, when there are any. */
export function BookmarksList({ bookmarks }: { bookmarks: BookmarkedEntity[] }) {
  if (bookmarks.length === 0) return null;
  return (
    <div className="mt-6 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
        <Star className="h-3.5 w-3.5 fill-accent text-accent" /> Mes favoris
      </p>
      <div className="mt-2 space-y-1">
        {bookmarks.map((b) => (
          <Link
            key={b.subEntityId}
            href={`/apps/el-profesor/chapters/${b.chapterId}?entity=${b.subEntityId}`}
            className="block rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-surface-muted"
          >
            <p className="text-sm font-medium text-foreground">{b.subEntityName}</p>
            <p className="text-xs text-foreground-subtle">
              {b.bookTitle} — {b.chapterTitle}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

const GOAL_PRESETS = [10, 15, 20, 30];

function DailyGoalRing({ todayCount }: { todayCount: number }) {
  const [goal, setGoalState] = useState(() => getDailyGoal());
  const pct = Math.min(100, Math.round((todayCount / goal) * 100));

  function cycleGoal() {
    const idx = GOAL_PRESETS.indexOf(goal);
    const next = GOAL_PRESETS[(idx + 1) % GOAL_PRESETS.length] ?? GOAL_PRESETS[0];
    setGoalState(next);
    setDailyGoal(next);
  }

  return (
    <button
      type="button"
      onClick={cycleGoal}
      className="flex items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 hover:bg-surface-muted"
      title="Objectif quotidien — cliquer pour changer"
    >
      <span
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(var(--primary) ${pct}%, var(--surface-muted) ${pct}%)` }}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-[9px] font-medium text-foreground">
          {todayCount}
        </span>
      </span>
      <span className="text-left">
        <p className="text-xs font-medium text-foreground">Objectif du jour</p>
        <p className="text-[11px] text-foreground-subtle">
          {todayCount} / {goal} cartes
        </p>
      </span>
    </button>
  );
}

/**
 * Passive daily refresher: one already-mastered card, click to check your
 * recall. Purely for a light retrieval-practice nudge on the dashboard —
 * doesn't touch FSRS scheduling, so there's nothing to grade here.
 */
export function DailyCard({ card }: { card: Flashcard }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setRevealed((r) => !r)}
      className="mt-6 block w-full rounded-[var(--radius-lg)] border border-accent/30 bg-accent-tint px-4 py-3.5 text-left"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-accent">
        <Sparkles className="h-3 w-3" /> Carte du jour
      </p>
      <p className="mt-1.5 text-sm text-foreground">{card.front.text}</p>
      {revealed ? (
        <p className="mt-2 border-t border-accent/20 pt-2 text-sm font-medium text-accent">{card.back.text}</p>
      ) : (
        <p className="mt-1 text-xs text-foreground-subtle">Touchez pour voir la réponse</p>
      )}
    </button>
  );
}

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

/** Small header stat strip — how much material the library actually holds. */
export function LibraryStats({
  totalBooks,
  totalChapters,
  totalFlashcards,
}: {
  totalBooks: number;
  totalChapters: number;
  totalFlashcards: number;
}) {
  const stats = [
    { icon: BookOpen, value: totalBooks, label: totalBooks > 1 ? "livres" : "livre" },
    { icon: GraduationCap, value: totalChapters, label: totalChapters > 1 ? "chapitres publiés" : "chapitre publié" },
    { icon: Layers, value: totalFlashcards, label: totalFlashcards > 1 ? "flashcards" : "flashcard" },
  ];
  return (
    <div className="mt-6 flex flex-wrap gap-4 text-sm text-foreground-muted">
      {stats.map((s, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <s.icon className="h-3.5 w-3.5 text-foreground-subtle" />
          <span className="font-medium text-foreground">{s.value}</span> {s.label}
        </span>
      ))}
    </div>
  );
}

function formatReviewDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} h ${minutes.toString().padStart(2, "0")}`;
  return `${minutes} min`;
}

export function LearningWidgets({
  activity,
  forecast,
  globalDueCount,
  difficultCount,
  totalAcquired,
  chaptersMastered,
  reviewTimeStats,
}: {
  activity: ReviewActivitySummary;
  forecast?: UpcomingForecastDay[];
  globalDueCount: number;
  difficultCount: number;
  totalAcquired: number;
  chaptersMastered: number;
  reviewTimeStats?: { totalMs: number; last7DaysMs: number };
}) {
  const totalActiveDays = activity.last12Weeks.filter((d) => d.count > 0).length;
  const badges: Badge[] = [
    { earned: activity.currentStreak >= 3, icon: Flame, label: "3 jours de suite" },
    { earned: activity.longestStreak >= 7, icon: Flame, label: "7 jours de suite" },
    { earned: activity.longestStreak >= 14, icon: Flame, label: "14 jours de suite" },
    { earned: totalAcquired >= 50, icon: Award, label: "50 cartes maîtrisées" },
    { earned: totalAcquired >= 200, icon: Trophy, label: "200 cartes maîtrisées" },
    { earned: totalAcquired >= 500, icon: GraduationCap, label: "500 cartes maîtrisées" },
    { earned: chaptersMastered >= 1, icon: BookCheck, label: "1 chapitre maîtrisé" },
    { earned: chaptersMastered >= 3, icon: BookCheck, label: "3 chapitres maîtrisés" },
    { earned: totalActiveDays >= 30, icon: Star, label: "30 jours d'activité" },
  ];
  const earnedCount = badges.filter((b) => b.earned).length;

  const last7 = activity.last12Weeks.slice(-7);
  const weekCount = last7.reduce((sum, d) => sum + d.count, 0);
  const activeDays = last7.filter((d) => d.count > 0).length;
  const todayCount = activity.last12Weeks[activity.last12Weeks.length - 1]?.count ?? 0;

  function handleExportActivity() {
    const header = ["Date", "Cartes révisées"];
    const rows = activity.last12Weeks.map((d) => [d.date, String(d.count)]);
    const csv = [header, ...rows].map((row) => row.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "el-profesor-activite.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

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
        <DailyGoalRing todayCount={todayCount} />
        <ActivityHeatmap days={activity.last12Weeks} />
        <button
          type="button"
          onClick={handleExportActivity}
          title="Exporter mon activité en CSV"
          aria-label="Exporter mon activité en CSV"
          className="rounded p-1.5 text-foreground-subtle hover:bg-surface-muted hover:text-foreground"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>

      {weekCount > 0 && (
        <p className="mt-3 text-xs text-foreground-subtle">
          Cette semaine : {weekCount} carte{weekCount > 1 ? "s" : ""} révisée{weekCount > 1 ? "s" : ""} sur {activeDays} jour
          {activeDays > 1 ? "s" : ""}
          {reviewTimeStats && reviewTimeStats.last7DaysMs > 0 ? ` — ${formatReviewDuration(reviewTimeStats.last7DaysMs)} de révision` : ""}.
        </p>
      )}
      {reviewTimeStats && reviewTimeStats.totalMs > 0 && (
        <p className="text-xs text-foreground-subtle">Temps total investi : {formatReviewDuration(reviewTimeStats.totalMs)}.</p>
      )}

      {forecast && forecast.some((d) => d.count > 0) && (
        <div className="mt-4 border-t border-border pt-3.5">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">Prévision — 7 prochains jours</p>
          <div className="flex items-end gap-1.5">
            {(() => {
              const max = Math.max(1, ...forecast.map((d) => d.count));
              return forecast.map((d, i) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t-sm ${d.count > 0 ? "bg-primary/70" : "bg-surface-muted"}`}
                    style={{ height: `${Math.max(4, (d.count / max) * 32)}px` }}
                    title={`${d.count} carte${d.count > 1 ? "s" : ""}`}
                  />
                  <span className="text-[10px] text-foreground-subtle">
                    {i === 0 ? "Auj." : new Date(d.date).toLocaleDateString("fr-FR", { weekday: "short" })}
                  </span>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

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
