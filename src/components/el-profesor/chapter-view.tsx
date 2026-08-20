"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FicheViewer } from "@/components/el-profesor/fiche-viewer";
import { LibrarySearch } from "@/components/el-profesor/library-search";
import { PdfViewer, type PdfHighlight, type CoverageEntry, type PdfSelection } from "@/components/el-profesor/pdf-viewer";
import { ProposeFromSelectionDialog } from "@/components/el-profesor/propose-from-selection-dialog";
import { getChapterPdfUrl } from "@/app/apps/el-profesor/actions/pdf";
import { getLastSubEntity, setLastSubEntity, setLastChapter } from "@/lib/el-profesor/local-prefs";
import type { SubEntityWithFiche } from "@/lib/el-profesor/dal";
import type { Citation } from "@/lib/el-profesor/types";

export function ChapterView({
  chapterId,
  chapterTitle,
  subEntities,
  initialEntityId,
}: {
  chapterId: string;
  chapterTitle: string;
  subEntities: SubEntityWithFiche[];
  initialEntityId?: string;
}) {
  const router = useRouter();
  const withFiche = subEntities.filter((s) => s.fiche);
  // Resumes the last sub-entity viewed in this chapter (localStorage) unless
  // there's an explicit deep link. Lazy initializer, same pattern as the
  // other one-time impure reads in this module — runs once at mount.
  const [selectedId, setSelectedId] = useState(() => {
    if (initialEntityId && withFiche.some((s) => s.id === initialEntityId)) return initialEntityId;
    const saved = getLastSubEntity(chapterId);
    if (saved && withFiche.some((s) => s.id === saved)) return saved;
    return withFiche[0]?.id ?? null;
  });
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<PdfHighlight>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<PdfSelection | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    getChapterPdfUrl(chapterId).then((result) => setPdfUrl(result.url ?? null));
  }, [chapterId]);

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

  useEffect(() => {
    if (selectedId) setLastSubEntity(chapterId, selectedId);
  }, [chapterId, selectedId]);

  useEffect(() => {
    setLastChapter(chapterId);
  }, [chapterId]);

  const selected = withFiche.find((s) => s.id === selectedId) ?? null;

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

  const swipeStartX = useRef<number | null>(null);

  function handleContentPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch") return;
    swipeStartX.current = e.clientX;
  }

  function handleContentPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const startX = swipeStartX.current;
    swipeStartX.current = null;
    if (e.pointerType !== "touch" || startX === null) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) < 60) return;
    const index = withFiche.findIndex((s) => s.id === selectedId);
    if (index === -1) return;
    if (dx < 0 && index < withFiche.length - 1) setSelectedId(withFiche[index + 1].id);
    else if (dx > 0 && index > 0) setSelectedId(withFiche[index - 1].id);
  }

  function handleCitationClick(citation: Citation) {
    setHighlight({ page: citation.page, quote: citation.quote });
    // Below lg there's no room for a persistent PDF panel — jump straight
    // into the source instead of leaving the user to find a "voir le PDF" button.
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
          <h1 className="truncate font-serif-display text-lg font-medium text-foreground">{chapterTitle}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setSearchOpen(true)} aria-label="Rechercher dans la bibliothèque">
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" className="md:hidden" onClick={() => setPdfModalOpen(true)}>
            <FileText className="h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 gap-4 lg:grid lg:grid-cols-[220px_1fr_1fr] lg:overflow-hidden">
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:mb-0 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:rounded-[var(--radius-lg)] lg:border lg:border-border lg:bg-surface lg:p-2 lg:px-2 lg:pb-2">
          {withFiche.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => setSelectedId(sub.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-sm transition-colors lg:block lg:w-full lg:shrink lg:whitespace-normal lg:rounded-[var(--radius-sm)] lg:px-3 lg:py-2 lg:text-left ${
                sub.id === selectedId
                  ? "bg-primary-tint text-primary-strong"
                  : "bg-surface-muted text-foreground-muted lg:bg-transparent lg:hover:bg-surface-muted"
              }`}
            >
              {sub.name}
            </button>
          ))}
        </div>

        {/* Content + PDF: side by side from the md (tablet) breakpoint up, so
            tablets get a real reading view instead of inheriting the mobile
            stack or squeezing into the desktop's 3-column layout. */}
        <div className="min-h-0 gap-4 md:grid md:grid-cols-2 lg:contents">
          <div
            className="min-h-0 rounded-[var(--radius-lg)] border border-border bg-surface p-5 md:overflow-y-auto lg:overflow-y-auto"
            onPointerDown={handleContentPointerDown}
            onPointerUp={handleContentPointerUp}
          >
            {selected?.fiche ? (
              <FicheViewer
                title={selected.fiche.title}
                summary={selected.summary}
                blocks={selected.fiche.blocks}
                onCitationClick={handleCitationClick}
              />
            ) : (
              <p className="text-sm text-foreground-subtle">Sélectionnez une entrée.</p>
            )}
          </div>

          <div className="hidden min-h-0 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface md:block">
            {pdfUrl ? (
              <PdfViewer url={pdfUrl} highlight={highlight} coverage={coverage} onSelection={setPendingSelection} />
            ) : (
              <p className="p-4 text-sm text-foreground-subtle">Chargement du PDF…</p>
            )}
          </div>
        </div>
      </div>

      {pdfModalOpen && (
        <Modal title="Document source" onClose={() => setPdfModalOpen(false)} size="xl">
          <div className="-m-4 h-[75vh]">
            {pdfUrl ? (
              <PdfViewer url={pdfUrl} highlight={highlight} coverage={coverage} onSelection={setPendingSelection} />
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
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
