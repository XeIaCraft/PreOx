"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { submitReview } from "@/app/apps/el-profesor/actions/review";
import { useToast } from "@/components/ui/toast";
import type { Flashcard, ReviewSource } from "@/lib/el-profesor/types";

export function FlashcardReviewer({
  chapterId,
  source,
  cards,
}: {
  chapterId: string;
  source: ReviewSource;
  cards: Flashcard[];
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);

  const current = cards[index];

  function handleRate(rating: "again" | "good") {
    if (!current) return;
    startTransition(async () => {
      const result = await submitReview(current.id, rating, source);
      if (result.error) {
        toast(result.error, { variant: "error" });
        return;
      }
      setDone((d) => d + 1);
      setRevealed(false);
      setIndex((i) => i + 1);
    });
  }

  if (cards.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-foreground-muted">
          {source === "scheduled" ? "Rien à réviser aujourd'hui pour ce chapitre." : "Aucune flashcard publiée pour ce chapitre."}
        </p>
        <Link href={`/apps/el-profesor/chapters/${chapterId}`} className="mt-4 inline-block">
          <Button variant="secondary">Voir les fiches</Button>
        </Link>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <PartyPopper className="mx-auto h-8 w-8 text-primary-strong" />
        <p className="mt-3 text-lg font-medium text-foreground">Session terminée</p>
        <p className="mt-1 text-sm text-foreground-muted">{done} carte(s) révisée(s).</p>
        <Link href="/apps/el-profesor" className="mt-5 inline-block">
          <Button>Retour à la bibliothèque</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col px-4 py-6">
      <div className="flex items-center justify-between">
        <Link href={`/apps/el-profesor/chapters/${chapterId}`}>
          <Button variant="ghost" size="icon" aria-label="Retour">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant={source === "scheduled" ? "primary" : "neutral"}>{source === "scheduled" ? "Planifiée" : "Libre"}</Badge>
          <span className="text-xs text-foreground-subtle">
            {index + 1} / {cards.length}
          </span>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className="w-full rounded-[var(--radius-lg)] border border-border bg-surface p-8 text-center shadow-sm">
          <p className="text-lg text-foreground">{current.front.text}</p>
          {revealed && (
            <>
              <div className="my-5 h-px bg-border" />
              <p className="text-lg font-medium text-primary-strong">{current.back.text}</p>
            </>
          )}
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
      </div>
    </div>
  );
}
