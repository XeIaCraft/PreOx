"use client";

import { Fragment } from "react";
import Link from "next/link";
import { BookOpen, ClipboardCheck, Combine, History, ListTree } from "lucide-react";
import { LocalNavLink } from "@/components/el-profesor/local-nav-link";
import { CompactProgressBars } from "@/components/el-profesor/progress-bars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BookWithChapters, ChapterDueCounts, ChapterMasteryCounts } from "@/lib/el-profesor/dal";

/**
 * The dashboard's « Par notion » view since the fusion refonte (octobre
 * 2026): the merged books, chapter by chapter under their parts, to read
 * and review — the same chapter reader and review queues as any book.
 */
export function MergedBooksPanel({
  books,
  dueCounts,
  masteryCounts,
  readProgressByChapter,
  isAdmin,
}: {
  books: BookWithChapters[];
  dueCounts: ChapterDueCounts;
  masteryCounts: ChapterMasteryCounts;
  readProgressByChapter: Record<string, number>;
  isAdmin: boolean;
}) {
  return (
    <div className="space-y-8">
      {books.length === 0 && (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
          Aucune notion pour l&apos;instant.
          {isAdmin && (
            <div className="mt-4">
              <Link href="/apps/el-profesor/notions" prefetch={false}>
                <Button size="sm">
                  <Combine className="h-3.5 w-3.5" /> Fusionner des livres
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}

      {books.map((book) => {
        const chapters = isAdmin ? book.chapters : book.chapters.filter((c) => c.status === "published");
        const due = chapters.reduce((s, c) => s + (c.status === "published" ? (dueCounts[c.id] ?? 0) : 0), 0);
        return (
          <section key={book.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-serif-display text-lg font-medium text-foreground">{book.title}</h2>
              <div className="flex items-center gap-2">
                {due > 0 && <Badge variant="primary">{due} à réviser</Badge>}
                <LocalNavLink
                  href={`/apps/el-profesor/books/${book.id}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-foreground-subtle hover:bg-surface-muted hover:text-foreground"
                  aria-label={`Table des matières de ${book.title}`}
                  title="Table des matières"
                >
                  <ListTree className="h-4 w-4" />
                </LocalNavLink>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {chapters.length === 0 && <p className="text-sm text-foreground-subtle">Pas encore de chapitre publié.</p>}
              {chapters.map((chapter, i) => {
                const prev = chapters[i - 1];
                const newPart = Boolean(chapter.partTitle) && chapter.partTitle !== prev?.partTitle;
                const newSubPart = Boolean(chapter.subPartTitle) && (newPart || chapter.subPartTitle !== prev?.subPartTitle);
                const dueHere = dueCounts[chapter.id] ?? 0;
                return (
                  <Fragment key={chapter.id}>
                    {newPart && <h3 className="pt-4 text-sm font-semibold text-foreground first:pt-0">{chapter.partTitle}</h3>}
                    {newSubPart && <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">{chapter.subPartTitle}</p>}
                    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{chapter.title}</p>
                        {chapter.status === "published" ? (
                          <CompactProgressBars readPct={readProgressByChapter[chapter.id] ?? 0} mastery={masteryCounts[chapter.id] ?? { total: 0, acquired: 0, learning: 0 }} />
                        ) : (
                          <p className="text-xs text-foreground-subtle">{chapter.status === "extracting" ? "Fusion en cours…" : "Brouillon à relire"}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {chapter.status === "published" && (
                          <>
                            <LocalNavLink href={`/apps/el-profesor/chapters/${chapter.id}/review?mode=due`}>
                              <Button size="sm" disabled={dueHere === 0}>
                                {dueHere > 0 ? `Réviser (${dueHere})` : "À jour"}
                              </Button>
                            </LocalNavLink>
                            <LocalNavLink href={`/apps/el-profesor/chapters/${chapter.id}`}>
                              <Button variant="secondary" size="sm">
                                <BookOpen className="h-3.5 w-3.5" /> Fiches
                              </Button>
                            </LocalNavLink>
                          </>
                        )}
                        {isAdmin && chapter.status === "draft_ready" && (
                          <Link href={`/apps/el-profesor/chapters/${chapter.id}/admin-review`} prefetch={false}>
                            <Button size="sm" variant="secondary">
                              <ClipboardCheck className="h-3.5 w-3.5" /> Relire &amp; publier
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </section>
        );
      })}

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <Link href="/apps/el-profesor/notions" prefetch={false}>
            <Button variant="secondary" size="sm">
              <Combine className="h-3.5 w-3.5" /> Gérer les notions
            </Button>
          </Link>
          <Link href="/apps/el-profesor/notions/anciennes" prefetch={false}>
            <Button variant="ghost" size="sm">
              <History className="h-3.5 w-3.5" /> Anciennes notions
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
