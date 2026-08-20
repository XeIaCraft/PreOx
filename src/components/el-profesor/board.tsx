"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  GraduationCap,
  Plus,
  Trash2,
  Pencil,
  Sparkles,
  BookOpen,
  ClipboardCheck,
  SearchCheck,
  ArrowRight,
  Settings,
  HelpCircle,
  Download,
  ShieldAlert,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { OnboardingTour } from "@/components/onboarding-tour";
import { hasSeenOnboarding } from "@/lib/onboarding";
import { EL_PROFESOR_ONBOARDING_STEPS } from "@/components/el-profesor/onboarding-steps";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { LibrarySearch } from "@/components/el-profesor/library-search";
import { AddBookDialog } from "@/components/el-profesor/dialogs/add-book-dialog";
import { UploadChapterDialog } from "@/components/el-profesor/dialogs/upload-chapter-dialog";
import { ConfirmDeleteDialog } from "@/components/el-profesor/dialogs/confirm-delete-dialog";
import { GeminiSettingsDialog } from "@/components/el-profesor/dialogs/gemini-settings-dialog";
import { LearningWidgets, DailyCard, LibraryStats, BookmarksList } from "@/components/el-profesor/learning-widgets";
import { deleteBook, deleteChapter, moveBook } from "@/app/apps/el-profesor/actions/library";
import { extractChapter, extractChapterComplementary } from "@/app/apps/el-profesor/actions/extraction";
import { getChapterFlashcardsForExport } from "@/app/apps/el-profesor/actions/export";
import { getLastChapter } from "@/lib/el-profesor/local-prefs";
import type { BookWithChapters, ChapterDueCounts, ChapterMasteryCounts, ReviewActivitySummary, BookmarkedEntity } from "@/lib/el-profesor/dal";
import type { ChapterStatus, Flashcard } from "@/lib/el-profesor/types";

function MasteryBar({ counts }: { counts: { total: number; new: number; learning: number; acquired: number } }) {
  if (counts.total === 0) return null;
  const pct = (n: number) => `${(n / counts.total) * 100}%`;
  return (
    <div className="mt-2">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div className="bg-success" style={{ width: pct(counts.acquired) }} />
        <div className="bg-accent" style={{ width: pct(counts.learning) }} />
      </div>
      <p className="mt-1 text-[11px] text-foreground-subtle">
        {counts.acquired} acquise{counts.acquired > 1 ? "s" : ""} · {counts.learning} en cours · {counts.new} nouvelle{counts.new > 1 ? "s" : ""}
      </p>
    </div>
  );
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;
}

function ElapsedTime({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return <span className="tabular-nums">{formatElapsed(now - startedAt)}</span>;
}

const STATUS_LABEL: Record<ChapterStatus, string> = {
  pending: "PDF importé",
  extracting: "Extraction en cours…",
  draft_ready: "Brouillon à relire",
  published: "Publié",
  failed: "Échec de l'extraction",
};

const STATUS_VARIANT: Record<ChapterStatus, "neutral" | "accent" | "success" | "danger"> = {
  pending: "neutral",
  extracting: "accent",
  draft_ready: "accent",
  published: "success",
  failed: "danger",
};

type ModalState =
  | { type: "add_book" }
  | { type: "edit_book"; book: { id: string; title: string; author: string | null; edition: string | null } }
  | { type: "upload_chapter"; bookId: string; nextOrder: number }
  | { type: "delete_book"; bookId: string; title: string; chapterCount: number }
  | { type: "delete_chapter"; chapterId: string; title: string; flashcardCount: number }
  | { type: "gemini_settings" }
  | null;

export function ElProfesorBoard({
  books,
  dueCounts,
  needsReviewCounts,
  masteryCounts,
  isAdmin,
  geminiModel,
  globalDueCount,
  difficultCount,
  difficultCounts,
  activity,
  dailyCard,
  bookmarks,
}: {
  books: BookWithChapters[];
  dueCounts: ChapterDueCounts;
  needsReviewCounts: ChapterDueCounts;
  masteryCounts: ChapterMasteryCounts;
  isAdmin: boolean;
  geminiModel: string | null;
  globalDueCount: number;
  difficultCount: number;
  difficultCounts: ChapterDueCounts;
  activity: ReviewActivitySummary;
  dailyCard: Flashcard | null;
  bookmarks: BookmarkedEntity[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [modal, setModal] = useState<ModalState>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingStartedAt, setPendingStartedAt] = useState<number | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  // Lazy initializer (client-only read), same pattern used elsewhere for
  // one-time localStorage reads — null on the server, resolved on mount.
  const [resumeChapterId] = useState(() => getLastChapter());
  const [tourOpen, setTourOpen] = useState(() => !hasSeenOnboarding("el-profesor"));

  let resume: { book: BookWithChapters; chapter: BookWithChapters["chapters"][number] } | null = null;
  if (resumeChapterId) {
    for (const book of books) {
      const chapter = book.chapters.find((c) => c.id === resumeChapterId && c.status === "published");
      if (chapter) {
        resume = { book, chapter };
        break;
      }
    }
  }

  const masteryValues = Object.values(masteryCounts);
  const totalAcquired = masteryValues.reduce((sum, m) => sum + m.acquired, 0);
  const chaptersMastered = masteryValues.filter((m) => m.total > 0 && m.acquired === m.total).length;
  const totalChapters = books.reduce((sum, b) => sum + b.chapters.filter((c) => c.status === "published").length, 0);
  const totalFlashcards = masteryValues.reduce((sum, m) => sum + m.total, 0);

  function refresh() {
    startTransition(() => router.refresh());
  }

  function handleExtract(chapterId: string) {
    setPendingId(chapterId);
    setPendingStartedAt(() => Date.now());
    startTransition(async () => {
      const result = await extractChapter(chapterId);
      setPendingId(null);
      setPendingStartedAt(null);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Extraction terminée.", { variant: "success" });
        refresh();
      }
    });
  }

  function handleComplement(chapterId: string) {
    setPendingId(chapterId);
    setPendingStartedAt(() => Date.now());
    startTransition(async () => {
      const result = await extractChapterComplementary(chapterId);
      setPendingId(null);
      setPendingStartedAt(null);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Terminé.", { variant: "success" });
        refresh();
      }
    });
  }

  function handleMoveBook(bookId: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveBook(bookId, direction);
      if (result.error) toast(result.error, { variant: "error" });
      else refresh();
    });
  }

  function csvField(value: string) {
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }

  function handleExportCsv(chapterId: string, chapterTitle: string) {
    setExportingId(chapterId);
    startTransition(async () => {
      const result = await getChapterFlashcardsForExport(chapterId);
      setExportingId(null);
      if ("error" in result) {
        toast(result.error, { variant: "error" });
        return;
      }
      if (result.length === 0) {
        toast("Aucune flashcard publiée à exporter pour ce chapitre.", { variant: "error" });
        return;
      }
      const rows = [
        ["Recto", "Verso", "Page"],
        ...result.map((c) => [c.front, c.back, c.page ? String(c.page) : ""]),
      ];
      const csv = rows.map((row) => row.map(csvField).join(",")).join("\n");
      const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${chapterTitle.replace(/[^\w\s-]/g, "").trim() || "chapitre"}-flashcards.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  function confirmDeleteChapter(chapterId: string) {
    setPendingId(chapterId);
    startTransition(async () => {
      const result = await deleteChapter(chapterId);
      setPendingId(null);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        setModal(null);
        refresh();
      }
    });
  }

  function confirmDeleteBook(bookId: string) {
    startTransition(async () => {
      const result = await deleteBook(bookId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        setModal(null);
        refresh();
      }
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 xl:max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-primary-tint text-primary-strong">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-serif-display text-2xl font-medium text-foreground">El Profesor</h1>
            <p className="text-sm text-foreground-muted">Fiches et flashcards générées à partir de vos livres.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setTourOpen(true)} aria-label="Revoir le tutoriel" title="Revoir le tutoriel">
            <HelpCircle className="h-4 w-4" />
          </Button>
          {isAdmin && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setModal({ type: "gemini_settings" })}
                aria-label="Paramètres du modèle IA"
                title="Paramètres du modèle IA"
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button onClick={() => setModal({ type: "add_book" })}>
                <Plus className="h-4 w-4" /> Ajouter un livre
              </Button>
            </>
          )}
        </div>
      </div>

      {books.length > 0 && <LibraryStats totalBooks={books.length} totalChapters={totalChapters} totalFlashcards={totalFlashcards} />}

      {resume && (
        <Link
          href={`/apps/el-profesor/chapters/${resume.chapter.id}`}
          className="mt-6 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-primary/30 bg-primary-tint px-4 py-3 text-primary-strong hover:border-primary/50"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">Reprendre la lecture</p>
            <p className="truncate text-sm font-medium">
              {resume.chapter.title} <span className="opacity-70">— {resume.book.title}</span>
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>
      )}

      {dailyCard && <DailyCard card={dailyCard} />}

      <BookmarksList bookmarks={bookmarks} />

      {books.length > 0 && (
        <LearningWidgets
          activity={activity}
          globalDueCount={globalDueCount}
          difficultCount={difficultCount}
          totalAcquired={totalAcquired}
          chaptersMastered={chaptersMastered}
        />
      )}

      {books.length > 0 && (
        <div className="mt-6">
          <LibrarySearch />
        </div>
      )}

      {books.length === 0 && (
        <div className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
          Aucun livre pour l&apos;instant.{isAdmin ? " Ajoutez-en un pour commencer." : " Un administrateur doit d'abord en importer."}
        </div>
      )}

      <div className="mt-8 space-y-8">
        {books.map((book, bookIndex) => (
          <div key={book.id}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-serif-display text-lg font-medium text-foreground">{book.title}</h2>
                {(book.author || book.edition) && (
                  <p className="text-sm text-foreground-subtle">
                    {[book.author, book.edition].filter(Boolean).join(" — ")}
                  </p>
                )}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => handleMoveBook(book.id, "up")}
                      disabled={bookIndex === 0 || isPending}
                      aria-label="Monter ce livre"
                      className="text-foreground-subtle hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveBook(book.id, "down")}
                      disabled={bookIndex === books.length - 1 || isPending}
                      aria-label="Descendre ce livre"
                      className="text-foreground-subtle hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setModal({
                        type: "edit_book",
                        book: { id: book.id, title: book.title, author: book.author, edition: book.edition },
                      })
                    }
                    aria-label="Modifier le livre"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setModal({ type: "upload_chapter", bookId: book.id, nextOrder: book.chapters.length })}
                  >
                    <Plus className="h-3.5 w-3.5" /> Chapitre
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setModal({ type: "delete_book", bookId: book.id, title: book.title, chapterCount: book.chapters.length })}
                    aria-label="Supprimer le livre"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {book.chapters.map((chapter) => {
                const due = dueCounts[chapter.id] ?? 0;
                const needsReview = needsReviewCounts[chapter.id] ?? 0;
                const busy = isPending && pendingId === chapter.id;
                return (
                  <div key={chapter.id} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-foreground">{chapter.title}</p>
                      <div className="flex shrink-0 gap-1.5">
                        {isAdmin && needsReview > 0 && <Badge variant="accent">{needsReview} à vérifier</Badge>}
                        <Badge variant={STATUS_VARIANT[chapter.status]}>{STATUS_LABEL[chapter.status]}</Badge>
                      </div>
                    </div>
                    {chapter.status === "failed" && chapter.extractionError && (
                      <p className="mt-1.5 text-xs text-danger">{chapter.extractionError}</p>
                    )}
                    {chapter.status === "published" && masteryCounts[chapter.id] && <MasteryBar counts={masteryCounts[chapter.id]} />}
                    {chapter.status === "published" && (difficultCounts[chapter.id] ?? 0) > 0 && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-danger">
                        <ShieldAlert className="h-3 w-3" /> {difficultCounts[chapter.id]} carte
                        {(difficultCounts[chapter.id] ?? 0) > 1 ? "s" : ""} difficile
                        {(difficultCounts[chapter.id] ?? 0) > 1 ? "s" : ""}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {chapter.status === "published" && (
                        <>
                          <Link href={`/apps/el-profesor/chapters/${chapter.id}`}>
                            <Button variant="secondary" size="sm">
                              <BookOpen className="h-3.5 w-3.5" /> Fiches
                            </Button>
                          </Link>
                          <Link href={`/apps/el-profesor/chapters/${chapter.id}/review?mode=due`}>
                            <Button size="sm" disabled={due === 0}>
                              {due > 0 ? `Réviser (${due})` : "À jour"}
                            </Button>
                          </Link>
                          <Link href={`/apps/el-profesor/chapters/${chapter.id}/review?mode=free`}>
                            <Button variant="ghost" size="sm">
                              Révision libre
                            </Button>
                          </Link>
                        </>
                      )}

                      {isAdmin && (chapter.status === "pending" || chapter.status === "failed") && (
                        <Button size="sm" onClick={() => handleExtract(chapter.id)} disabled={busy}>
                          <Sparkles className="h-3.5 w-3.5" />
                          {busy ? (
                            <>
                              Extraction… {pendingStartedAt && <ElapsedTime startedAt={pendingStartedAt} />}
                            </>
                          ) : (
                            "Extraire"
                          )}
                        </Button>
                      )}
                      {isAdmin && chapter.status === "draft_ready" && (
                        <Link href={`/apps/el-profesor/chapters/${chapter.id}/admin-review`}>
                          <Button size="sm">
                            <ClipboardCheck className="h-3.5 w-3.5" /> Relire &amp; publier
                          </Button>
                        </Link>
                      )}
                      {isAdmin && chapter.status === "published" && (
                        <Link href={`/apps/el-profesor/chapters/${chapter.id}/admin-review`}>
                          <Button variant="ghost" size="sm">
                            Éditer
                          </Button>
                        </Link>
                      )}
                      {isAdmin && chapter.status === "published" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleExportCsv(chapter.id, chapter.title)}
                          disabled={exportingId === chapter.id}
                          aria-label="Exporter les flashcards en CSV"
                          title="Exporter les flashcards en CSV"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      {isAdmin && (chapter.status === "draft_ready" || chapter.status === "published") && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleComplement(chapter.id)}
                          disabled={busy}
                          title="Relit le PDF et ne génère que les notions pas encore couvertes"
                        >
                          <SearchCheck className="h-3.5 w-3.5" />
                          {busy ? (
                            <>
                              Analyse… {pendingStartedAt && <ElapsedTime startedAt={pendingStartedAt} />}
                            </>
                          ) : chapter.estimatedRemainingPasses ? (
                            `Compléter (≈${chapter.estimatedRemainingPasses})`
                          ) : (
                            "Compléter"
                          )}
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setModal({
                              type: "delete_chapter",
                              chapterId: chapter.id,
                              title: chapter.title,
                              flashcardCount: masteryCounts[chapter.id]?.total ?? 0,
                            })
                          }
                          aria-label="Supprimer le chapitre"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {modal?.type === "add_book" && (
        <AddBookDialog
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {modal?.type === "edit_book" && (
        <AddBookDialog
          book={modal.book}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {modal?.type === "upload_chapter" && (
        <UploadChapterDialog
          bookId={modal.bookId}
          nextOrder={modal.nextOrder}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {modal?.type === "delete_book" && (
        <ConfirmDeleteDialog
          title="Supprimer le livre ?"
          itemName={modal.title}
          consequences={[
            modal.chapterCount > 0
              ? `${modal.chapterCount} chapitre${modal.chapterCount > 1 ? "s" : ""} et tout leur contenu (fiches, flashcards, historique de révision)`
              : "Aucun chapitre pour l'instant",
            "Le PDF de chaque chapitre",
          ]}
          isPending={isPending}
          onConfirm={() => confirmDeleteBook(modal.bookId)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "delete_chapter" && (
        <ConfirmDeleteDialog
          title="Supprimer le chapitre ?"
          itemName={modal.title}
          consequences={[
            "Toutes les fiches et blocs générés pour ce chapitre",
            modal.flashcardCount > 0
              ? `${modal.flashcardCount} flashcard${modal.flashcardCount > 1 ? "s" : ""} et leur historique de révision`
              : "Les flashcards associées et leur historique de révision",
            "Le PDF source",
          ]}
          isPending={isPending}
          onConfirm={() => confirmDeleteChapter(modal.chapterId)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "gemini_settings" && (
        <GeminiSettingsDialog
          currentModel={geminiModel ?? "gemini-flash-latest"}
          onClose={() => {
            setModal(null);
            refresh();
          }}
        />
      )}

      <OnboardingTour moduleKey="el-profesor" steps={EL_PROFESOR_ONBOARDING_STEPS} open={tourOpen} onOpenChange={setTourOpen} />
    </div>
  );
}
