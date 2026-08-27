"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { createBook, updateBook, uploadBookCover, createNewEditionOfBook } from "@/app/apps/el-profesor/actions/library";
import { useToast } from "@/components/ui/toast";
import { uploadImageDirect } from "@/lib/el-profesor/client-image-upload";
import { EL_PROFESOR_COVER_BUCKET } from "@/lib/el-profesor/storage-constants";

const MAX_COVER_BYTES = 5 * 1024 * 1024;

export function AddBookDialog({
  book,
  newEditionOf,
  onClose,
  onSaved,
}: {
  book?: { id: string; title: string; author: string | null; edition: string | null; theme?: string | null };
  /** New edition of this book (item 6 of the backlog) — mutually exclusive with `book`: creates a fresh book chained to this one instead of editing it. */
  newEditionOf?: { id: string; title: string; author: string | null; edition: string | null; theme: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(book?.title ?? newEditionOf?.title ?? "");
  const [author, setAuthor] = useState(book?.author ?? newEditionOf?.author ?? "");
  const [edition, setEdition] = useState(book?.edition ?? newEditionOf?.edition ?? "");
  const [theme, setTheme] = useState(book?.theme ?? newEditionOf?.theme ?? "");
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  function handleSave() {
    if (!title.trim()) return;
    startTransition(async () => {
      const result = newEditionOf
        ? await createNewEditionOfBook(newEditionOf.id, { title, author, edition, theme })
        : book
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
    const ext = file.type.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
    uploadImageDirect(EL_PROFESOR_COVER_BUCKET, `${book.id}.${ext}`, file, file.type)
      .then((uploaded) => {
        if ("error" in uploaded) {
          toast(uploaded.error, { variant: "error" });
          return;
        }
        return uploadBookCover(book.id, uploaded.url).then((result) => {
          if (result.error) toast(result.error, { variant: "error" });
          else onSaved();
        });
      })
      .catch((err) =>
        toast(err instanceof Error ? `Échec de l'envoi de l'image : ${err.message}` : "Échec de l'envoi de l'image.", { variant: "error" })
      )
      .finally(() => setUploadingCover(false));
  }

  return (
    <Modal
      title={newEditionOf ? `Nouvelle édition de « ${newEditionOf.title} »` : book ? "Modifier le livre" : "Ajouter un livre"}
      description={newEditionOf ? "L'ancienne édition sera archivée (réversible) — ses chapitres restent tels quels, à réimporter ici si besoin." : undefined}
      onClose={onClose}
      size="sm"
    >
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
          {newEditionOf ? "Créer la nouvelle édition" : book ? "Enregistrer" : "Créer"}
        </Button>
      </div>
    </Modal>
  );
}
