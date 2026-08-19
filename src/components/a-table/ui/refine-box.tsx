"use client";

import { useRef, useState, useTransition } from "react";
import { Sparkles, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RefineBoxProps {
  onSubmit: (message: string) => Promise<{ error?: string; success?: string }>;
  onApplied: () => void;
  placeholder?: string;
}

interface LogEntry {
  id: number;
  message: string;
  status: "loading" | "done" | "error";
}

/** Reused for recipe / draft proposal / guest-course free-text edits — one call, one applied result. */
export function RefineBox({ onSubmit, onApplied, placeholder }: RefineBoxProps) {
  const [message, setMessage] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [isPending, startTransition] = useTransition();
  const counter = useRef(0);

  function handleSend() {
    const trimmed = message.trim();
    if (!trimmed || isPending) return;
    const id = counter.current++;
    setLog((prev) => [...prev, { id, message: trimmed, status: "loading" }]);
    setMessage("");

    startTransition(async () => {
      const result = await onSubmit(trimmed);
      setLog((prev) =>
        prev.map((entry) => (entry.id === id ? { ...entry, status: result.error ? "error" : "done" } : entry))
      );
      if (!result.error) onApplied();
    });
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-muted/60 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground-muted">
        <Sparkles className="h-3.5 w-3.5" />
        Ajuster avec l&rsquo;IA
      </p>

      {log.length > 0 && (
        <ul className="mb-2 space-y-1 text-xs text-foreground-subtle">
          {log.map((entry) => (
            <li key={entry.id}>
              Vous : {entry.message} —{" "}
              <span
                className={
                  entry.status === "error" ? "text-danger" : entry.status === "loading" ? "text-foreground-subtle" : "text-success"
                }
              >
                {entry.status === "loading" ? "En cours…" : entry.status === "error" ? "Échec" : "Mis à jour"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={placeholder ?? 'ex. "remplace le poulet par du tofu"'}
          rows={2}
          disabled={isPending}
          className="flex-1 resize-none rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
        <Button type="button" size="icon" onClick={handleSend} disabled={isPending || !message.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
