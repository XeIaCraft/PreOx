"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronUp, ChevronDown, FileText, PartyPopper, Search, Merge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Modal } from "@/components/ui/modal";
import { PdfViewer, type PdfHighlight, type CoverageEntry, type PdfSelection } from "@/components/el-profesor/pdf-viewer";
import { CoverageInfoPanel, type CoverageInfoTarget } from "@/components/el-profesor/coverage-info-panel";
import { buildCoverageEntries } from "@/lib/el-profesor/coverage-entries";
import { blockToPlainText } from "@/lib/el-profesor/block-text";
import { ProposeFromSelectionDialog } from "@/components/el-profesor/propose-from-selection-dialog";
import { LibrarySearch } from "@/components/el-profesor/library-search";
import { BlockEditor } from "@/components/el-profesor/block-editor";
import { FlashcardEditor } from "@/components/el-profesor/flashcard-editor";
import { RenameFicheButton } from "@/components/el-profesor/inline-rename-fiche";
import { MergeFichesForm } from "@/components/el-profesor/merge-fiches-form";
import { getChapterPdfUrl } from "@/app/apps/el-profesor/actions/pdf";
import { publishFiche, finalizeChapterPublication, moveSubEntity, uploadFlashcardImage } from "@/app/apps/el-profesor/actions/extraction";
import { resolveFlags } from "@/app/apps/el-profesor/actions/flags";
import { useToast } from "@/components/ui/toast";
import { uploadImageDirect } from "@/lib/el-profesor/client-image-upload";
import { EL_PROFESOR_FLASHCARD_IMAGE_BUCKET } from "@/lib/el-profesor/storage-constants";
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
  const [showMerge, setShowMerge] = useState(false);

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

  const coverage = useMemo<CoverageEntry[]>(() => buildCoverageEntries(withFiche), [withFiche]);

  // Item 26 follow-up (requested 2026-08-24): clicking a coverage rectangle
  // on the PDF shows which block/flashcard it came from, with a jump-to
  // button — switching sub-entity and/or clearing the "à vérifier
  // seulement" filter first if either would otherwise hide the target.
  const [coverageInfo, setCoverageInfo] = useState<CoverageInfoTarget | null>(null);
  const coverageNavTarget = useRef<{ subEntityId: string; id: string; kind: "block" | "flashcard"; needsReview: boolean } | null>(null);
  // Bumped on every "Voir dans la fiche" click so the effect below re-runs
  // even when neither selectedId nor onlyFlagged actually needs to change
  // (target already visible) — always waits for the post-navigation commit
  // before scrolling, rather than racing a synchronous DOM lookup against a
  // tab switch and/or the "à vérifier seulement" filter being cleared.
  const [navSeq, setNavSeq] = useState(0);

  useEffect(() => {
    if (navSeq === 0) return;
    const nav = coverageNavTarget.current;
    if (!nav) return;
    requestAnimationFrame(() => {
      document.getElementById(`review-${nav.kind}-${nav.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [navSeq]);

  function handleCoverageClick(entry: CoverageEntry) {
    const sub = withFiche.find((s) =>
      entry.kind === "block" ? s.fiche!.blocks.some((b) => b.id === entry.id) : s.fiche!.flashcards.some((c) => c.id === entry.id)
    );
    if (!sub) return;
    if (entry.kind === "block") {
      const block = sub.fiche!.blocks.find((b) => b.id === entry.id)!;
      setCoverageInfo({ kind: "block", subEntityName: sub.name, blockType: block.blockType, excerpt: blockToPlainText(block.blockType, block.content).slice(0, 400) });
      coverageNavTarget.current = { subEntityId: sub.id, id: block.id, kind: "block", needsReview: block.needsReview };
    } else {
      const card = sub.fiche!.flashcards.find((c) => c.id === entry.id)!;
      setCoverageInfo({ kind: "flashcard", subEntityName: sub.name, front: card.front.text, back: card.back.text });
      coverageNavTarget.current = { subEntityId: sub.id, id: card.id, kind: "flashcard", needsReview: card.needsReview };
    }
  }

  function handleCoverageNavigate() {
    const nav = coverageNavTarget.current;
    if (!nav) return;
    setCoverageInfo(null);
    if (onlyFlagged && !nav.needsReview) setOnlyFlagged(false);
    if (nav.subEntityId !== selectedId) setSelectedId(nav.subEntityId);
    setNavSeq((n) => n + 1);
  }

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
  // of the current fiche's flashcards it belongs to (unless the capture was
  // triggered from a specific flashcard's suggestion hint, see below, in
  // which case it's attached straight away with no chooser).
  const [pendingCapture, setPendingCapture] = useState<string | null>(null);
  const [directCaptureFlashcardId, setDirectCaptureFlashcardId] = useState<string | null>(null);
  const [captureRequest, setCaptureRequest] = useState<{ page: number; token: number } | null>(null);
  const captureRequestTokenRef = useRef(0);

  function attachImage(flashcardId: string, dataUrl: string) {
    startTransition(async () => {
      // Uploaded directly to Storage via a signed URL rather than sent as
      // base64 through this Server Action — a PDF-page crop at real screen
      // resolution routinely exceeds Vercel's platform-level request body
      // cap for serverless functions (~4.5 MB), which surfaced only as an
      // opaque redacted error with no useful message (see
      // createImageUploadTarget's doc comment for the full story).
      const blob = await fetch(dataUrl).then((r) => r.blob());
      const uploaded = await uploadImageDirect(EL_PROFESOR_FLASHCARD_IMAGE_BUCKET, `${flashcardId}-${Date.now()}.png`, blob, "image/png");
      if ("error" in uploaded) {
        toast(uploaded.error, { variant: "error" });
        return;
      }
      const result = await uploadFlashcardImage(flashcardId, uploaded.url);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Image ajoutée.", { variant: "success" });
        router.refresh();
      }
    });
  }

  function handlePdfCapture(dataUrl: string) {
    if (directCaptureFlashcardId) {
      attachImage(directCaptureFlashcardId, dataUrl);
      setDirectCaptureFlashcardId(null);
    } else {
      setPendingCapture(dataUrl);
    }
  }

  function handleAttachCapture(flashcardId: string) {
    if (!pendingCapture) return;
    attachImage(flashcardId, pendingCapture);
    setPendingCapture(null);
  }

  /** "Capturer" button on a flashcard's suggested-image hint — jumps the PDF straight to the hinted page and arms capture mode, skipping the target-flashcard chooser since we already know which card this is for. */
  function handleCaptureHint(flashcardId: string, page: number) {
    setDirectCaptureFlashcardId(flashcardId);
    captureRequestTokenRef.current += 1;
    setCaptureRequest({ page, token: captureRequestTokenRef.current });
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setPdfModalOpen(true);
    }
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
                  // Visible at every width (was desktop-only — with no other way to
                  // reorder a chapter's sub-entities, that left mobile with none at
                  // all). Up/down works fine as a mental model here even though this
                  // list scrolls horizontally below lg — it's still just "earlier"/
                  // "later" in the chapter, same as the vertical desktop layout.
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => handleMoveSubEntity(sub.id, "up")}
                      disabled={i === 0}
                      aria-label="Monter cette sous-entité"
                      className="p-1 text-foreground-subtle hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveSubEntity(sub.id, "down")}
                      disabled={i === visibleSubEntities.length - 1}
                      aria-label="Descendre cette sous-entité"
                      className="p-1 text-foreground-subtle hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
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
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h2 className="font-serif-display text-lg font-medium text-foreground">{selected.fiche.title}</h2>
                      <RenameFicheButton ficheId={selected.fiche.id} currentTitle={selected.fiche.title} onRenamed={refresh} />
                    </div>
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
                    {withFiche.length >= 2 && (
                      <Button variant="ghost" size="sm" onClick={() => setShowMerge((v) => !v)}>
                        <Merge className="h-3.5 w-3.5" /> Fusionner
                      </Button>
                    )}
                  </div>
                </div>

                {showMerge && (
                  <MergeFichesForm
                    fiches={[
                      { ficheId: selected.fiche.id, ficheTitle: selected.fiche.title },
                      ...withFiche.filter((s) => s.id !== selected.id).map((s) => ({ ficheId: s.fiche!.id, ficheTitle: s.fiche!.title })),
                    ]}
                    onChanged={() => {
                      setShowMerge(false);
                      refresh();
                    }}
                  />
                )}

                {onlyFlagged && visibleBlocks.length === 0 && visibleFlashcards.length === 0 ? (
                  <p className="mt-4 flex items-center gap-2 text-sm text-foreground-subtle">
                    <PartyPopper className="h-4 w-4" /> Rien à vérifier sur cette fiche.
                  </p>
                ) : (
                  <>
                    <div className="mt-3 space-y-3">
                      {visibleBlocks.map((block, i) => (
                        <div key={block.id} id={`review-block-${block.id}`} className="scroll-mt-4">
                          <BlockEditor
                            block={block}
                            onChanged={refresh}
                            onCitationClick={handleCitationClick}
                            reorder={onlyFlagged ? undefined : { isFirst: i === 0, isLast: i === visibleBlocks.length - 1 }}
                            flags={flagsByTarget[block.id]}
                          />
                        </div>
                      ))}
                    </div>

                    <h3 className="mt-5 text-sm font-medium text-foreground">Flashcards</h3>
                    <div className="mt-2 space-y-3">
                      {visibleFlashcards.map((card) => (
                        <div key={card.id} id={`review-flashcard-${card.id}`} className="scroll-mt-4">
                          <FlashcardEditor
                            flashcard={card}
                            onChanged={refresh}
                            onCitationClick={handleCitationClick}
                            flags={flagsByTarget[card.id]}
                            onRequestImageCapture={(page) => handleCaptureHint(card.id, page)}
                          />
                        </div>
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

          <div className="relative hidden min-h-0 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface md:block">
            {sourceKind !== "pdf" ? (
              <SourceTextPanel text={sourceText} />
            ) : pdfUrl ? (
              <PdfViewer
                url={pdfUrl}
                highlight={highlight}
                coverage={coverage}
                onSelection={setPendingSelection}
                onCapture={handlePdfCapture}
                captureRequest={captureRequest}
                onCoverageClick={handleCoverageClick}
              />
            ) : (
              <p className="p-4 text-sm text-foreground-subtle">Chargement du PDF…</p>
            )}
            {coverageInfo && <CoverageInfoPanel target={coverageInfo} onClose={() => setCoverageInfo(null)} onNavigate={handleCoverageNavigate} />}
          </div>
        </div>
      </div>

      {pdfModalOpen && (
        <Modal title="Document source" onClose={() => setPdfModalOpen(false)} size="xl">
          <div className="relative -m-4 h-[75vh]">
            {sourceKind !== "pdf" ? (
              <SourceTextPanel text={sourceText} />
            ) : pdfUrl ? (
              <PdfViewer
                url={pdfUrl}
                highlight={highlight}
                coverage={coverage}
                onSelection={setPendingSelection}
                onCapture={handlePdfCapture}
                captureRequest={captureRequest}
                onCoverageClick={handleCoverageClick}
              />
            ) : (
              <p className="p-4 text-sm text-foreground-subtle">Chargement du PDF…</p>
            )}
            {coverageInfo && (
              <CoverageInfoPanel
                target={coverageInfo}
                onClose={() => setCoverageInfo(null)}
                onNavigate={() => {
                  handleCoverageNavigate();
                  setPdfModalOpen(false);
                }}
              />
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
