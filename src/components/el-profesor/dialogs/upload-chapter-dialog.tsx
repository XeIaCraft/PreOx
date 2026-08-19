"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { uploadChapter } from "@/app/apps/el-profesor/actions/library";
import { useToast } from "@/components/ui/toast";

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
  const [file, setFile] = useState<File | null>(null);

  function handleSave() {
    if (!title.trim() || !file) return;
    startTransition(async () => {
      const result = await uploadChapter(bookId, title, nextOrder, file);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Chapitre importé.", { variant: "success" });
        onSaved();
      }
    });
  }

  return (
    <Modal title="Importer un chapitre" description="Un chapitre = un PDF." onClose={onClose} size="sm">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="chapter-title">Titre du chapitre</Label>
          <Input id="chapter-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="chapter-pdf">Fichier PDF</Label>
          <input
            id="chapter-pdf"
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-foreground-muted file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-primary-tint file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-strong"
          />
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={handleSave} disabled={isPending || !title.trim() || !file}>
          {isPending ? "Envoi…" : "Importer"}
        </Button>
      </div>
    </Modal>
  );
}
