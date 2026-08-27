"use client";

import { useEffect, useState, useTransition } from "react";
import { MessageCircle, Flag, Trash2, CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  getFicheQuestionsForFiche,
  addFicheQuestion,
  addFicheAnswer,
  deleteFicheQuestion,
  deleteFicheAnswer,
  flagFicheQuestion,
  flagFicheAnswer,
} from "@/app/apps/el-profesor/actions/qa";
import type { FicheQuestion } from "@/lib/el-profesor/types";

/** Questions-réponses sous une fiche, visibles par tous — item 28 of the backlog. Flat, no nested threading. */
export function FicheQA({ ficheId, isAdmin = false }: { ficheId: string; isAdmin?: boolean }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [questions, setQuestions] = useState<FicheQuestion[] | null>(null);
  const [newQuestion, setNewQuestion] = useState("");
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [replyOpen, setReplyOpen] = useState<Set<string>>(new Set());

  function reload() {
    getFicheQuestionsForFiche(ficheId).then(setQuestions);
  }

  // Remounted on ficheId change (chapter-view.tsx keys this component by
  // fiche id), so `questions` naturally starts at null again — no reset needed.
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ficheId]);

  function handleAskQuestion() {
    if (!newQuestion.trim()) return;
    startTransition(async () => {
      const result = await addFicheQuestion(ficheId, newQuestion);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        setNewQuestion("");
        reload();
      }
    });
  }

  function handleAnswer(questionId: string) {
    const body = replyDraft[questionId];
    if (!body?.trim()) return;
    startTransition(async () => {
      const result = await addFicheAnswer(questionId, body);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        setReplyDraft((prev) => ({ ...prev, [questionId]: "" }));
        reload();
      }
    });
  }

  function toggleReply(questionId: string) {
    setReplyOpen((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }

  function handleDeleteQuestion(questionId: string) {
    startTransition(async () => {
      const result = await deleteFicheQuestion(questionId);
      if (result.error) toast(result.error, { variant: "error" });
      else reload();
    });
  }

  function handleDeleteAnswer(answerId: string) {
    startTransition(async () => {
      const result = await deleteFicheAnswer(answerId);
      if (result.error) toast(result.error, { variant: "error" });
      else reload();
    });
  }

  function handleFlagQuestion(questionId: string) {
    startTransition(async () => {
      const result = await flagFicheQuestion(questionId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast("Question signalée.", { variant: "success" });
        reload();
      }
    });
  }

  function handleFlagAnswer(answerId: string) {
    startTransition(async () => {
      const result = await flagFicheAnswer(answerId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast("Réponse signalée.", { variant: "success" });
        reload();
      }
    });
  }

  return (
    <div className="mt-6 border-t border-border pt-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
        <MessageCircle className="h-3.5 w-3.5" /> Questions ({questions?.length ?? 0})
      </p>

      <div className="mt-3 space-y-4">
        {(questions ?? []).map((q) => (
          <div key={q.id} className="rounded-[var(--radius-md)] border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-foreground">
                {q.flagged && (
                  <Badge variant="danger" className="mr-1.5">
                    Signalée
                  </Badge>
                )}
                {q.body}
              </p>
              <div className="flex shrink-0 items-center gap-1">
                {!q.flagged && (
                  <button
                    type="button"
                    onClick={() => handleFlagQuestion(q.id)}
                    disabled={isPending}
                    title="Signaler"
                    aria-label="Signaler cette question"
                    className="text-foreground-subtle hover:text-accent disabled:opacity-50"
                  >
                    <Flag className="h-3.5 w-3.5" />
                  </button>
                )}
                {(q.isMine || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => handleDeleteQuestion(q.id)}
                    disabled={isPending}
                    title="Supprimer"
                    aria-label="Supprimer cette question"
                    className="text-foreground-subtle hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {q.answers.length > 0 && (
              <div className="mt-2 space-y-2 border-l-2 border-border pl-3">
                {q.answers.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-2">
                    <p className="text-sm text-foreground-muted">
                      {a.flagged && (
                        <Badge variant="danger" className="mr-1.5">
                          Signalée
                        </Badge>
                      )}
                      {a.body}
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                      {!a.flagged && (
                        <button
                          type="button"
                          onClick={() => handleFlagAnswer(a.id)}
                          disabled={isPending}
                          title="Signaler"
                          aria-label="Signaler cette réponse"
                          className="text-foreground-subtle hover:text-accent disabled:opacity-50"
                        >
                          <Flag className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {(a.isMine || isAdmin) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAnswer(a.id)}
                          disabled={isPending}
                          title="Supprimer"
                          aria-label="Supprimer cette réponse"
                          className="text-foreground-subtle hover:text-danger disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {replyOpen.has(q.id) ? (
              <div className="mt-2 flex items-start gap-2">
                <CornerDownRight className="mt-2 h-3.5 w-3.5 shrink-0 text-foreground-subtle" />
                <div className="flex-1 space-y-1.5">
                  <textarea
                    value={replyDraft[q.id] ?? ""}
                    onChange={(e) => setReplyDraft((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    rows={2}
                    placeholder="Votre réponse…"
                    className="w-full rounded-[var(--radius-sm)] border border-border bg-surface p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  />
                  <Button size="sm" onClick={() => handleAnswer(q.id)} disabled={isPending || !replyDraft[q.id]?.trim()}>
                    Répondre
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => toggleReply(q.id)} className="mt-2 text-xs text-primary-strong hover:underline">
                Répondre
              </button>
            )}
          </div>
        ))}
        {questions?.length === 0 && <p className="text-sm text-foreground-subtle">Aucune question pour l&apos;instant.</p>}
      </div>

      <div className="mt-3 space-y-1.5">
        <textarea
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          rows={2}
          placeholder="Poser une question sur cette fiche…"
          className="w-full rounded-[var(--radius-sm)] border border-border bg-surface p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
        <Button size="sm" onClick={handleAskQuestion} disabled={isPending || !newQuestion.trim()}>
          Poser la question
        </Button>
      </div>
    </div>
  );
}
