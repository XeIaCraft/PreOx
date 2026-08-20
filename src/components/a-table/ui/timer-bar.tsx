"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, Timer, X } from "lucide-react";

export interface RunningTimer {
  id: number;
  label: string;
  endsAt: number;
}

const STORAGE_KEY = "preox-a-table-timers";

function readStored(): RunningTimer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RunningTimer[];
    // Drop anything that finished more than an hour ago — no point resurrecting a
    // stale "done" chip from a tab left closed overnight.
    return parsed.filter((t) => Date.now() - t.endsAt < 60 * 60 * 1000);
  } catch {
    return [];
  }
}

/** Short two-tone beep via Web Audio — no audio asset needed, and it works even if the tab has been silent (no prior user gesture requirement issue since this only ever fires after the user has already interacted with the page to start a timer). */
function playBeep() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.22);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.22 + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.22);
      osc.stop(ctx.currentTime + i * 0.22 + 0.2);
    });
  } catch {
    // ignore — best-effort only
  }
}

/**
 * Timers live here (board-level, mounted for the whole page session) and
 * persist to localStorage — so a running timer survives closing the cook
 * mode dialog (the usual accidental-close complaint) and even a page
 * reload, not just a React remount. CookModeDialog reads/writes the same
 * state via props instead of keeping its own copy.
 */
export function useTimers() {
  const [timers, setTimers] = useState<RunningTimer[]>(readStored);
  const notifiedIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
    } catch {
      // ignore (private browsing / quota)
    }
  }, [timers]);

  useEffect(() => {
    if (timers.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      for (const t of timers) {
        if (now >= t.endsAt && !notifiedIds.current.has(t.id)) {
          notifiedIds.current.add(t.id);
          playBeep();
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [timers]);

  function startTimer(minutes: number, label: string) {
    setTimers((prev) => [...prev, { id: Date.now(), label, endsAt: Date.now() + minutes * 60 * 1000 }]);
  }

  function dismissTimer(id: number) {
    setTimers((prev) => prev.filter((t) => t.id !== id));
    notifiedIds.current.delete(id);
  }

  return { timers, startTimer, dismissTimer };
}

export function TimerBar({ timers, onDismiss }: { timers: RunningTimer[]; onDismiss: (id: number) => void }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (timers.length === 0) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timers.length]);

  if (timers.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap justify-center gap-2 border-t border-border bg-surface/95 px-4 py-2 backdrop-blur-sm">
      {timers.map((t) => {
        const remaining = Math.max(0, Math.round((t.endsAt - now) / 1000));
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        const done = remaining <= 0;
        return (
          <span
            key={t.id}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              done ? "animate-pulse bg-danger-tint text-danger" : "bg-surface-muted text-foreground-muted"
            }`}
          >
            {done ? <BellRing className="h-3 w-3" /> : <Timer className="h-3 w-3" />}
            {t.label} — {m}:{s.toString().padStart(2, "0")}
            <button type="button" onClick={() => onDismiss(t.id)} aria-label="Arrêter ce chrono" className="hover:opacity-70">
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
