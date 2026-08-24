"use client";

import { useRef, useState, useTransition } from "react";
import { Trash2, Image as ImageIcon, X, Plus, FlaskConical, Lightbulb, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  updateFlashcard,
  deleteFlashcard,
  getFlashcardHistory,
  uploadFlashcardImage,
  removeFlashcardImage,
  updateFlashcardVariants,
  getFlashcardVariantStatsAction,
  updateFlashcardOcclusions,
  updateFlashcardCloze,
} from "@/app/apps/el-profesor/actions/extraction";
import { FlagsList } from "@/components/el-profesor/flags-list";
import { EditableCitations } from "@/components/el-profesor/editable-citations";
import { EditHistory } from "@/components/el-profesor/block-editor";
import { useToast } from "@/components/ui/toast";
import { fileToBase64 } from "@/lib/client-file";
import { parseClozeText, formatClozeText, maskClozeText } from "@/lib/el-profesor/cloze";
import type { FlashcardVariantStat } from "@/lib/el-profesor/dal";
import type { Citation, Flag, Flashcard, FlashcardVariant, ImageOcclusion } from "@/lib/el-profesor/types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Legend-hiding image occlusion ("retrouve la légende" — follow-up to item
 * 23): drag rectangles directly on the flashcard's image and name each one.
 * Every zone is masked on the front, all revealed on the back — one card
 * tests the whole diagram, not one card per zone.
 */
function OcclusionEditor({ flashcard, onChanged }: { flashcard: Flashcard; onChanged: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [occlusions, setOcclusions] = useState<ImageOcclusion[]>(flashcard.imageOcclusions);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  function pointFromEvent(e: React.PointerEvent): { x: number; y: number } | null {
    const el = wrapperRef.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
  }

  function handlePointerDown(e: React.PointerEvent) {
    const p = pointFromEvent(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragStart(p);
    setDragRect({ x: p.x, y: p.y, width: 0, height: 0 });
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragStart) return;
    const p = pointFromEvent(e);
    if (!p) return;
    setDragRect({
      x: Math.min(dragStart.x, p.x),
      y: Math.min(dragStart.y, p.y),
      width: Math.abs(p.x - dragStart.x),
      height: Math.abs(p.y - dragStart.y),
    });
  }

  function handlePointerUp() {
    setDragStart(null);
    setDragRect((rect) => {
      if (rect && rect.width > 0.02 && rect.height > 0.02) {
        setOcclusions((prev) => [...prev, { id: crypto.randomUUID(), ...rect, label: "" }]);
      }
      return null;
    });
  }

  function updateLabel(id: string, label: string) {
    setOcclusions((prev) => prev.map((o) => (o.id === id ? { ...o, label } : o)));
  }

  function removeOcclusion(id: string) {
    setOcclusions((prev) => prev.filter((o) => o.id !== id));
  }

  function handleSave() {
    const cleaned = occlusions.filter((o) => o.label.trim());
    startTransition(async () => {
      const result = await updateFlashcardOcclusions(flashcard.id, cleaned);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        setOcclusions(cleaned);
        onChanged();
      }
    });
  }

  if (!flashcard.imageUrl) return null;

  return (
    <div className="mt-3 border-t border-border pt-2">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
        <EyeOff className="h-3.5 w-3.5" /> Légende masquée
      </p>
      <p className="mt-1 text-[11px] text-foreground-subtle">Dessinez un rectangle sur l&apos;image pour chaque élément à faire deviner, puis nommez-le.</p>
      <div
        ref={wrapperRef}
        className="relative mt-2 w-full max-w-sm cursor-crosshair touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset */}
        <img src={flashcard.imageUrl} alt="" className="w-full rounded-[var(--radius-sm)] border border-border" draggable={false} />
        {occlusions.map((o) => (
          <div
            key={o.id}
            className="pointer-events-none absolute rounded-sm border-2 border-accent bg-accent/30"
            style={{ left: `${o.x * 100}%`, top: `${o.y * 100}%`, width: `${o.width * 100}%`, height: `${o.height * 100}%` }}
          />
        ))}
        {dragRect && (
          <div
            className="pointer-events-none absolute rounded-sm border-2 border-primary bg-primary/20"
            style={{ left: `${dragRect.x * 100}%`, top: `${dragRect.y * 100}%`, width: `${dragRect.width * 100}%`, height: `${dragRect.height * 100}%` }}
          />
        )}
      </div>
      <div className="mt-2 space-y-1.5">
        {occlusions.map((o, i) => (
          <div key={o.id} className="flex items-center gap-1.5">
            <span className="shrink-0 text-xs text-foreground-subtle">Zone {i + 1}</span>
            <input
              value={o.label}
              onChange={(e) => updateLabel(o.id, e.target.value)}
              placeholder="Nom de l'élément masqué"
              className="w-full rounded-[var(--radius-sm)] border border-border bg-surface p-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            <button type="button" onClick={() => removeOcclusion(o.id)} className="text-foreground-subtle hover:text-danger" aria-label="Retirer cette zone">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <Button variant="secondary" size="sm" className="mt-2" onClick={handleSave} disabled={isPending}>
        Enregistrer les zones masquées
      </Button>
    </div>
  );
}

/** Test de formulations (item 47) — alternate front wordings + their aggregate success rate from the review log. */
function VariantTester({ flashcard, onChanged }: { flashcard: Flashcard; onChanged: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [variants, setVariants] = useState<FlashcardVariant[]>(flashcard.variants);
  const [stats, setStats] = useState<FlashcardVariantStat[] | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  function addVariant() {
    setVariants((prev) => [...prev, { id: crypto.randomUUID(), text: "" }]);
  }

  function updateVariantText(id: string, text: string) {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, text } : v)));
  }

  function removeVariant(id: string) {
    setVariants((prev) => prev.filter((v) => v.id !== id));
  }

  function handleSaveVariants() {
    const cleaned = variants.map((v) => ({ id: v.id, text: v.text.trim() })).filter((v) => v.text);
    startTransition(async () => {
      const result = await updateFlashcardVariants(flashcard.id, cleaned);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        setVariants(cleaned);
        onChanged();
      }
    });
  }

  function handleLoadStats() {
    setLoadingStats(true);
    getFlashcardVariantStatsAction(flashcard.id, flashcard.front.text, variants)
      .then(setStats)
      .finally(() => setLoadingStats(false));
  }

  return (
    <div className="mt-3 border-t border-border pt-2">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
        <FlaskConical className="h-3.5 w-3.5" /> Formulations alternatives
      </p>
      <div className="mt-1.5 space-y-1.5">
        {variants.map((v) => (
          <div key={v.id} className="flex items-center gap-1.5">
            <input
              value={v.text}
              onChange={(e) => updateVariantText(v.id, e.target.value)}
              placeholder="Autre façon de poser la question"
              className="w-full rounded-[var(--radius-sm)] border border-border bg-surface p-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            <button type="button" onClick={() => removeVariant(v.id)} className="text-foreground-subtle hover:text-danger" aria-label="Retirer cette formulation">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={addVariant}>
            <Plus className="h-3.5 w-3.5" /> Ajouter une formulation
          </Button>
          <Button variant="secondary" size="sm" onClick={handleSaveVariants} disabled={isPending}>
            Enregistrer les formulations
          </Button>
          {flashcard.variants.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleLoadStats} disabled={loadingStats}>
              {loadingStats ? "Chargement…" : "Voir les statistiques"}
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <div className="mt-2 space-y-1">
          {stats
            .slice()
            .sort((a, b) => b.successRate - a.successRate)
            .map((s) => (
              <div key={s.variantId ?? "original"} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-foreground-muted">{s.variantId ? s.text : `${s.text} (originale)`}</span>
                <span className="shrink-0 text-foreground-subtle">
                  {s.attempts > 0 ? `${Math.round(s.successRate * 100)}% sur ${s.attempts}` : "aucune donnée"}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * Cloze deletion cards ("flashcards à trous", piste d'amélioration
 * 2026-08-24) — the admin marks blanks by wrapping them in `{{...}}`
 * directly in the passage; saving strips the markers (parseClozeText) and
 * persists plain text + the ranges to hide. An empty result (no markers
 * left) reverts the card to an ordinary Q&A card.
 */
function ClozeEditor({ flashcard, onChanged }: { flashcard: Flashcard; onChanged: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [rawText, setRawText] = useState(() => formatClozeText(flashcard.front.text, flashcard.clozeRanges));

  const { text: previewText, ranges: previewRanges } = parseClozeText(rawText);
  const masked = maskClozeText(previewText, previewRanges);

  function handleSave() {
    startTransition(async () => {
      const result = await updateFlashcardCloze(flashcard.id, rawText);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Enregistré.", { variant: "success" });
        onChanged();
      }
    });
  }

  return (
    <div className="mt-3 border-t border-border pt-2">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
        <EyeOff className="h-3.5 w-3.5" /> Texte à trous (cloze)
      </p>
      <p className="mt-1 text-xs text-foreground-subtle">
        Entourez chaque réponse à masquer avec des doubles accolades, ex. « Le propofol agit sur les récepteurs
        <code className="mx-1 rounded bg-surface-muted px-1">{"{{GABA-A}}"}</code>». Aucune accolade restante = carte question/réponse classique.
      </p>
      <textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        rows={3}
        placeholder="Ex. Le propofol agit sur les récepteurs {{GABA-A}}."
        className="mt-1.5 w-full rounded-[var(--radius-sm)] border border-border bg-surface p-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      />
      {previewRanges.length > 0 && (
        <p className="mt-1.5 text-xs text-foreground-subtle">
          Aperçu du recto : <span className="text-foreground-muted">{masked}</span>
        </p>
      )}
      <Button variant="secondary" size="sm" className="mt-1.5" onClick={handleSave} disabled={isPending}>
        Enregistrer le texte à trous
      </Button>
    </div>
  );
}

export function FlashcardEditor({
  flashcard,
  onChanged,
  onCitationClick,
  flags,
  onRequestImageCapture,
}: {
  flashcard: Flashcard;
  onChanged: () => void;
  onCitationClick?: (c: Citation) => void;
  flags?: Flag[];
  /** Jumps the PDF viewer to a suggested page and arms capture mode for this exact flashcard — see extraction-review-view's handleCaptureHint. Omitted wherever there's no PDF viewer alongside (e.g. nowhere outside admin review today). */
  onRequestImageCapture?: (page: number) => void;
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

        {flashcard.suggestedImagePage != null && !flashcard.imageUrl && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-accent/40 bg-accent-tint px-2.5 py-1.5 text-xs text-accent">
            <span className="flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 shrink-0" />
              Image suggérée p.{flashcard.suggestedImagePage}
              {flashcard.suggestedImageHint ? ` — ${flashcard.suggestedImageHint}` : ""}
            </span>
            {onRequestImageCapture && (
              <Button variant="secondary" size="sm" onClick={() => onRequestImageCapture(flashcard.suggestedImagePage!)}>
                Capturer
              </Button>
            )}
          </div>
        )}

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

      <OcclusionEditor flashcard={flashcard} onChanged={onChanged} />

      <ClozeEditor flashcard={flashcard} onChanged={onChanged} />

      <VariantTester flashcard={flashcard} onChanged={onChanged} />

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
