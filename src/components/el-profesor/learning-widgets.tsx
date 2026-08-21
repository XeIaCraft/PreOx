"use client";

import { useState } from "react";
import Link from "next/link";
import { Flame, Layers, ShieldAlert, Award, Trophy, BookCheck, Sparkles, BookOpen, GraduationCap, Star, Download, History, Tag, Check, Target, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { getDailyGoal, setDailyGoal, getWeeklyGoal, setWeeklyGoal } from "@/lib/el-profesor/local-prefs";
import { setBookmarkTags } from "@/app/apps/el-profesor/actions/bookmarks";
import { getWeaknessSynthesis } from "@/app/apps/el-profesor/actions/synthesis";
import type { ReviewActivitySummary, UpcomingForecastDay, BookmarkedEntity, OnThisDayNote, BookRecommendation } from "@/lib/el-profesor/dal";
import type { Flashcard } from "@/lib/el-profesor/types";

/** Quick-access list of the user's bookmarked fiches, filterable by personal tag (item 35 of the backlog). */
export function BookmarksList({ bookmarks }: { bookmarks: BookmarkedEntity[] }) {
  const [tagsBySubEntity, setTagsBySubEntity] = useState(() => new Map(bookmarks.map((b) => [b.subEntityId, b.tags])));
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (bookmarks.length === 0) return null;

  const allTags = [...new Set([...tagsBySubEntity.values()].flat())].sort();
  const visible = activeTag ? bookmarks.filter((b) => tagsBySubEntity.get(b.subEntityId)?.includes(activeTag)) : bookmarks;

  function startEditing(b: BookmarkedEntity) {
    setEditingId(b.subEntityId);
    setDraft((tagsBySubEntity.get(b.subEntityId) ?? []).join(", "));
  }

  function saveTags(subEntityId: string) {
    const tags = draft
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    setTagsBySubEntity((prev) => new Map(prev).set(subEntityId, tags));
    setEditingId(null);
    setBookmarkTags(subEntityId, tags);
  }

  return (
    <div className="mt-6 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
        <Star className="h-3.5 w-3.5 fill-accent text-accent" /> Mes favoris
      </p>

      {allTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={`rounded-full px-2 py-0.5 text-[11px] ${!activeTag ? "bg-primary-tint text-primary-strong" : "text-foreground-subtle hover:bg-surface-muted"}`}
          >
            Tous
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag((t) => (t === tag ? null : tag))}
              className={`rounded-full px-2 py-0.5 text-[11px] ${activeTag === tag ? "bg-primary-tint text-primary-strong" : "text-foreground-subtle hover:bg-surface-muted"}`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 space-y-1">
        {visible.map((b) => {
          const tags = tagsBySubEntity.get(b.subEntityId) ?? [];
          return (
            <div key={b.subEntityId} className="rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-surface-muted">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/apps/el-profesor/chapters/${b.chapterId}?entity=${b.subEntityId}`} className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{b.subEntityName}</p>
                  <p className="text-xs text-foreground-subtle">
                    {b.bookTitle} — {b.chapterTitle}
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={() => (editingId === b.subEntityId ? saveTags(b.subEntityId) : startEditing(b))}
                  className="shrink-0 text-foreground-subtle hover:text-accent"
                  aria-label={editingId === b.subEntityId ? "Enregistrer les tags" : "Modifier les tags"}
                  title={editingId === b.subEntityId ? "Enregistrer les tags" : "Modifier les tags"}
                >
                  {editingId === b.subEntityId ? <Check className="h-3.5 w-3.5" /> : <Tag className="h-3.5 w-3.5" />}
                </button>
              </div>
              {editingId === b.subEntityId ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTags(b.subEntityId);
                  }}
                  onBlur={() => saveTags(b.subEntityId)}
                  placeholder="tags séparés par des virgules"
                  className="mt-1 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                />
              ) : (
                tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] text-foreground-subtle">
                        {tag}
                      </span>
                    ))}
                  </div>
                )
              )}
            </div>
          );
        })}
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

function timeAgoLabel(createdAt: string): string {
  const days = Math.round((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  const months = Math.round(days / 30.44);
  if (months >= 12) {
    const years = Math.round(months / 12);
    return years > 1 ? `il y a ${years} ans` : "il y a 1 an";
  }
  return months > 1 ? `il y a ${months} mois` : "il y a 1 mois";
}

/** "Ce jour-là" — resurfaces one personal note written months/years ago, item 36 of the backlog. */
export function OnThisDayNoteCard({ note }: { note: OnThisDayNote }) {
  return (
    <Link
      href={`/apps/el-profesor/chapters/${note.chapterId}?entity=${note.subEntityId}`}
      className="mt-6 block rounded-[var(--radius-lg)] border border-border bg-surface p-4 hover:border-accent/40"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
        <History className="h-3 w-3" /> Ce jour-là — {timeAgoLabel(note.createdAt)}
      </p>
      <p className="mt-1.5 text-sm font-medium text-foreground">{note.subEntityName}</p>
      <p className="mt-1 line-clamp-3 text-sm text-foreground-muted">{note.content}</p>
      <p className="mt-1 text-xs text-foreground-subtle">
        {note.bookTitle} — {note.chapterTitle}
      </p>
    </Link>
  );
}

const WEEKLY_GOAL_PRESETS = [3, 5, 7];

/** Personal weekly-regularity target, tracked against actual days active this week — item 21 of the backlog. */
function WeeklyRegularityGoal({ activeDays }: { activeDays: number }) {
  const [goal, setGoalState] = useState(() => getWeeklyGoal());
  const met = activeDays >= goal;

  function cycleGoal() {
    const idx = WEEKLY_GOAL_PRESETS.indexOf(goal);
    const next = WEEKLY_GOAL_PRESETS[(idx + 1) % WEEKLY_GOAL_PRESETS.length] ?? WEEKLY_GOAL_PRESETS[0];
    setGoalState(next);
    setWeeklyGoal(next);
  }

  return (
    <button
      type="button"
      onClick={cycleGoal}
      className="mt-1.5 flex items-center gap-1.5 text-xs"
      title="Objectif de régularité hebdomadaire — cliquer pour changer"
    >
      <Target className={`h-3.5 w-3.5 ${met ? "text-success" : "text-foreground-subtle"}`} />
      <span className={met ? "text-success" : "text-foreground-subtle"}>
        Régularité : {activeDays}/{goal} jour{goal > 1 ? "s" : ""} actifs cette semaine (objectif)
      </span>
    </button>
  );
}

/** On-demand AI synthesis of the user's current weak points — item 19 of the backlog. */
function WeaknessSynthesisButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleOpen() {
    setOpen(true);
    if (text || loading) return;
    setLoading(true);
    setError(null);
    getWeaknessSynthesis().then((result) => {
      setLoading(false);
      if ("error" in result) setError(result.error);
      else setText(result.text);
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={handleOpen}>
        <Sparkles className="h-3.5 w-3.5" /> Synthèse IA
      </Button>
      {open && (
        <Modal title="Synthèse de mes points faibles" description="Générée à partir de vos cartes actuellement difficiles, toutes chapitres confondus." onClose={() => setOpen(false)} size="md">
          {loading && <p className="text-sm text-foreground-subtle">Analyse en cours…</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
          {text && <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</div>}
        </Modal>
      )}
    </>
  );
}

/** "Recommandé par les autres utilisateurs" — item 29 of the backlog. */
export function BookRecommendationCard({ recommendation }: { recommendation: BookRecommendation }) {
  return (
    <Link
      href={`/apps/el-profesor/chapters/${recommendation.firstChapterId}`}
      className="mt-6 block rounded-[var(--radius-lg)] border border-border bg-surface p-4 hover:border-accent/40"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
        <Users className="h-3 w-3" /> Recommandé par d&apos;autres utilisateurs
      </p>
      <p className="mt-1.5 text-sm font-medium text-foreground">{recommendation.bookTitle}</p>
      <p className="mt-1 text-xs text-foreground-subtle">
        {recommendation.otherUsersEngaged} autre{recommendation.otherUsersEngaged > 1 ? "s" : ""} utilisateur
        {recommendation.otherUsersEngaged > 1 ? "s" : ""} y révise{recommendation.otherUsersEngaged > 1 ? "nt" : ""} déjà — vous ne l&apos;avez
        pas encore commencé.
      </p>
    </Link>
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
    <>
      {/* Mobile: condensed horizontally-scrollable row, so the widgets don't push
          the book list far down the screen — the full layout below stays for sm+. */}
      <div className="mt-6 flex gap-2.5 overflow-x-auto pb-1 sm:hidden">
        <div className="flex shrink-0 items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-surface px-3 py-2">
          <Flame className="h-4 w-4 text-accent" />
          <span className="text-xs font-medium text-foreground">
            {activity.currentStreak > 0 ? `${activity.currentStreak} j. de suite` : "Pas de série"}
          </span>
        </div>
        <div className="shrink-0 rounded-[var(--radius-lg)] border border-border bg-surface px-1 py-1">
          <DailyGoalRing todayCount={todayCount} />
        </div>
        {globalDueCount > 0 && (
          <Link
            href="/apps/el-profesor/review?mode=due"
            className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-lg)] border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground"
          >
            <Layers className="h-3.5 w-3.5" /> Révision ({globalDueCount})
          </Link>
        )}
        {difficultCount > 0 && (
          <Link
            href="/apps/el-profesor/review?mode=difficult"
            className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-lg)] border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground"
          >
            <ShieldAlert className="h-3.5 w-3.5" /> Erreurs ({difficultCount})
          </Link>
        )}
        <div className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-lg)] border border-border bg-surface px-3 py-2 text-xs text-foreground-subtle">
          <Award className="h-3.5 w-3.5" /> {earnedCount}/{badges.length} badges
        </div>
      </div>

      <div className="mt-6 hidden rounded-[var(--radius-lg)] border border-border bg-surface p-4 sm:block">
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
      <WeeklyRegularityGoal activeDays={activeDays} />
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
          {difficultCount > 0 && <WeaknessSynthesisButton />}
        </div>
      )}
      </div>
    </>
  );
}
