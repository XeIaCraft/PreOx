"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, BellOff, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setFlashcardExcludedLocally } from "@/lib/el-profesor/local-writes";
import { flushPendingWrites } from "@/lib/el-profesor/sync-queue";
import type { SuspendedFlashcard } from "@/lib/el-profesor/dal";

export function SuspendedFlashcardsView({ cards }: { cards: SuspendedFlashcard[] }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [reincluded, setReincluded] = useState<Set<string>>(new Set());

  function handleReinclude(flashcardId: string) {
    startTransition(async () => {
      // Local-first (piste 2026-09-24): back in the local due counts and
      // review queue at once, and delivered right away in the background
      // (this list itself is server-rendered, so a reload should agree).
      try {
        await setFlashcardExcludedLocally(flashcardId, false);
      } catch {
        toast("Impossible de réintégrer cette carte.", { variant: "error" });
        return;
      }
      flushPendingWrites().catch(() => {});
      toast("Carte réintégrée dans vos révisions.", { variant: "success" });
      setReincluded((s) => new Set(s).add(flashcardId));
    });
  }

  const remaining = cards.filter((c) => !reincluded.has(c.flashcardId));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/apps/el-profesor" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground-subtle hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour à la bibliothèque
      </Link>
      <h1 className="flex items-center gap-2 font-serif-display text-2xl font-medium text-foreground">
        <BellOff className="h-5 w-5" /> Cartes exclues
      </h1>
      <p className="mt-1 text-sm text-foreground-muted">
        Les flashcards que vous avez sorties de vos révisions — elles restent dans la bibliothèque, seulement absentes de vos sessions.
      </p>

      {remaining.length === 0 ? (
        <p className="mt-6 text-sm text-foreground-subtle">Aucune carte exclue pour l&apos;instant.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {remaining.map((c) => (
            <li key={c.flashcardId} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{c.front}</p>
                <p className="mt-0.5 text-xs text-foreground-subtle">
                  {c.bookTitle} / {c.chapterTitle}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => handleReinclude(c.flashcardId)} disabled={isPending} className="shrink-0">
                <Undo2 className="h-3.5 w-3.5" /> Réintégrer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
