"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { createBook, updateBook, uploadBookCover } from "@/app/apps/el-profesor/actions/library";
import { useToast } from "@/components/ui/toast";
import { fileToBase64 } from "@/lib/client-file";

const MAX_COVER_BYTES = 5 * 1024 * 1024;

export function AddBookDialog({
  book,
  onClose,
  onSaved,
}: {
  book?: { id: string; title: string; author: string | null; edition: string | null; theme?: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(book?.title ?? "");
  const [author, setAuthor] = useState(book?.author ?? "");
  const [edition, setEdition] = useState(book?.edition ?? "");
  const [theme, setTheme] = useState(book?.theme ?? "");
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  function handleSave() {
    if (!title.trim()) return;
    startTransition(async () => {
      const result = book
        ? await updateBook(book.id, { title, author, edition, theme })
        : await createBook({ title, author, edition, theme });
      if (result.error) toast(result.error, { variant: "error" });
      else onSaved();
    });
  }

  function handleCoverSelected(file: File | undefined) {
    if (!file || !book) return;
    if (!file.type.startsWith("image/")) {
      toast("Seules les images sont acceptées.", { variant: "error" });
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      toast("Image trop lourde (5 Mo maximum).", { variant: "error" });
      return;
    }
    setUploadingCover(true);
    fileToBase64(file)
      .then((base64) => uploadBookCover(book.id, base64, file.type))
      .then((result) => {
        if (result.error) toast(result.error, { variant: "error" });
        else onSaved();
      })
      .catch(() => toast("Échec de l'envoi de l'image.", { variant: "error" }))
      .finally(() => setUploadingCover(false));
  }

  return (
    <Modal title={book ? "Modifier le livre" : "Ajouter un livre"} onClose={onClose} size="sm">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="book-title">Titre</Label>
          <Input id="book-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="book-author">Auteur</Label>
          <Input id="book-author" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="book-edition">Édition</Label>
          <Input id="book-edition" value={edition} onChange={(e) => setEdition(e.target.value)} placeholder="ex. 5e édition" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="book-theme">Spécialité / thème</Label>
          <Input id="book-theme" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="ex. Cardiologie" />
        </div>
        {book && (
          <div className="space-y-1.5">
            <Label>Image de couverture</Label>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handleCoverSelected(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button variant="secondary" size="sm" onClick={() => coverInputRef.current?.click()} disabled={uploadingCover}>
              <Upload className="h-4 w-4" />
              {uploadingCover ? "Envoi…" : "Choisir une image"}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={handleSave} disabled={isPending || !title.trim()}>
          {book ? "Enregistrer" : "Créer"}
        </Button>
      </div>
    </Modal>
  );
}
