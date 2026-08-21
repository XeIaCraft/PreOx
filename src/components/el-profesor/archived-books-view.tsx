"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Archive, Download, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { exportBookArchive, unarchiveBook } from "@/app/apps/el-profesor/actions/archive";
import type { Book } from "@/lib/el-profesor/types";

export function ArchivedBooksView({ books }: { books: Book[] }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleDownload(book: Book) {
    startTransition(async () => {
      const result = await exportBookArchive(book.id);
      if ("error" in result) {
        toast(result.error, { variant: "error" });
        return;
      }
      const blob = new Blob([result.content], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${book.title.replace(/[^\w\s-]/g, "").trim() || "livre"}-archive.json`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  function handleUnarchive(book: Book) {
    startTransition(async () => {
      const result = await unarchiveBook(book.id);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Livre réactivé.", { variant: "success" });
        window.location.reload();
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/apps/el-profesor" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground-subtle hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour à la bibliothèque
      </Link>
      <h1 className="flex items-center gap-2 font-serif-display text-2xl font-medium text-foreground">
        <Archive className="h-5 w-5" /> Livres archivés
      </h1>
      <p className="mt-1 text-sm text-foreground-muted">
        Retirés de la bibliothèque active mais rien n&apos;a été supprimé — réactivez-les à tout moment.
      </p>

      {books.length === 0 ? (
        <p className="mt-6 text-sm text-foreground-subtle">Aucun livre archivé.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {books.map((book) => (
            <li key={book.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{book.title}</p>
                <p className="text-xs text-foreground-subtle">
                  Archivé le {book.archivedAt ? new Date(book.archivedAt).toLocaleDateString("fr-FR") : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button variant="ghost" size="icon" onClick={() => handleDownload(book)} disabled={isPending} aria-label="Télécharger l'export" title="Télécharger l'export">
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="secondary" size="sm" onClick={() => handleUnarchive(book)} disabled={isPending}>
                  <Undo2 className="h-3.5 w-3.5" /> Réactiver
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
