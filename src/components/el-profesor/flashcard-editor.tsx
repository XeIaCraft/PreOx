"use client";

import { useRef, useState, useTransition } from "react";
import { Trash2, Image as ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  updateFlashcard,
  deleteFlashcard,
  getFlashcardHistory,
  uploadFlashcardImage,
  removeFlashcardImage,
} from "@/app/apps/el-profesor/actions/extraction";
import { FlagsList } from "@/components/el-profesor/flags-list";
import { EditableCitations } from "@/components/el-profesor/editable-citations";
import { EditHistory } from "@/components/el-profesor/block-editor";
import { useToast } from "@/components/ui/toast";
import { fileToBase64 } from "@/lib/client-file";
import type { Citation, Flag, Flashcard } from "@/lib/el-profesor/types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function FlashcardEditor({
  flashcard,
  onChanged,
  onCitationClick,
  flags,
}: {
  flashcard: Flashcard;
  onChanged: () => void;
  onCitationClick?: (c: Citation) => void;
  flags?: Flag[];
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [front, setFront] = useState(flashcard.front.text);
  const [back, setBack] = useState(flashcard.back.text);
  const [citations, setCitations] = useState(flashcard.citations);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  function handleSave() {
    startTransition(async () => {
      const result = await updateFlashcard(flashcard.id, { front: { text: front }, back: { text: back }, citations });
      if (result.error) toast(result.error, { variant: "error" });
      else onChanged();
    });
  }

  function handleDelete() {
    if (!confirm("Supprimer cette flashcard ?")) return;
    startTransition(async () => {
      const result = await deleteFlashcard(flashcard.id);
      if (result.error) toast(result.error, { variant: "error" });
      else onChanged();
    });
  }

  function handleImageSelected(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Seules les images sont acceptées.", { variant: "error" });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast("Image trop lourde (5 Mo maximum).", { variant: "error" });
      return;
    }
    setUploadingImage(true);
    fileToBase64(file)
      .then((base64) => uploadFlashcardImage(flashcard.id, base64, file.type))
      .then((result) => {
        if (result.error) toast(result.error, { variant: "error" });
        else onChanged();
      })
      .catch(() => toast("Échec de l'envoi de l'image.", { variant: "error" }))
      .finally(() => setUploadingImage(false));
  }

  function handleRemoveImage() {
    startTransition(async () => {
      const result = await removeFlashcardImage(flashcard.id);
      if (result.error) toast(result.error, { variant: "error" });
      else onChanged();
    });
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Flashcard</span>
        <div className="flex gap-1.5">
          {flashcard.status === "draft" && <Badge variant="neutral">Brouillon</Badge>}
          {flashcard.needsReview && <Badge variant="accent">À vérifier</Badge>}
        </div>
      </div>
      <div className="mt-2 space-y-2">
        <textarea
          value={front}
          onChange={(e) => setFront(e.target.value)}
          rows={2}
          placeholder="Recto (question)"
          className="w-full rounded-[var(--radius-sm)] border border-border bg-surface p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
        <textarea
          value={back}
          onChange={(e) => setBack(e.target.value)}
          rows={2}
          placeholder="Verso (réponse)"
          className="w-full rounded-[var(--radius-sm)] border border-border bg-surface p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />

        <div className="flex items-center gap-2">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              handleImageSelected(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {flashcard.imageUrl ? (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset */}
              <img src={flashcard.imageUrl} alt={flashcard.imageAlt ?? ""} className="h-16 w-16 rounded-[var(--radius-sm)] border border-border object-cover" />
              <Button variant="ghost" size="sm" onClick={handleRemoveImage} disabled={isPending}>
                <X className="h-3.5 w-3.5" /> Retirer l&apos;image
              </Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}>
              <ImageIcon className="h-3.5 w-3.5" />
              {uploadingImage ? "Envoi…" : "Ajouter une image"}
            </Button>
          )}
        </div>
      </div>

      <FlagsList flags={flags} onResolved={onChanged} />

      <EditableCitations citations={citations} onChange={setCitations} onCitationClick={onCitationClick} />

      <EditHistory targetId={flashcard.id} fetcher={getFlashcardHistory} />

      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={handleDelete} disabled={isPending}>
          <Trash2 className="h-3.5 w-3.5" /> Supprimer
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
