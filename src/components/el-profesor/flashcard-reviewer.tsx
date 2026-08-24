"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X, PartyPopper, Undo2, Info, Keyboard, Timer, Square, PenLine, Maximize2, Minimize2, BellOff, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { submitReview, undoReview, excludeFlashcardFromReviews, type ReviewConfidence } from "@/app/apps/el-profesor/actions/review";
import { FlagButton } from "@/components/el-profesor/flag-button";
import { ShortcutsDialog } from "@/components/el-profesor/shortcuts-dialog";
import { useToast } from "@/components/ui/toast";
import { maskClozeText, splitClozeSegments } from "@/lib/el-profesor/cloze";
import type { Flashcard, ReviewSource, ReviewState, ImageOcclusion } from "@/lib/el-profesor/types";

/** A cloze passage with its blanked spans highlighted — the revealed side of a "flashcard à trous" (piste 2026-08-24). Plain text render when there's nothing to hide. */
function ClozeText({ text, ranges, hiddenClassName }: { text: string; ranges: { start: number; end: number }[]; hiddenClassName: string }) {
  const segments = splitClozeSegments(text, ranges);
  return (
    <>
      {segments.map((s, i) =>
        s.hidden ? (
          <mark key={i} className={hiddenClassName}>
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </>
  );
}

/**
 * A flashcard's image with its labeled zones masked (front, `revealed`
 * false) or revealed (back, `revealed` true) — "retrouve la légende",
 * follow-up to item 23. Plain image display (no occlusions) when the
 * flashcard has none, same as before this feature existed.
 */
function OcclusionImage({
  imageUrl,
  imageAlt,
  occlusions,
  revealed,
}: {
  imageUrl: string;
  imageAlt: string | null;
  occlusions: ImageOcclusion[];
  revealed: boolean;
}) {
  return (
    <div className="relative mb-3 inline-block max-w-full">
      {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset */}
      <img src={imageUrl} alt={imageAlt ?? ""} className="max-h-[40vh] max-w-full rounded-[var(--radius-sm)] object-contain" draggable={false} />
      {occlusions.map((o) => (
        <div
          key={o.id}
          className={`absolute flex items-center justify-center overflow-hidden rounded-sm text-[10px] font-medium leading-tight ${
            revealed ? "border-2 border-accent bg-accent/10 text-accent-strong" : "border-2 border-foreground bg-foreground"
          }`}
          style={{ left: `${o.x * 100}%`, top: `${o.y * 100}%`, width: `${o.width * 100}%`, height: `${o.height * 100}%` }}
        >
          {revealed && <span className="px-0.5 text-center">{o.label}</span>}
        </div>
      ))}
    </div>
  );
}

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

/** Randomly picks one wording to show for this session (item 47) — null variantId means the card's original front. Re-rolled fresh each session so repeated reviews of the same card accumulate data across wordings over time. */
function pickShownVariant(card: Flashcard): { variantId: string | null; text: string } {
  if (card.variants.length === 0) return { variantId: null, text: card.front.text };
  const pool = [{ variantId: null as string | null, text: card.front.text }, ...card.variants.map((v) => ({ variantId: v.id as string | null, text: v.text }))];
  return pool[Math.floor(Math.random() * pool.length)];
}

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
  // Mandatory self-assessment step inserted before every reveal (piste
  // 2026-08-24, "calibration de la confiance") — awaitingConfidence is true
  // between the reveal request and the user picking Hésitant(e)/Sûr(e).
  const [awaitingConfidence, setAwaitingConfidence] = useState(false);
  const [confidence, setConfidence] = useState<ReviewConfidence | null>(null);
  const [overconfidentMisses, setOverconfidentMisses] = useState(0);
  const [done, setDone] = useState(0);
  const [tally, setTally] = useState({ again: 0, good: 0 });
  const [struggled, setStruggled] = useState<string[]>([]);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dictationMode, setDictationMode] = useState(false);
  const [dictationInput, setDictationInput] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  // Mode audio mains libres (piste 2026-08-24) — narrowed to automatic
  // text-to-speech of the question/réponse via the Web Speech API's
  // SpeechSynthesis, deliberately without voice-command grading:
  // SpeechRecognition's browser support and accuracy are far less
  // consistent, and a mis-heard "correct"/"incorrect" would silently
  // corrupt the FSRS schedule — too risky to ship without live testing.
  // Reading the card aloud already covers the main use case (reviewing
  // without looking at the screen); rating still needs a tap/key/swipe.
  const [audioMode, setAudioMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const revealedAtRef = useRef<number | null>(null);
  // Picked once per session mount so it stays stable across re-renders but varies session to session.
  const [completionMessage] = useState(() => COMPLETION_MESSAGES[Math.floor(Math.random() * COMPLETION_MESSAGES.length)]);
  const swipeStartX = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const current = cards[index];
  // Computed once per mount (one session = one wording per card, re-rolled
  // on the next session) rather than per-render, same one-time-impure-read
  // pattern as `completionMessage` above.
  const [variantByCardId] = useState(() => new Map(cards.map((c) => [c.id, pickShownVariant(c)])));
  const shownVariant = current ? (variantByCardId.get(current.id) ?? { variantId: null, text: current.front.text }) : null;

  // Starts the mandatory confidence step rather than revealing directly —
  // shared by every reveal trigger (keyboard, tap, dictation, button).
  function requestReveal() {
    if (isPending || revealed || awaitingConfidence) return;
    setAwaitingConfidence(true);
  }

  function confirmReveal(c: ReviewConfidence) {
    setConfidence(c);
    setAwaitingConfidence(false);
    setRevealed(true);
    revealedAtRef.current = Date.now();
  }

  function handleRate(rating: "again" | "good") {
    if (!current) return;
    const answeredIndex = index;
    const durationMs = revealedAtRef.current != null ? Date.now() - revealedAtRef.current : undefined;
    revealedAtRef.current = null;
    const answeredConfidence = confidence;
    startTransition(async () => {
      const result = await submitReview(current.id, rating, source, durationMs, shownVariant?.variantId ?? null, answeredConfidence);
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
      if (rating === "again" && answeredConfidence === "sure") setOverconfidentMisses((n) => n + 1);
      setRevealed(false);
      setConfidence(null);
      setDictationInput("");
      setIndex((i) => i + 1);
    });
  }

  // Skips the card out of this session without recording a rating — never
  // affects other users, and it can be reinstated later from "Cartes exclues".
  function handleExclude() {
    if (!current) return;
    const excludedId = current.id;
    startTransition(async () => {
      const result = await excludeFlashcardFromReviews(excludedId);
      if (result.error) {
        toast(result.error, { variant: "error" });
        return;
      }
      toast("Carte exclue de vos révisions.", { variant: "success" });
      setRevealed(false);
      setAwaitingConfidence(false);
      setConfidence(null);
      setDictationInput("");
      setIndex((i) => i + 1);
    });
  }

  function toggleFocusMode() {
    if (!focusMode) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
      setFocusMode(true);
    } else {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      setFocusMode(false);
    }
  }

  // Keeps focusMode in sync if the user exits fullscreen via Esc/browser chrome rather than our own button.
  useEffect(() => {
    function handleFullscreenChange() {
      if (!document.fullscreenElement) setFocusMode(false);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  // Reads the question aloud on card show, then the answer once revealed —
  // the only two moments audio mode speaks (the confidence step and rating
  // stay silent, tap/key/swipe as usual).
  useEffect(() => {
    if (!audioMode || !current || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const text = revealed
      ? current.clozeRanges.length > 0
        ? current.back.text
          ? `${current.front.text}. ${current.back.text}`
          : current.front.text
        : current.back.text
      : current.clozeRanges.length > 0
        ? maskClozeText(current.front.text, current.clozeRanges, "trou")
        : (shownVariant?.text ?? current.front.text);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    window.speechSynthesis.speak(utterance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioMode, current?.id, revealed]);

  function handleRestart() {
    setIndex(0);
    setRevealed(false);
    setAwaitingConfidence(false);
    setConfidence(null);
    setOverconfidentMisses(0);
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
      if (!revealed && !awaitingConfidence && e.key === " ") {
        e.preventDefault();
        requestReveal();
      } else if (awaitingConfidence && (e.key === "ArrowLeft" || e.key === "1")) {
        e.preventDefault();
        confirmReveal("unsure");
      } else if (awaitingConfidence && (e.key === "ArrowRight" || e.key === "2")) {
        e.preventDefault();
        confirmReveal("sure");
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
  }, [current, revealed, awaitingConfidence, isPending, lastAction]);

  function handleCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch" || !revealed || isPending) return;
    swipeStartX.current = e.clientX;
    setDragging(true);
  }

  function handleCardPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (swipeStartX.current === null) return;
    setDragX(e.clientX - swipeStartX.current);
  }

  function handleCardPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const startX = swipeStartX.current;
    swipeStartX.current = null;
    setDragging(false);
    setDragX(0);
    if (e.pointerType !== "touch" || startX === null || !revealed || isPending) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) < 70) return;
    handleRate(dx > 0 ? "good" : "again");
  }

  function handleCardPointerCancel() {
    swipeStartX.current = null;
    setDragging(false);
    setDragX(0);
  }

  // Tapping the card itself flips it — mirrors the "Afficher la réponse"
  // button so the card (the dominant element on mobile) is directly
  // actionable, rather than requiring a precise tap on the button below it.
  function handleCardClick() {
    if (isPending || revealed || awaitingConfidence) return;
    requestReveal();
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
        {overconfidentMisses > 0 && (
          <p className="mt-3 text-xs text-danger">
            {overconfidentMisses} carte{overconfidentMisses > 1 ? "s" : ""} où vous étiez sûr(e) mais vous vous êtes trompé(e) — le signal le
            plus important à corriger.
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
    <div ref={containerRef} className={`mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col bg-background px-4 py-6 ${focusMode ? "justify-center" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-y-1.5">
        {!focusMode && (
          <Link href={backHref}>
            <Button variant="ghost" size="icon" aria-label="Retour">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
        )}
        <div className={`flex flex-wrap items-center gap-2 ${focusMode ? "w-full justify-between" : "justify-end"}`}>
          {!focusMode && (
            <>
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
            </>
          )}
          <span className="text-xs text-foreground-subtle">
            {index + 1} / {cards.length}
          </span>
          {!focusMode && (
            <>
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
            </>
          )}
          <Button
            variant={audioMode ? "secondary" : "ghost"}
            size="icon"
            onClick={() => {
              if (!audioMode && !(typeof window !== "undefined" && "speechSynthesis" in window)) {
                toast("Lecture vocale non prise en charge par ce navigateur.", { variant: "error" });
                return;
              }
              setAudioMode((m) => !m);
            }}
            aria-label={audioMode ? "Désactiver le mode audio" : "Activer le mode audio"}
            title="Mode audio : la question puis la réponse sont lues à voix haute automatiquement — évaluer reste tactile/clavier"
          >
            {audioMode ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFocusMode}
            aria-label={focusMode ? "Quitter le mode focus" : "Mode focus plein écran"}
            title={focusMode ? "Quitter le mode focus" : "Mode focus plein écran, sans distraction"}
          >
            {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
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

      {!focusMode && cappedFrom && chapterId && (
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
          className={`relative min-h-[min(220px,45vh)] w-full touch-pan-y ${!revealed ? "cursor-pointer" : ""}`}
          onPointerDown={handleCardPointerDown}
          onPointerMove={handleCardPointerMove}
          onPointerUp={handleCardPointerUp}
          onPointerCancel={handleCardPointerCancel}
          onClick={handleCardClick}
          style={{
            transform: dragX ? `translateX(${dragX}px) rotate(${dragX / 24}deg)` : undefined,
            transition: dragging ? "none" : "transform 0.25s ease",
          }}
        >
          <div
            className={`relative h-full min-h-[min(220px,45vh)] w-full transition-transform duration-500 [transform-style:preserve-3d] ${
              revealed ? "[transform:rotateY(180deg)]" : ""
            }`}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-surface p-8 text-center shadow-sm [backface-visibility:hidden]">
              {current.imageUrl && (
                <OcclusionImage imageUrl={current.imageUrl} imageAlt={current.imageAlt} occlusions={current.imageOcclusions} revealed={false} />
              )}
              <p className="text-lg text-foreground">
                {current.clozeRanges.length > 0 ? maskClozeText(current.front.text, current.clozeRanges) : (shownVariant?.text ?? current.front.text)}
              </p>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto rounded-[var(--radius-lg)] border border-primary/30 bg-surface p-8 text-center shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)]">
              {revealed && (
                <div className="absolute right-3 top-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExclude}
                    disabled={isPending}
                    className="text-foreground-subtle transition-colors hover:text-danger"
                    aria-label="Exclure cette carte de mes révisions"
                    title="Exclure cette carte de mes révisions"
                  >
                    <BellOff className="h-3.5 w-3.5" />
                  </button>
                  <FlagButton targetType="flashcard" targetId={current.id} />
                </div>
              )}
              {current.imageUrl && current.imageOcclusions.length > 0 && (
                <OcclusionImage imageUrl={current.imageUrl} imageAlt={current.imageAlt} occlusions={current.imageOcclusions} revealed={true} />
              )}
              {current.clozeRanges.length > 0 ? (
                <>
                  <p className="text-lg font-medium text-foreground">
                    <ClozeText text={current.front.text} ranges={current.clozeRanges} hiddenClassName="rounded bg-primary-tint px-1 text-primary-strong" />
                  </p>
                  {current.back.text && <p className="mt-2 text-sm text-foreground-muted">{current.back.text}</p>}
                </>
              ) : (
                <p className="text-lg font-medium text-primary-strong">{current.back.text}</p>
              )}
            </div>
          </div>
          {revealed && dragX !== 0 && (
            <>
              <div
                className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1 rounded-full border-2 border-danger bg-surface px-2 py-1 text-xs font-bold uppercase text-danger"
                style={{ opacity: Math.min(1, Math.max(0, -dragX / 70)) }}
              >
                <X className="h-3.5 w-3.5" /> Incorrect
              </div>
              <div
                className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-full border-2 border-success bg-surface px-2 py-1 text-xs font-bold uppercase text-success"
                style={{ opacity: Math.min(1, Math.max(0, dragX / 70)) }}
              >
                Correct <Check className="h-3.5 w-3.5" />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {awaitingConfidence ? (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" onClick={() => confirmReveal("unsure")}>
              Hésitant(e)
            </Button>
            <Button size="lg" onClick={() => confirmReveal("sure")}>
              Sûr(e)
            </Button>
          </div>
        ) : !revealed && dictationMode ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              requestReveal();
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
          <Button className="w-full" size="lg" onClick={requestReveal}>
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
          Espace pour révéler · ← / → pour répondre (confiance, puis exactitude) · Ctrl+Z / ⌘Z pour annuler
        </p>
      </div>
    </div>
  );
}
