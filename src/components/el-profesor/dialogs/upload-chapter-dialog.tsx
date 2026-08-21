"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { uploadChapter } from "@/app/apps/el-profesor/actions/library";
import { useToast } from "@/components/ui/toast";

function titleFromFilename(name: string): string {
  return name
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

export function UploadChapterDialog({
  bookId,
  nextOrder,
  onClose,
  onSaved,
}: {
  bookId: string;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  function handleFilesChange(fileList: FileList | null) {
    const selected = fileList ? Array.from(fileList) : [];
    setFiles(selected);
    setTitles(selected.map((f) => titleFromFilename(f.name)));
  }

  function handleSave() {
    if (files.length === 0) return;
    if (files.length === 1 && !title.trim()) return;

    startTransition(async () => {
      if (files.length === 1) {
        const result = await uploadChapter(bookId, title, nextOrder, files[0]);
        if (result.error) toast(result.error, { variant: "error" });
        else {
          toast(result.success ?? "Chapitre importé.", { variant: "success" });
          onSaved();
        }
        return;
      }

      // Bulk import (item 46 of the backlog) — sequential rather than
      // Promise.all: each upload is a real file transfer plus a storage
      // write, and running them one at a time keeps the progress count
      // meaningful and avoids hammering storage with N large uploads at once.
      let successCount = 0;
      let firstError: string | null = null;
      for (let i = 0; i < files.length; i++) {
        setProgress({ done: i, total: files.length });
        const chapterTitle = titles[i]?.trim() || titleFromFilename(files[i].name);
        const result = await uploadChapter(bookId, chapterTitle, nextOrder + i, files[i]);
        if (result.error) firstError = firstError ?? `« ${chapterTitle} » : ${result.error}`;
        else successCount++;
      }
      setProgress(null);

      if (successCount > 0) {
        toast(
          `${successCount} chapitre${successCount > 1 ? "s" : ""} importé${successCount > 1 ? "s" : ""}` +
            (firstError ? ` — ${files.length - successCount} échec(s).` : "."),
          { variant: successCount === files.length ? "success" : "error" }
        );
        onSaved();
      } else if (firstError) {
        toast(firstError, { variant: "error" });
      }
    });
  }

  const multi = files.length > 1;

  return (
    <Modal
      title={multi ? `Importer ${files.length} chapitres` : "Importer un chapitre"}
      description="Un chapitre = un PDF — sélectionnez plusieurs fichiers pour un import en masse."
      onClose={onClose}
      size={multi ? "md" : "sm"}
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="chapter-pdf">Fichier(s) PDF</Label>
          <input
            id="chapter-pdf"
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => handleFilesChange(e.target.files)}
            className="block w-full text-sm text-foreground-muted file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-primary-tint file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-strong"
          />
        </div>

        {files.length === 1 && (
          <div className="space-y-1.5">
            <Label htmlFor="chapter-title">Titre du chapitre</Label>
            <Input id="chapter-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
        )}

        {multi && (
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            <Label>Titre de chaque chapitre</Label>
            {files.map((f, i) => (
              <Input
                key={f.name + i}
                value={titles[i] ?? ""}
                onChange={(e) => setTitles((prev) => prev.map((t, ti) => (ti === i ? e.target.value : t)))}
                placeholder={f.name}
              />
            ))}
          </div>
        )}

        {progress && (
          <p className="text-xs text-foreground-subtle">
            Envoi en cours… {progress.done} / {progress.total}
          </p>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
        <Button onClick={handleSave} disabled={isPending || files.length === 0 || (files.length === 1 && !title.trim())}>
          {isPending ? "Envoi…" : multi ? `Importer ${files.length} chapitres` : "Importer"}
        </Button>
      </div>
    </Modal>
  );
}
