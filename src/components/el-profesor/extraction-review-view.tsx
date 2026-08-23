"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronUp, ChevronDown, FileText, PartyPopper, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Modal } from "@/components/ui/modal";
import { PdfViewer, type PdfHighlight, type CoverageEntry, type PdfSelection } from "@/components/el-profesor/pdf-viewer";
import { ProposeFromSelectionDialog } from "@/components/el-profesor/propose-from-selection-dialog";
import { LibrarySearch } from "@/components/el-profesor/library-search";
import { BlockEditor } from "@/components/el-profesor/block-editor";
import { FlashcardEditor } from "@/components/el-profesor/flashcard-editor";
import { getChapterPdfUrl } from "@/app/apps/el-profesor/actions/pdf";
import { publishFiche, finalizeChapterPublication, moveSubEntity, uploadFlashcardImage } from "@/app/apps/el-profesor/actions/extraction";
import { resolveFlags } from "@/app/apps/el-profesor/actions/flags";
import { useToast } from "@/components/ui/toast";
import type { SubEntityWithFiche } from "@/lib/el-profesor/dal";
import type { Citation, Flag, ChapterSourceKind } from "@/lib/el-profesor/types";

/** Read-only fallback for a chapter sourced from Word/PowerPoint (item 5 of the backlog) — no PDF to render here either, so admin review falls back to the plain extracted text. */
function SourceTextPanel({ text }: { text: string | null }) {
  return (
    <div className="h-full overflow-y-auto p-4">
      <p className="mb-3 text-xs text-foreground-subtle">
        Document source (Word/PowerPoint) — pas de PDF ni de citations liées à une page précise pour ce chapitre.
      </p>
      <pre className="whitespace-pre-wrap font-sans text-sm text-foreground-muted">{text || "Aucun texte source."}</pre>
    </div>
  );
}

export function ExtractionReviewView({
  chapterId,
  chapterTitle,
  subEntities,
  flagsByTarget,
  sourceKind = "pdf",
  sourceText = null,
}: {
  chapterId: string;
  chapterTitle: string;
  subEntities: SubEntityWithFiche[];
  flagsByTarget: Record<string, Flag[]>;
  sourceKind?: ChapterSourceKind;
  sourceText?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const withFiche = subEntities.filter((s) => s.fiche);
  const [selectedId, setSelectedId] = useState(withFiche[0]?.id ?? null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<PdfHighlight>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<PdfSelection | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (sourceKind !== "pdf") return;
    getChapterPdfUrl(chapterId).then((result) => setPdfUrl(result.url ?? null));
  }, [chapterId, sourceKind]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function subEntityFlagged(sub: SubEntityWithFiche) {
    return !!sub.fiche && (sub.fiche.blocks.some((b) => b.needsReview) || sub.fiche.flashcards.some((c) => c.needsReview));
  }

  const flaggedCount = withFiche.reduce(
    (sum, s) => sum + (s.fiche!.blocks.filter((b) => b.needsReview).length + s.fiche!.flashcards.filter((c) => c.needsReview).length),
    0
  );

  const coverage = useMemo<CoverageEntry[]>(() => {
    const entries: CoverageEntry[] = [];
    for (const sub of withFiche) {
      for (const block of sub.fiche!.blocks) {
        for (const c of block.citations) entries.push({ page: c.page, quote: c.quote, kind: "block" });
      }
      for (const card of sub.fiche!.flashcards) {
        for (const c of card.citations) entries.push({ page: c.page, quote: c.quote, kind: "flashcard" });
      }
    }
    return entries;
  }, [withFiche]);

  // Falls back to the list's first item when the current selection drops out
  // of view (e.g. toggling the filter on while a now-hidden entry is selected).
  const visibleSubEntities = onlyFlagged ? withFiche.filter(subEntityFlagged) : withFiche;
  const selected = visibleSubEntities.find((s) => s.id === selectedId) ?? visibleSubEntities[0] ?? null;
  const visibleBlocks = onlyFlagged ? (selected?.fiche?.blocks.filter((b) => b.needsReview) ?? []) : (selected?.fiche?.blocks ?? []);
  const visibleFlashcards = onlyFlagged
    ? (selected?.fiche?.flashcards.filter((c) => c.needsReview) ?? [])
    : (selected?.fiche?.flashcards ?? []);
  const selectedHasDraftContent =
    !!selected?.fiche &&
    (selected.fiche.status !== "published" ||
      selected.fiche.blocks.some((b) => b.status !== "published") ||
      selected.fiche.flashcards.some((c) => c.status !== "published"));
  const selectedFlagIds = selected?.fiche
    ? [...selected.fiche.blocks, ...selected.fiche.flashcards].flatMap((item) => (flagsByTarget[item.id] ?? []).map((f) => f.id))
    : [];

  function refresh() {
    startTransition(() => router.refresh());
  }

  // Image capture from the PDF (item 23): the crop comes back as a data
  // URL from PdfViewer's own canvas — held here until the admin picks which
  // of the current fiche's flashcards it belongs to.
  const [pendingCapture, setPendingCapture] = useState<string | null>(null);

  function handleAttachCapture(flashcardId: string) {
    if (!pendingCapture) return;
    const base64 = pendingCapture.split(",")[1] ?? "";
    startTransition(async () => {
      const result = await uploadFlashcardImage(flashcardId, base64, "image/png");
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Image ajoutée.", { variant: "success" });
        router.refresh();
      }
      setPendingCapture(null);
    });
  }

  function handleMoveSubEntity(subEntityId: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveSubEntity(subEntityId, direction);
      if (result.error) toast(result.error, { variant: "error" });
      else refresh();
    });
  }

  function handleResolveAllFlags(flagIds: string[]) {
    startTransition(async () => {
      const result = await resolveFlags(flagIds);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        refresh();
      }
    });
  }

  function handlePublishFiche(ficheId: string) {
    startTransition(async () => {
      const result = await publishFiche(ficheId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast("Fiche publiée.", { variant: "success" });
        refresh();
      }
    });
  }

  function handleFinalize() {
    if (!confirm("Publier tout ce qui reste en brouillon dans ce chapitre ?")) return;
    startTransition(async () => {
      const result = await finalizeChapterPublication(chapterId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast("Chapitre publié.", { variant: "success" });
        router.push("/apps/el-profesor");
      }
    });
  }

  function handleCitationClick(citation: Citation) {
    setHighlight({ page: citation.page, quote: citation.quote });
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setPdfModalOpen(true);
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col px-4 py-4 sm:px-6 md:h-[calc(100vh-4rem)]">
      <div className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-3 bg-background py-1">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/apps/el-profesor">
            <Button variant="ghost" size="icon" aria-label="Retour">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="truncate font-serif-display text-base font-medium text-foreground sm:text-lg">Relecture — {chapterTitle}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setSearchOpen(true)} aria-label="Rechercher dans la bibliothèque">
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" className="md:hidden" onClick={() => setPdfModalOpen(true)}>
            <FileText className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={handleFinalize} disabled={isPending}>
            <CheckCircle2 className="h-4 w-4" /> <span className="hidden sm:inline">Publier le chapitre</span>
          </Button>
        </div>
      </div>

      {flaggedCount > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-[var(--radius-md)] border border-border bg-surface-muted px-3 py-2">
          <span className="text-sm text-foreground-muted">{flaggedCount} élément(s) signalé(s) « à vérifier »</span>
          <label className="flex items-center gap-2 text-sm text-foreground-muted">
            Afficher seulement ceux-là
            <Switch checked={onlyFlagged} onCheckedChange={setOnlyFlagged} aria-label="Afficher seulement les éléments à vérifier" />
          </label>
        </div>
      )}

      <div className="min-h-0 flex-1 gap-4 lg:grid lg:grid-cols-[220px_1fr_1fr] lg:overflow-hidden">
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:mb-0 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:rounded-[var(--radius-lg)] lg:border lg:border-border lg:bg-surface lg:p-2 lg:px-2 lg:pb-2">
          {visibleSubEntities.map((sub, i) => {
            const hasDraft =
              sub.fiche!.status !== "published" ||
              sub.fiche!.blocks.some((b) => b.status !== "published") ||
              sub.fiche!.flashcards.some((c) => c.status !== "published");
            const cardCount = sub.fiche!.flashcards.length;
            return (
              <div key={sub.id} className="flex shrink-0 items-center gap-0.5 lg:w-full">
                {!onlyFlagged && (
                  <div className="hidden shrink-0 flex-col lg:flex">
                    <button
                      type="button"
                      onClick={() => handleMoveSubEntity(sub.id, "up")}
                      disabled={i === 0}
                      aria-label="Monter cette sous-entité"
                      className="text-foreground-subtle hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveSubEntity(sub.id, "down")}
                      disabled={i === visibleSubEntities.length - 1}
                      aria-label="Descendre cette sous-entité"
                      className="text-foreground-subtle hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedId(sub.id)}
                  className={`flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:w-full lg:justify-between lg:whitespace-normal lg:rounded-[var(--radius-sm)] lg:px-3 lg:py-2 lg:text-left ${
                    sub.id === selectedId
                      ? "bg-primary-tint text-primary-strong"
                      : "bg-surface-muted text-foreground-muted lg:bg-transparent lg:hover:bg-surface-muted"
                  }`}
                >
                  <span>{sub.name}</span>
                  <span className="flex shrink-0 gap-1.5">
                    {cardCount === 0 && <Badge variant="danger">0 carte</Badge>}
                    {hasDraft ? <Badge variant="accent">Brouillon</Badge> : <Badge variant="success">OK</Badge>}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="min-h-0 gap-4 md:grid md:grid-cols-2 lg:contents">
          <div className="min-h-0 rounded-[var(--radius-lg)] border border-border bg-surface p-4 md:overflow-y-auto lg:overflow-y-auto">
            {selected?.fiche ? (
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-serif-display text-lg font-medium text-foreground">{selected.fiche.title}</h2>
                    {selected.summary && <p className="mt-1 text-sm text-foreground-subtle">{selected.summary}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {selectedHasDraftContent && (
                      <Button size="sm" onClick={() => handlePublishFiche(selected.fiche!.id)} disabled={isPending}>
                        {selected.fiche.status === "published" ? "Publier les compléments" : "Publier cette fiche"}
                      </Button>
                    )}
                    {selectedFlagIds.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => handleResolveAllFlags(selectedFlagIds)} disabled={isPending}>
                        Résoudre les {selectedFlagIds.length} signalement{selectedFlagIds.length > 1 ? "s" : ""}
                      </Button>
                    )}
                  </div>
                </div>

                {onlyFlagged && visibleBlocks.length === 0 && visibleFlashcards.length === 0 ? (
                  <p className="mt-4 flex items-center gap-2 text-sm text-foreground-subtle">
                    <PartyPopper className="h-4 w-4" /> Rien à vérifier sur cette fiche.
                  </p>
                ) : (
                  <>
                    <div className="mt-3 space-y-3">
                      {visibleBlocks.map((block, i) => (
                        <BlockEditor
                          key={block.id}
                          block={block}
                          onChanged={refresh}
                          onCitationClick={handleCitationClick}
                          reorder={onlyFlagged ? undefined : { isFirst: i === 0, isLast: i === visibleBlocks.length - 1 }}
                          flags={flagsByTarget[block.id]}
                        />
                      ))}
                    </div>

                    <h3 className="mt-5 text-sm font-medium text-foreground">Flashcards</h3>
                    <div className="mt-2 space-y-3">
                      {visibleFlashcards.map((card) => (
                        <FlashcardEditor
                          key={card.id}
                          flashcard={card}
                          onChanged={refresh}
                          onCitationClick={handleCitationClick}
                          flags={flagsByTarget[card.id]}
                        />
                      ))}
                      {visibleFlashcards.length === 0 && (
                        <p className="text-sm text-foreground-subtle">Aucune flashcard générée pour cette fiche.</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-foreground-subtle">Sélectionnez une entrée.</p>
            )}
          </div>

          <div className="hidden min-h-0 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface md:block">
            {sourceKind !== "pdf" ? (
              <SourceTextPanel text={sourceText} />
            ) : pdfUrl ? (
              <PdfViewer url={pdfUrl} highlight={highlight} coverage={coverage} onSelection={setPendingSelection} onCapture={setPendingCapture} />
            ) : (
              <p className="p-4 text-sm text-foreground-subtle">Chargement du PDF…</p>
            )}
          </div>
        </div>
      </div>

      {pdfModalOpen && (
        <Modal title="Document source" onClose={() => setPdfModalOpen(false)} size="xl">
          <div className="-m-4 h-[75vh]">
            {sourceKind !== "pdf" ? (
              <SourceTextPanel text={sourceText} />
            ) : pdfUrl ? (
              <PdfViewer url={pdfUrl} highlight={highlight} coverage={coverage} onSelection={setPendingSelection} onCapture={setPendingCapture} />
            ) : (
              <p className="p-4 text-sm text-foreground-subtle">Chargement du PDF…</p>
            )}
          </div>
        </Modal>
      )}

      {searchOpen && (
        <Modal title="Rechercher" onClose={() => setSearchOpen(false)} size="md">
          <LibrarySearch autoFocus />
        </Modal>
      )}

      {pendingSelection && (
        <ProposeFromSelectionDialog
          chapterId={chapterId}
          chapterTitle={chapterTitle}
          subEntities={withFiche.map((s) => ({ id: s.id, name: s.name }))}
          selection={pendingSelection}
          onClose={() => setPendingSelection(null)}
          onSubmitted={() => {
            setPendingSelection(null);
            refresh();
          }}
        />
      )}

      {pendingCapture && (
        <Modal title="Associer l'image capturée" description="À quelle flashcard de cette fiche l'attacher ?" onClose={() => setPendingCapture(null)} size="sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- transient client-side crop preview, not a persisted asset */}
          <img src={pendingCapture} alt="" className="mb-3 max-h-40 w-full rounded-[var(--radius-sm)] border border-border object-contain" />
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {(selected?.fiche?.flashcards ?? []).map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => handleAttachCapture(card.id)}
                disabled={isPending}
                className="block w-full truncate rounded-[var(--radius-sm)] border border-border p-2 text-left text-sm text-foreground hover:bg-surface-muted disabled:opacity-50"
              >
                {card.front.text}
              </button>
            ))}
            {(selected?.fiche?.flashcards.length ?? 0) === 0 && <p className="text-sm text-foreground-subtle">Aucune flashcard sur cette fiche.</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
