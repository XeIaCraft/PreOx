"use client";

import { useEffect, useState } from "react";
import { BellRing, Timer, X } from "lucide-react";

export interface RunningTimer {
  id: number;
  label: string;
  endsAt: number;
}

export function useTimers() {
  const [timers, setTimers] = useState<RunningTimer[]>([]);

  function startTimer(minutes: number, label: string) {
    setTimers((prev) => [...prev, { id: Date.now(), label, endsAt: Date.now() + minutes * 60 * 1000 }]);
  }

  function dismissTimer(id: number) {
    setTimers((prev) => prev.filter((t) => t.id !== id));
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
