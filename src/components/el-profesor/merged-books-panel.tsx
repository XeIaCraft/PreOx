"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, ChevronDown, ChevronRight, ClipboardCheck, Combine, History, ListTree, Pencil, X } from "lucide-react";
import { LocalNavLink } from "@/components/el-profesor/local-nav-link";
import { CompactProgressBars } from "@/components/el-profesor/progress-bars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BookWithChapters, ChapterDueCounts, ChapterMasteryCounts } from "@/lib/el-profesor/dal";

type Chapter = BookWithChapters["chapters"][number];
type SectionLevel = "part" | "subPart";

/** Chapters grouped under their part and sub-part, in reading order (a title repeated further on starts a new group). */
function groupChapters(chapters: Chapter[]) {
  const parts: { title: string; subParts: { title: string; chapters: Chapter[] }[] }[] = [];
  for (const c of chapters) {
    const partTitle = c.partTitle ?? "";
    let part = parts[parts.length - 1];
    if (!part || part.title !== partTitle) parts.push((part = { title: partTitle, subParts: [] }));
    const subTitle = c.subPartTitle ?? "";
    let sub = part.subParts[part.subParts.length - 1];
    if (!sub || sub.title !== subTitle) part.subParts.push((sub = { title: subTitle, chapters: [] }));
    sub.chapters.push(c);
  }
  return parts;
}

const collapsedKey = (bookId: string) => `elp-merged-collapsed:${bookId}`;

/** Parts folded by this reader, remembered on this device (a convenience: nothing breaks without storage). */
function useCollapsedParts(bookId: string) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(collapsedKey(bookId));
      // Restoring a stored preference after mount, so the server render and the first client render match.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Storage unavailable: every part stays open.
    }
  }, [bookId]);
  const update = (next: Set<string>) => {
    setCollapsed(next);
    try {
      localStorage.setItem(collapsedKey(bookId), JSON.stringify([...next]));
    } catch {
      // Not remembered on this device — still applies for this visit.
    }
  };
  return [collapsed, update] as const;
}

/** A title an admin can rename in place (pencil → field → Entrée / Échap). */
function EditableTitle({ value, canEdit, onSave, className, label }: { value: string; canEdit: boolean; onSave: (next: string) => void; className: string; label: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing)
    return (
      <span className="inline-flex min-w-0 items-start gap-1.5">
        <span className={className}>{value}</span>
        {canEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDraft(value);
              setEditing(true);
            }}
            className="mt-0.5 shrink-0 rounded p-0.5 text-foreground-subtle hover:bg-surface-muted hover:text-foreground"
            aria-label={`Renommer ${label}`}
            title={`Renommer ${label}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    );
  const save = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== value) onSave(next);
  };
  return (
    <form
      className="flex w-full min-w-0 items-center gap-1"
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        aria-label={`Nouveau titre : ${label}`}
        className="h-8 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-sm text-foreground focus:border-primary focus:outline-none"
      />
      <button type="submit" className="rounded p-1 text-success hover:bg-surface-muted" aria-label="Enregistrer">
        <Check className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => setEditing(false)} className="rounded p-1 text-foreground-subtle hover:bg-surface-muted" aria-label="Annuler">
        <X className="h-4 w-4" />
      </button>
    </form>
  );
}

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
  onRenameChapter,
  onRenameSection,
}: {
  books: BookWithChapters[];
  dueCounts: ChapterDueCounts;
  masteryCounts: ChapterMasteryCounts;
  readProgressByChapter: Record<string, number>;
  isAdmin: boolean;
  onRenameChapter?: (chapterId: string, title: string) => void;
  onRenameSection?: (bookId: string, level: SectionLevel, oldTitle: string, newTitle: string, partTitle: string | null) => void;
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

      {books.map((book) => (
        <MergedBookSection
          key={book.id}
          book={book}
          dueCounts={dueCounts}
          masteryCounts={masteryCounts}
          readProgressByChapter={readProgressByChapter}
          isAdmin={isAdmin}
          onRenameChapter={onRenameChapter}
          onRenameSection={onRenameSection}
        />
      ))}

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

function MergedBookSection({
  book,
  dueCounts,
  masteryCounts,
  readProgressByChapter,
  isAdmin,
  onRenameChapter,
  onRenameSection,
}: {
  book: BookWithChapters;
  dueCounts: ChapterDueCounts;
  masteryCounts: ChapterMasteryCounts;
  readProgressByChapter: Record<string, number>;
  isAdmin: boolean;
  onRenameChapter?: (chapterId: string, title: string) => void;
  onRenameSection?: (bookId: string, level: SectionLevel, oldTitle: string, newTitle: string, partTitle: string | null) => void;
}) {
  const chapters = isAdmin ? book.chapters : book.chapters.filter((c) => c.status === "published");
  const dueOf = (list: Chapter[]) => list.reduce((s, c) => s + (c.status === "published" ? (dueCounts[c.id] ?? 0) : 0), 0);
  const due = dueOf(chapters);
  const parts = groupChapters(chapters);
  const [collapsed, setCollapsed] = useCollapsedParts(book.id);
  const partKey = (title: string, i: number) => title || `#${i}`;
  const allFolded = parts.length > 0 && parts.every((p, i) => collapsed.has(partKey(p.title, i)));
  const canEdit = isAdmin && Boolean(onRenameSection);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif-display text-lg font-medium text-foreground">{book.title}</h2>
        <div className="flex items-center gap-2">
          {due > 0 && <Badge variant="primary">{due} à réviser</Badge>}
          {parts.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setCollapsed(allFolded ? new Set() : new Set(parts.map((p, i) => partKey(p.title, i))))}>
              {allFolded ? "Tout déplier" : "Tout replier"}
            </Button>
          )}
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
        {parts.map((part, pi) => {
          const key = partKey(part.title, pi);
          const folded = collapsed.has(key);
          const partChapters = part.subParts.flatMap((sp) => sp.chapters);
          const partDue = dueOf(partChapters);
          return (
            <div key={key} className="pt-3 first:pt-0">
              {part.title && (
                <div className="flex items-start gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set(collapsed);
                      if (folded) next.delete(key);
                      else next.add(key);
                      setCollapsed(next);
                    }}
                    className="mt-0.5 shrink-0 rounded p-0.5 text-foreground-subtle hover:bg-surface-muted hover:text-foreground"
                    aria-expanded={!folded}
                    aria-label={folded ? `Déplier ${part.title}` : `Replier ${part.title}`}
                  >
                    {folded ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <EditableTitle
                      value={part.title}
                      canEdit={canEdit}
                      label="la partie"
                      className="text-sm font-semibold text-foreground"
                      onSave={(next) => onRenameSection?.(book.id, "part", part.title, next, null)}
                    />
                    {folded && (
                      <p className="text-xs text-foreground-subtle">
                        {partChapters.length} chapitre{partChapters.length > 1 ? "s" : ""}
                        {partDue > 0 && ` · ${partDue} à réviser`}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {!folded && (
                <div className="mt-1.5 space-y-1.5">
                  {part.subParts.map((sub, si) => (
                    <div key={`${sub.title}-${si}`} className="space-y-1.5">
                      {sub.title && (
                        <div className="pt-1">
                          <EditableTitle
                            value={sub.title}
                            canEdit={canEdit}
                            label="la sous-partie"
                            className="text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle"
                            onSave={(next) => onRenameSection?.(book.id, "subPart", sub.title, next, part.title || null)}
                          />
                        </div>
                      )}
                      {sub.chapters.map((chapter) => (
                        <ChapterRow
                          key={chapter.id}
                          chapter={chapter}
                          dueHere={dueCounts[chapter.id] ?? 0}
                          masteryCounts={masteryCounts}
                          readPct={readProgressByChapter[chapter.id] ?? 0}
                          isAdmin={isAdmin}
                          onRename={onRenameChapter}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ChapterRow({
  chapter,
  dueHere,
  masteryCounts,
  readPct,
  isAdmin,
  onRename,
}: {
  chapter: Chapter;
  dueHere: number;
  masteryCounts: ChapterMasteryCounts;
  readPct: number;
  isAdmin: boolean;
  onRename?: (chapterId: string, title: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <EditableTitle
          value={chapter.title}
          canEdit={isAdmin && Boolean(onRename)}
          label="le chapitre"
          className="text-sm font-medium text-foreground"
          onSave={(next) => onRename?.(chapter.id, next)}
        />
        {chapter.status === "published" ? (
          <CompactProgressBars readPct={readPct} mastery={masteryCounts[chapter.id] ?? { total: 0, acquired: 0, learning: 0 }} />
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
        {isAdmin && chapter.status === "published" && (
          <Link href={`/apps/el-profesor/chapters/${chapter.id}/admin-review`} prefetch={false}>
            <Button size="sm" variant="ghost" title="Modifier les fiches et les flashcards du chapitre">
              <Pencil className="h-3.5 w-3.5" /> Éditer
            </Button>
          </Link>
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
  );
}
