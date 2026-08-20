"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X, PartyPopper, Undo2, Info, Keyboard, Timer, Square, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { submitReview, undoReview } from "@/app/apps/el-profesor/actions/review";
import { FlagButton } from "@/components/el-profesor/flag-button";
import { ShortcutsDialog } from "@/components/el-profesor/shortcuts-dialog";
import { useToast } from "@/components/ui/toast";
import type { Flashcard, ReviewSource, ReviewState } from "@/lib/el-profesor/types";

interface LastAction {
  index: number;
  flashcardId: string;
  logId: string;
  previousState: ReviewState | null | undefined;
  rating: "again" | "good";
  front: string;
}

const POMODORO_FOCUS_MS = 25 * 60_000;
const POMODORO_BREAK_MS = 5 * 60_000;

/** Self-contained focus timer for review sessions — 25 min focus, 5 min break, repeating until stopped. Purely a client-side nudge, no persistence. */
function PomodoroTimer({ toast }: { toast: (message: string, opts?: { variant?: "success" | "error" }) => void }) {
  const [phase, setPhase] = useState<"idle" | "focus" | "break">("idle");
  const [remainingMs, setRemainingMs] = useState(POMODORO_FOCUS_MS);

  useEffect(() => {
    if (phase === "idle") return;
    const interval = setInterval(() => {
      setRemainingMs((ms) => {
        if (ms > 1000) return ms - 1000;
        const nextPhase = phase === "focus" ? "break" : "focus";
        toast(phase === "focus" ? "Pomodoro terminé — pause de 5 minutes." : "Pause terminée — retour à la révision.", { variant: "success" });
        setPhase(nextPhase);
        return nextPhase === "focus" ? POMODORO_FOCUS_MS : POMODORO_BREAK_MS;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, toast]);

  function toggle() {
    if (phase === "idle") {
      setPhase("focus");
      setRemainingMs(POMODORO_FOCUS_MS);
    } else {
      setPhase("idle");
    }
  }

  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);

  return (
    <div className="flex items-center gap-1">
      {phase !== "idle" && (
        <span className={`text-xs tabular-nums ${phase === "break" ? "text-success" : "text-foreground-subtle"}`}>
          {minutes}:{seconds.toString().padStart(2, "0")}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="hidden sm:inline-flex"
        onClick={toggle}
        aria-label={phase === "idle" ? "Démarrer un Pomodoro (25 min)" : "Arrêter le Pomodoro"}
        title="Minuteur Pomodoro (25 min de focus / 5 min de pause)"
      >
        {phase === "idle" ? <Timer className="h-4 w-4" /> : <Square className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
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
  const [tally, setTally] = useState({ again: 0, good: 0 });
  const [struggled, setStruggled] = useState<string[]>([]);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dictationMode, setDictationMode] = useState(false);
  const [dictationInput, setDictationInput] = useState("");
  const revealedAtRef = useRef<number | null>(null);
  // Picked once per session mount so it stays stable across re-renders but varies session to session.
  const [completionMessage] = useState(() => COMPLETION_MESSAGES[Math.floor(Math.random() * COMPLETION_MESSAGES.length)]);
  const swipeStartX = useRef<number | null>(null);

  const current = cards[index];

  function handleRate(rating: "again" | "good") {
    if (!current) return;
    const answeredIndex = index;
    const durationMs = revealedAtRef.current != null ? Date.now() - revealedAtRef.current : undefined;
    revealedAtRef.current = null;
    startTransition(async () => {
      const result = await submitReview(current.id, rating, source, durationMs);
      if (result.error || !result.logId) {
        toast(result.error ?? "Impossible d'enregistrer cette révision.", { variant: "error" });
        return;
      }
      setLastAction({
        index: answeredIndex,
        flashcardId: current.id,
        logId: result.logId,
        previousState: result.previousState,
        rating,
        front: current.front.text,
      });
      setDone((d) => d + 1);
      setTally((t) => (rating === "again" ? { ...t, again: t.again + 1 } : { ...t, good: t.good + 1 }));
      if (rating === "again") setStruggled((s) => [...s, current.front.text]);
      setRevealed(false);
      setDictationInput("");
      setIndex((i) => i + 1);
    });
  }

  function handleRestart() {
    setIndex(0);
    setRevealed(false);
    setDictationInput("");
    setDone(0);
    setTally({ again: 0, good: 0 });
    setStruggled([]);
    setLastAction(null);
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
      setTally((t) =>
        lastAction.rating === "again" ? { ...t, again: Math.max(0, t.again - 1) } : { ...t, good: Math.max(0, t.good - 1) }
      );
      if (lastAction.rating === "again") setStruggled((s) => s.filter((f) => f !== lastAction.front));
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
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (!current || isPending) return;
      if (!revealed && e.key === " ") {
        e.preventDefault();
        setRevealed(true);
        revealedAtRef.current = Date.now();
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
        {done > 0 && (
          <p className="mt-1 text-xs text-foreground-subtle">
            <span className="text-success">{tally.good} correcte{tally.good > 1 ? "s" : ""}</span>
            {" · "}
            <span className="text-danger">{tally.again} à revoir</span>
          </p>
        )}
        {struggled.length > 0 && (
          <div className="mt-4 rounded-[var(--radius-md)] border border-border bg-surface-muted p-3 text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Points à retravailler</p>
            <ul className="mt-1.5 space-y-1 text-sm text-foreground-muted">
              {struggled.slice(0, 5).map((front, i) => (
                <li key={i} className="line-clamp-1">
                  • {front}
                </li>
              ))}
              {struggled.length > 5 && <li className="text-xs text-foreground-subtle">+ {struggled.length - 5} autre(s)</li>}
            </ul>
          </div>
        )}
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link href="/apps/el-profesor">
            <Button>Retour à la bibliothèque</Button>
          </Link>
          {done > 0 && (
            <Button variant="secondary" onClick={handleRestart}>
              Recommencer
            </Button>
          )}
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
          <PomodoroTimer toast={toast} />
          <Button
            variant={dictationMode ? "secondary" : "ghost"}
            size="icon"
            className="hidden sm:inline-flex"
            onClick={() => {
              setDictationMode((m) => !m);
              setDictationInput("");
            }}
            aria-label={dictationMode ? "Désactiver le mode dictée" : "Activer le mode dictée"}
            title="Mode dictée : tapez la réponse au clavier plutôt que de la deviner"
          >
            <PenLine className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex"
            onClick={() => setShortcutsOpen(true)}
            aria-label="Raccourcis clavier"
            title="Raccourcis clavier (?)"
          >
            <Keyboard className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${((index + (revealed ? 0.5 : 0)) / cards.length) * 100}%` }}
        />
      </div>

      {cappedFrom && chapterId && (
        <p className="mt-2 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-xs text-foreground-subtle">
          <span>
            Session limitée à {cards.length} cartes sur {cappedFrom} —
          </span>
          {[10, 20, 30]
            .filter((n) => n !== cards.length && n < cappedFrom)
            .map((n) => (
              <Link
                key={n}
                href={`/apps/el-profesor/chapters/${chapterId}/review?mode=free&limit=${n}`}
                className="underline hover:text-foreground"
              >
                {n} cartes
              </Link>
            ))}
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

      <div className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {!revealed && dictationMode ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setRevealed(true);
              revealedAtRef.current = Date.now();
            }}
            className="space-y-2"
          >
            <input
              autoFocus
              value={dictationInput}
              onChange={(e) => setDictationInput(e.target.value)}
              placeholder="Tapez votre réponse…"
              className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            <Button type="submit" className="w-full" size="lg">
              Vérifier
            </Button>
          </form>
        ) : !revealed ? (
          <Button
            className="w-full"
            size="lg"
            onClick={() => {
              setRevealed(true);
              revealedAtRef.current = Date.now();
            }}
          >
            Afficher la réponse
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {dictationMode && dictationInput.trim() && (
              <p className="col-span-2 -mt-1 mb-1 text-center text-xs text-foreground-subtle">
                Votre réponse : <span className="italic">{dictationInput}</span>
              </p>
            )}
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
