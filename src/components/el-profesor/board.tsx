"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GraduationCap, Plus, Trash2, Sparkles, BookOpen, ClipboardCheck, SearchCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { AddBookDialog } from "@/components/el-profesor/dialogs/add-book-dialog";
import { UploadChapterDialog } from "@/components/el-profesor/dialogs/upload-chapter-dialog";
import { deleteBook, deleteChapter } from "@/app/apps/el-profesor/actions/library";
import { extractChapter, extractChapterComplementary } from "@/app/apps/el-profesor/actions/extraction";
import type { BookWithChapters, ChapterDueCounts } from "@/lib/el-profesor/dal";
import type { ChapterStatus } from "@/lib/el-profesor/types";

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

type ModalState = { type: "add_book" } | { type: "upload_chapter"; bookId: string; nextOrder: number } | null;

export function ElProfesorBoard({
  books,
  dueCounts,
  isAdmin,
}: {
  books: BookWithChapters[];
  dueCounts: ChapterDueCounts;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [modal, setModal] = useState<ModalState>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function refresh() {
    startTransition(() => router.refresh());
  }

  function handleExtract(chapterId: string) {
    setPendingId(chapterId);
    startTransition(async () => {
      const result = await extractChapter(chapterId);
      setPendingId(null);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Extraction terminée.", { variant: "success" });
        refresh();
      }
    });
  }

  function handleComplement(chapterId: string) {
    setPendingId(chapterId);
    startTransition(async () => {
      const result = await extractChapterComplementary(chapterId);
      setPendingId(null);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Terminé.", { variant: "success" });
        refresh();
      }
    });
  }

  function handleDeleteChapter(chapterId: string) {
    if (!confirm("Supprimer ce chapitre et tout son contenu généré ?")) return;
    setPendingId(chapterId);
    startTransition(async () => {
      const result = await deleteChapter(chapterId);
      setPendingId(null);
      if (result.error) toast(result.error, { variant: "error" });
      else refresh();
    });
  }

  function handleDeleteBook(bookId: string) {
    if (!confirm("Supprimer ce livre et tous ses chapitres ?")) return;
    startTransition(async () => {
      const result = await deleteBook(bookId);
      if (result.error) toast(result.error, { variant: "error" });
      else refresh();
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
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
        {isAdmin && (
          <Button onClick={() => setModal({ type: "add_book" })}>
            <Plus className="h-4 w-4" /> Ajouter un livre
          </Button>
        )}
      </div>

      {books.length === 0 && (
        <div className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
          Aucun livre pour l&apos;instant.{isAdmin ? " Ajoutez-en un pour commencer." : " Un administrateur doit d'abord en importer."}
        </div>
      )}

      <div className="mt-8 space-y-8">
        {books.map((book) => (
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
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setModal({ type: "upload_chapter", bookId: book.id, nextOrder: book.chapters.length })}
                  >
                    <Plus className="h-3.5 w-3.5" /> Chapitre
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteBook(book.id)} aria-label="Supprimer le livre">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {book.chapters.map((chapter) => {
                const due = dueCounts[chapter.id] ?? 0;
                const busy = isPending && pendingId === chapter.id;
                return (
                  <div key={chapter.id} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-foreground">{chapter.title}</p>
                      <Badge variant={STATUS_VARIANT[chapter.status]}>{STATUS_LABEL[chapter.status]}</Badge>
                    </div>
                    {chapter.status === "failed" && chapter.extractionError && (
                      <p className="mt-1.5 text-xs text-danger">{chapter.extractionError}</p>
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
                          <Sparkles className="h-3.5 w-3.5" /> {busy ? "Extraction…" : "Extraire"}
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
                      {isAdmin && (chapter.status === "draft_ready" || chapter.status === "published") && (
                        <Button variant="secondary" size="sm" onClick={() => handleComplement(chapter.id)} disabled={busy} title="Relit le PDF et ne génère que les notions pas encore couvertes">
                          <SearchCheck className="h-3.5 w-3.5" /> {busy ? "Analyse…" : "Compléter"}
                        </Button>
                      )}
                      {isAdmin && (
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteChapter(chapter.id)} aria-label="Supprimer le chapitre">
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
    </div>
  );
}
