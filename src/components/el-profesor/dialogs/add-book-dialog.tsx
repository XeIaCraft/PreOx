"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { createBook, updateBook } from "@/app/apps/el-profesor/actions/library";
import { useToast } from "@/components/ui/toast";

export function AddBookDialog({
  book,
  onClose,
  onSaved,
}: {
  book?: { id: string; title: string; author: string | null; edition: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(book?.title ?? "");
  const [author, setAuthor] = useState(book?.author ?? "");
  const [edition, setEdition] = useState(book?.edition ?? "");

  function handleSave() {
    if (!title.trim()) return;
    startTransition(async () => {
      const result = book ? await updateBook(book.id, { title, author, edition }) : await createBook({ title, author, edition });
      if (result.error) toast(result.error, { variant: "error" });
      else onSaved();
    });
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
