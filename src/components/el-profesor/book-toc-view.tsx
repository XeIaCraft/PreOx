"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ChevronDown, ChevronRight, FileText, FileX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BookTableOfContents } from "@/lib/el-profesor/dal";
import type { ChapterStatus } from "@/lib/el-profesor/types";

const STATUS_LABEL: Record<ChapterStatus, string> = {
  pending: "En attente",
  queued: "En file (lot Claude)",
  extracting: "Extraction…",
  draft_ready: "Brouillon prêt",
  published: "Publié",
  failed: "Échec",
};

const STATUS_VARIANT: Record<ChapterStatus, "neutral" | "accent" | "success" | "danger"> = {
  pending: "neutral",
  queued: "accent",
  extracting: "accent",
  draft_ready: "accent",
  published: "success",
  failed: "danger",
};

function CoverageBar({ mastery }: { mastery: { total: number; new: number; learning: number; acquired: number } }) {
  if (mastery.total === 0) return <p className="mt-1.5 text-xs text-foreground-subtle">Pas encore de flashcards.</p>;
  const pct = (n: number) => `${(n / mastery.total) * 100}%`;
  return (
    <div className="mt-1.5">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div className="bg-success" style={{ width: pct(mastery.acquired) }} />
        <div className="bg-accent" style={{ width: pct(mastery.learning) }} />
      </div>
      <p className="mt-1 text-[11px] text-foreground-subtle">
        {Math.round((mastery.acquired / mastery.total) * 100)}% maîtrisé · {mastery.acquired}/{mastery.total} flashcards acquises
      </p>
    </div>
  );
}

/** Interactive per-book table of contents: every chapter as an expandable row with a coverage bar, and every sub-entity as a direct deep link into the chapter reader. Item 7 of the backlog. */
export function BookTocView({ toc }: { toc: BookTableOfContents }) {
  const { book, chapters } = toc;
  const [expanded, setExpanded] = useState<Set<string>>(new Set(chapters.length > 0 ? [chapters[0].chapterId] : []));

  function toggle(chapterId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }

  const overallTotal = chapters.reduce((sum, c) => sum + c.mastery.total, 0);
  const overallAcquired = chapters.reduce((sum, c) => sum + c.mastery.acquired, 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/apps/el-profesor" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground-subtle hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour à la bibliothèque
      </Link>

      <div className="flex items-start gap-3">
        {book.coverUrl && (
          <span className="relative h-20 w-14 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface-muted">
            <Image src={book.coverUrl} alt="" fill sizes="56px" className="object-cover" />
          </span>
        )}
        <div>
          <h1 className="font-serif-display text-2xl font-medium text-foreground">{book.title}</h1>
          {(book.author || book.edition) && <p className="text-sm text-foreground-subtle">{[book.author, book.edition].filter(Boolean).join(" — ")}</p>}
          {book.theme && (
            <span className="mt-1 inline-block rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground-subtle">{book.theme}</span>
          )}
        </div>
      </div>

      {overallTotal > 0 && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-border bg-surface p-3">
          <p className="text-sm font-medium text-foreground">Couverture d&apos;ensemble</p>
          <CoverageBar mastery={{ total: overallTotal, new: 0, learning: 0, acquired: overallAcquired }} />
        </div>
      )}

      <div className="mt-6 space-y-2">
        {chapters.length === 0 ? (
          <p className="text-sm text-foreground-subtle">Ce livre n&apos;a pas encore de chapitre publié.</p>
        ) : (
          chapters.map((chapter) => {
            const isOpen = expanded.has(chapter.chapterId);
            return (
              <div key={chapter.chapterId} className="rounded-[var(--radius-lg)] border border-border bg-surface">
                <button
                  type="button"
                  onClick={() => toggle(chapter.chapterId)}
                  className="flex w-full items-center justify-between gap-2 p-3 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-foreground-subtle" /> : <ChevronRight className="h-4 w-4 shrink-0 text-foreground-subtle" />}
                    <span>
                      <span className="font-medium text-foreground">{chapter.chapterTitle}</span>
                      {chapter.status !== "published" && (
                        <Badge variant={STATUS_VARIANT[chapter.status]} className="ml-2">
                          {STATUS_LABEL[chapter.status]}
                        </Badge>
                      )}
                      <CoverageBar mastery={chapter.mastery} />
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-border px-3 pb-3">
                    {chapter.subEntities.length === 0 ? (
                      <p className="pt-2 text-xs text-foreground-subtle">Aucune section pour l&apos;instant.</p>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {chapter.subEntities.map((sub) => (
                          <li key={sub.id}>
                            {sub.hasFiche ? (
                              <Link
                                href={`/apps/el-profesor/chapters/${chapter.chapterId}?entity=${sub.id}`}
                                className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground"
                              >
                                <FileText className="h-3.5 w-3.5 shrink-0 text-foreground-subtle" /> {sub.name}
                              </Link>
                            ) : (
                              <span className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-foreground-subtle opacity-60">
                                <FileX className="h-3.5 w-3.5 shrink-0" /> {sub.name}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
