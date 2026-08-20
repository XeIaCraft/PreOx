"use client";

import { useState, useTransition } from "react";
import { Monitor, LogOut, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { revokeMySession, type MySession, type LoginHistoryEntry } from "@/app/actions/security";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

/** Trims a raw User-Agent string down to something a human can scan at a glance. */
function summarizeDevice(userAgent: string | null): string {
  if (!userAgent) return "Appareil inconnu";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Navigateur";
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Mac OS X/.test(userAgent)
      ? "macOS"
      : /Android/.test(userAgent)
        ? "Android"
        : /iPhone|iPad/.test(userAgent)
          ? "iOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";
  return os ? `${browser} · ${os}` : browser;
}

export function SessionsSection({ sessions, history }: { sessions: MySession[]; history: LoginHistoryEntry[] }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  function handleRevoke(sessionId: string) {
    setRevokingId(sessionId);
    startTransition(async () => {
      const result = await revokeMySession(sessionId);
      setRevokingId(null);
      if (result.error) toast(result.error, { variant: "error" });
      else toast(result.success ?? "", { variant: "success" });
    });
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6">
      <h2 className="font-serif-display text-lg font-medium text-foreground">Sessions actives</h2>
      <p className="mt-1 text-sm text-foreground-muted">Les appareils actuellement connectés à votre compte.</p>

      <ul className="mt-4 divide-y divide-border">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Monitor className="h-4 w-4 shrink-0 text-foreground-subtle" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {summarizeDevice(s.userAgent)}
                  {s.isCurrent && <span className="ml-2 text-xs font-normal text-success">Cet appareil</span>}
                </p>
                <p className="text-xs text-foreground-subtle">Actif depuis le {formatDate(s.updatedAt)}</p>
              </div>
            </div>
            {!s.isCurrent && (
              <Button variant="secondary" size="sm" onClick={() => handleRevoke(s.id)} disabled={isPending && revokingId === s.id} className="shrink-0">
                <LogOut className="h-4 w-4" />
                Révoquer
              </Button>
            )}
          </li>
        ))}
        {sessions.length === 0 && <p className="py-2 text-sm text-foreground-subtle">Aucune session active.</p>}
      </ul>

      <button
        type="button"
        onClick={() => setShowHistory((v) => !v)}
        className="mt-4 flex items-center gap-1.5 border-t border-border pt-4 text-sm font-medium text-foreground-muted hover:text-foreground"
      >
        <History className="h-4 w-4" />
        {showHistory ? "Masquer l'historique de connexion" : "Voir l'historique de connexion"}
      </button>

      {showHistory && (
        <ul className="mt-3 space-y-1.5">
          {history.map((h) => (
            <li key={h.id} className="flex items-center justify-between text-xs text-foreground-subtle">
              <span>{summarizeDevice(h.userAgent)}</span>
              <span>{formatDate(h.createdAt)}</span>
            </li>
          ))}
          {history.length === 0 && <p className="text-xs text-foreground-subtle">Aucun historique.</p>}
        </ul>
      )}
    </div>
  );
}
