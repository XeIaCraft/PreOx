"use client";

import { useMemo, useState } from "react";
import { Check, PartyPopper, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { Flashcard } from "@/lib/el-profesor/types";

interface QuizQuestion {
  card: Flashcard;
  options: string[];
  correctIndex: number;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildQuestions(cards: Flashcard[]): QuizQuestion[] {
  const shuffledCards = shuffle(cards);
  return shuffledCards.map((card) => {
    const distractorPool = shuffle(cards.filter((c) => c.id !== card.id).map((c) => c.back.text)).slice(0, 3);
    const options = shuffle([card.back.text, ...distractorPool]);
    return { card, options, correctIndex: options.indexOf(card.back.text) };
  });
}

export function QuizMode({ cards, onClose }: { cards: Flashcard[]; onClose: () => void }) {
  const questions = useMemo(() => buildQuestions(cards), [cards]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  const question = questions[index];

  function handleAnswer(optionIndex: number) {
    if (selected !== null) return;
    setSelected(optionIndex);
    if (optionIndex === question.correctIndex) setScore((s) => s + 1);
  }

  function handleNext() {
    setSelected(null);
    setIndex((i) => i + 1);
  }

  if (!question) {
    return (
      <Modal title="Quiz terminé" onClose={onClose} size="sm">
        <div className="py-4 text-center">
          <PartyPopper className="mx-auto h-8 w-8 text-primary-strong" />
          <p className="mt-3 text-lg font-medium text-foreground">
            {score} / {questions.length}
          </p>
          <p className="mt-1 text-sm text-foreground-muted">bonnes réponses</p>
          <Button className="mt-5" onClick={onClose}>
            Terminer
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Question ${index + 1} / ${questions.length}`} onClose={onClose} size="md">
      <p className="text-base font-medium text-foreground">{question.card.front.text}</p>
      <div className="mt-4 space-y-2">
        {question.options.map((option, i) => {
          const isCorrect = i === question.correctIndex;
          const isSelected = i === selected;
          const showResult = selected !== null;
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleAnswer(i)}
              disabled={showResult}
              className={`flex w-full items-center justify-between rounded-[var(--radius-sm)] border px-3 py-2.5 text-left text-sm transition-colors ${
                showResult && isCorrect
                  ? "border-success bg-success-tint text-success"
                  : showResult && isSelected
                    ? "border-danger bg-danger-tint text-danger"
                    : "border-border text-foreground hover:border-primary/40"
              }`}
            >
              {option}
              {showResult && isCorrect && <Check className="h-4 w-4 shrink-0" />}
              {showResult && isSelected && !isCorrect && <X className="h-4 w-4 shrink-0" />}
            </button>
          );
        })}
      </div>
      {selected !== null && (
        <div className="mt-4 flex justify-end">
          <Button onClick={handleNext}>{index + 1 < questions.length ? "Suivant" : "Voir le résultat"}</Button>
        </div>
      )}
    </Modal>
  );
}
