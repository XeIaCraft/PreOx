"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X, PartyPopper, Undo2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { submitReview, undoReview } from "@/app/apps/el-profesor/actions/review";
import { FlagButton } from "@/components/el-profesor/flag-button";
import { useToast } from "@/components/ui/toast";
import type { Flashcard, ReviewSource, ReviewState } from "@/lib/el-profesor/types";

interface LastAction {
  index: number;
  flashcardId: string;
  logId: string;
  previousState: ReviewState | null | undefined;
}

const COMPLETION_MESSAGES = [
  "Session terminée",
  "Bravo, encore une session de faite",
  "Belle constance",
  "Une révision de plus dans la mémoire à long terme",
  "C'est dans la boîte",
];

export function FlashcardReviewer({
  chapterId,
  source,
  cards,
  cappedFrom,
  badgeLabel,
  emptyMessage,
}: {
  chapterId?: string;
  source: ReviewSource;
  cards: Flashcard[];
  cappedFrom?: number | null;
  /** Overrides the "Planifiée"/"Libre" badge — used by cross-chapter modes (révision globale, carnet d'erreurs). */
  badgeLabel?: string;
  /** Overrides the default "nothing to review" copy. */
  emptyMessage?: string;
}) {
  const backHref = chapterId ? `/apps/el-profesor/chapters/${chapterId}` : "/apps/el-profesor";
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  // Picked once per session mount so it stays stable across re-renders but varies session to session.
  const [completionMessage] = useState(() => COMPLETION_MESSAGES[Math.floor(Math.random() * COMPLETION_MESSAGES.length)]);
  const swipeStartX = useRef<number | null>(null);

  const current = cards[index];

  function handleRate(rating: "again" | "good") {
    if (!current) return;
    const answeredIndex = index;
    startTransition(async () => {
      const result = await submitReview(current.id, rating, source);
      if (result.error || !result.logId) {
        toast(result.error ?? "Impossible d'enregistrer cette révision.", { variant: "error" });
        return;
      }
      setLastAction({ index: answeredIndex, flashcardId: current.id, logId: result.logId, previousState: result.previousState });
      setDone((d) => d + 1);
      setRevealed(false);
      setIndex((i) => i + 1);
    });
  }

  function handleUndo() {
    if (!lastAction) return;
    startTransition(async () => {
      const result = await undoReview(lastAction.flashcardId, lastAction.logId, source, lastAction.previousState ?? null);
      if (result.error) {
        toast(result.error, { variant: "error" });
        return;
      }
      setDone((d) => Math.max(0, d - 1));
      setIndex(lastAction.index);
      setRevealed(true);
      setLastAction(null);
    });
  }

  // Desktop keyboard shortcuts: space reveals, ←/1 and →/2 rate once
  // revealed, Ctrl/Cmd+Z undoes the last answer. Skipped while a text field
  // has focus (e.g. the "signaler une erreur" textarea).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (lastAction) {
          e.preventDefault();
          handleUndo();
        }
        return;
      }
      if (!current || isPending) return;
      if (!revealed && e.key === " ") {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && (e.key === "ArrowLeft" || e.key === "1")) {
        e.preventDefault();
        handleRate("again");
      } else if (revealed && (e.key === "ArrowRight" || e.key === "2")) {
        e.preventDefault();
        handleRate("good");
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, revealed, isPending, lastAction]);

  function handleCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch") return;
    swipeStartX.current = e.clientX;
  }

  function handleCardPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const startX = swipeStartX.current;
    swipeStartX.current = null;
    if (e.pointerType !== "touch" || startX === null || !revealed || isPending) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) < 70) return;
    handleRate(dx > 0 ? "good" : "again");
  }

  const undoButton = lastAction && (
    <Button variant="ghost" size="sm" onClick={handleUndo} disabled={isPending}>
      <Undo2 className="h-3.5 w-3.5" /> Annuler
    </Button>
  );

  if (cards.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-foreground-muted">
          {emptyMessage ??
            (source === "scheduled" ? "Rien à réviser aujourd'hui pour ce chapitre." : "Aucune flashcard publiée pour ce chapitre.")}
        </p>
        <Link href={backHref} className="mt-4 inline-block">
          <Button variant="secondary">{chapterId ? "Voir les fiches" : "Retour à la bibliothèque"}</Button>
        </Link>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <PartyPopper className="mx-auto h-8 w-8 animate-bounce text-primary-strong" />
        <p className="mt-3 text-lg font-medium text-foreground">{completionMessage}</p>
        <p className="mt-1 text-sm text-foreground-muted">{done} carte(s) révisée(s).</p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link href="/apps/el-profesor">
            <Button>Retour à la bibliothèque</Button>
          </Link>
          {undoButton}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col px-4 py-6">
      <div className="flex items-center justify-between">
        <Link href={backHref}>
          <Button variant="ghost" size="icon" aria-label="Retour">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          {undoButton}
          <Badge variant={source === "scheduled" ? "primary" : "neutral"}>
            {badgeLabel ?? (source === "scheduled" ? "Planifiée" : "Libre")}
          </Badge>
          {source === "scheduled" && (
            <button
              type="button"
              className="text-foreground-subtle hover:text-foreground"
              title="Répétition espacée : chaque carte revient juste avant que vous ne risquiez de l'oublier. Répondre « Incorrect » la fait revenir plus vite, « Correct » espace l'intervalle suivant — plus fiable pour la mémoire à long terme qu'une simple relecture."
              aria-label="Comment fonctionne la planification des révisions"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          )}
          <span className="text-xs text-foreground-subtle">
            {index + 1} / {cards.length}
          </span>
        </div>
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${((index + (revealed ? 0.5 : 0)) / cards.length) * 100}%` }}
        />
      </div>

      {cappedFrom && chapterId && (
        <p className="mt-2 text-center text-xs text-foreground-subtle">
          Session limitée à {cards.length} cartes sur {cappedFrom}.{" "}
          <Link href={`/apps/el-profesor/chapters/${chapterId}/review?mode=free&all=1`} className="underline hover:text-foreground">
            Tout réviser
          </Link>
        </p>
      )}

      <div className="flex flex-1 items-center justify-center [perspective:1200px]">
        <div
          className="relative min-h-[220px] w-full touch-pan-y"
          onPointerDown={handleCardPointerDown}
          onPointerUp={handleCardPointerUp}
        >
          <div
            className={`relative h-full min-h-[220px] w-full transition-transform duration-500 [transform-style:preserve-3d] ${
              revealed ? "[transform:rotateY(180deg)]" : ""
            }`}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-surface p-8 text-center shadow-sm [backface-visibility:hidden]">
              <p className="text-lg text-foreground">{current.front.text}</p>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto rounded-[var(--radius-lg)] border border-primary/30 bg-surface p-8 text-center shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)]">
              {revealed && (
                <div className="absolute right-3 top-3">
                  <FlagButton targetType="flashcard" targetId={current.id} />
                </div>
              )}
              <p className="text-lg font-medium text-primary-strong">{current.back.text}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="pb-4">
        {!revealed ? (
          <Button className="w-full" size="lg" onClick={() => setRevealed(true)}>
            Afficher la réponse
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" onClick={() => handleRate("again")} disabled={isPending}>
              <X className="h-4 w-4" /> Incorrect
            </Button>
            <Button size="lg" onClick={() => handleRate("good")} disabled={isPending}>
              <Check className="h-4 w-4" /> Correct
            </Button>
          </div>
        )}
        <p className="mt-2 hidden text-center text-xs text-foreground-subtle sm:block">
          Espace pour révéler · ← / → pour répondre · Ctrl+Z / ⌘Z pour annuler
        </p>
      </div>
    </div>
  );
}
