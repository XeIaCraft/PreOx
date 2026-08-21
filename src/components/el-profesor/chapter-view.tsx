"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Search, Minus, Plus, Printer, Files, Link2, Star, Keyboard, Download, Maximize2, Minimize2, Sun, ListChecks, Share2, SpellCheck } from "lucide-react";
import { QuizMode } from "@/components/el-profesor/quiz-mode";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { FicheViewer } from "@/components/el-profesor/fiche-viewer";
import { LibrarySearch } from "@/components/el-profesor/library-search";
import { PdfViewer, type PdfHighlight, type CoverageEntry, type PdfSelection } from "@/components/el-profesor/pdf-viewer";
import { ProposeFromSelectionDialog } from "@/components/el-profesor/propose-from-selection-dialog";
import { RelatedFiches } from "@/components/el-profesor/related-fiches";
import { ShortcutsDialog } from "@/components/el-profesor/shortcuts-dialog";
import { getChapterPdfUrl } from "@/app/apps/el-profesor/actions/pdf";
import { toggleBookmark } from "@/app/apps/el-profesor/actions/bookmarks";
import { getMyNote, saveMyNote, toggleNoteShare } from "@/app/apps/el-profesor/actions/notes";
import { toggleFicheShare } from "@/app/apps/el-profesor/actions/share";
import { recordReadingPosition } from "@/app/apps/el-profesor/actions/reading-position";
import {
  getLastSubEntity,
  setLastSubEntity,
  setLastChapter,
  getFontScale,
  setFontScale,
  getReadingComfort,
  setReadingComfort,
  getDyslexicFont,
  setDyslexicFont,
  type FontScale,
} from "@/lib/el-profesor/local-prefs";
import type { SubEntityWithFiche } from "@/lib/el-profesor/dal";
import type { Citation } from "@/lib/el-profesor/types";

export function ChapterView({
  chapterId,
  chapterTitle,
  subEntities,
  initialEntityId,
  bookmarkedIds,
}: {
  chapterId: string;
  chapterTitle: string;
  subEntities: SubEntityWithFiche[];
  initialEntityId?: string;
  bookmarkedIds?: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const withFiche = useMemo(() => subEntities.filter((s) => s.fiche), [subEntities]);
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
  const [fontScale, setFontScaleState] = useState<FontScale>(() => getFontScale() ?? "md");
  const [readingComfort, setReadingComfortState] = useState(() => getReadingComfort());
  const [dyslexicFont, setDyslexicFontState] = useState(() => getDyslexicFont());
  const [scrollProgress, setScrollProgress] = useState(0);
  const [bookmarks, setBookmarks] = useState(() => new Set(bookmarkedIds ?? []));
  const [bookmarkPending, setBookmarkPending] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [printTarget, setPrintTarget] = useState<"single" | "chapter">("single");
  const [quizOpen, setQuizOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  function handlePrintChapter() {
    setPrintTarget("chapter");
    // Give React a tick to swap which element carries .print-area before
    // the browser snapshots the page for printing.
    requestAnimationFrame(() => {
      window.print();
      setPrintTarget("single");
    });
  }

  useEffect(() => {
    getChapterPdfUrl(chapterId).then((result) => setPdfUrl(result.url ?? null));
  }, [chapterId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (e.key.toLowerCase() === "f" && window.matchMedia("(min-width: 768px)").matches) {
        e.preventDefault();
        setFocusMode((v) => !v);
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedId((current) => {
          const index = withFiche.findIndex((s) => s.id === current);
          if (index === -1) return current;
          const nextIndex = e.key === "ArrowDown" ? Math.min(withFiche.length - 1, index + 1) : Math.max(0, index - 1);
          return withFiche[nextIndex]?.id ?? current;
        });
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [withFiche]);

  useEffect(() => {
    if (selectedId) setLastSubEntity(chapterId, selectedId);
    recordReadingPosition(chapterId, selectedId ?? null);
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

  const publishedFlashcards = useMemo(
    () => withFiche.flatMap((sub) => sub.fiche!.flashcards.filter((c) => c.status === "published")),
    [withFiche]
  );

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

  const FONT_SCALE_ORDER: FontScale[] = ["sm", "md", "lg"];
  function adjustFontScale(direction: 1 | -1) {
    const nextIndex = Math.min(FONT_SCALE_ORDER.length - 1, Math.max(0, FONT_SCALE_ORDER.indexOf(fontScale) + direction));
    const next = FONT_SCALE_ORDER[nextIndex];
    setFontScaleState(next);
    setFontScale(next);
  }

  function toggleReadingComfort() {
    setReadingComfortState((prev) => {
      const next = !prev;
      setReadingComfort(next);
      return next;
    });
  }

  function toggleDyslexicFont() {
    setDyslexicFontState((prev) => {
      const next = !prev;
      setDyslexicFont(next);
      return next;
    });
  }

  function handleContentScroll() {
    const el = contentRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setScrollProgress(max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 0);
  }

  function handleToggleBookmark() {
    if (!selectedId || bookmarkPending) return;
    const wasBookmarked = bookmarks.has(selectedId);
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (wasBookmarked) next.delete(selectedId);
      else next.add(selectedId);
      return next;
    });
    setBookmarkPending(true);
    toggleBookmark(selectedId)
      .then((result) => {
        if (result.error) {
          toast(result.error, { variant: "error" });
          setBookmarks((prev) => {
            const next = new Set(prev);
            if (wasBookmarked) next.add(selectedId);
            else next.delete(selectedId);
            return next;
          });
        }
      })
      .finally(() => setBookmarkPending(false));
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/apps/el-profesor/chapters/${chapterId}${selectedId ? `?entity=${selectedId}` : ""}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast("Lien copié.", { variant: "success" }))
      .catch(() => toast("Impossible de copier le lien.", { variant: "error" }));
  }

  function handleShare() {
    if (!selected?.fiche) return;
    const fiche = selected.fiche;
    toggleFicheShare(fiche.id, !fiche.shareToken).then((result) => {
      if (result.error) {
        toast(result.error, { variant: "error" });
        return;
      }
      router.refresh();
      if (result.shareToken) {
        navigator.clipboard.writeText(`${window.location.origin}/share/fiche/${result.shareToken}`).catch(() => {});
        toast("Lien de partage copié.", { variant: "success" });
      } else {
        toast("Partage désactivé.", { variant: "success" });
      }
    });
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
      <div className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-3 bg-background py-1 print:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/apps/el-profesor">
            <Button variant="ghost" size="icon" aria-label="Retour">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="truncate font-serif-display text-lg font-medium text-foreground">{chapterTitle}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-0.5 rounded-full border border-border sm:flex">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => adjustFontScale(-1)}
              disabled={fontScale === "sm"}
              aria-label="Réduire le texte des fiches"
              title="Réduire le texte"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="text-[10px] font-medium text-foreground-subtle">Aa</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => adjustFontScale(1)}
              disabled={fontScale === "lg"}
              aria-label="Agrandir le texte des fiches"
              title="Agrandir le texte"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={`hidden sm:inline-flex ${readingComfort ? "text-accent" : ""}`}
            onClick={toggleReadingComfort}
            aria-label={readingComfort ? "Désactiver le mode lecture confort" : "Activer le mode lecture confort (sépia)"}
            title="Mode lecture confort (sépia)"
          >
            <Sun className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`hidden sm:inline-flex ${dyslexicFont ? "text-accent" : ""}`}
            onClick={toggleDyslexicFont}
            aria-label={dyslexicFont ? "Désactiver la police adaptée dyslexie" : "Activer la police adaptée dyslexie"}
            title="Police adaptée dyslexie (Atkinson Hyperlegible)"
          >
            <SpellCheck className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleBookmark}
            disabled={!selectedId}
            aria-label={selectedId && bookmarks.has(selectedId) ? "Retirer des favoris" : "Ajouter aux favoris"}
            title={selectedId && bookmarks.has(selectedId) ? "Retirer des favoris" : "Ajouter aux favoris"}
          >
            <Star className={`h-4 w-4 ${selectedId && bookmarks.has(selectedId) ? "fill-accent text-accent" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setSearchOpen(true)} aria-label="Rechercher dans la bibliothèque">
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleCopyLink} aria-label="Copier le lien de cette fiche" title="Copier le lien">
            <Link2 className="h-4 w-4" />
          </Button>
          {selected?.fiche && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleShare}
              aria-label={selected.fiche.shareToken ? "Fiche partagée publiquement (cliquer pour copier / désactiver)" : "Partager cette fiche"}
              title={selected.fiche.shareToken ? "Partagée publiquement — cliquer pour copier le lien, re-cliquer pour désactiver" : "Partager cette fiche (lien public en lecture seule)"}
              className={selected.fiche.shareToken ? "text-primary-strong" : ""}
            >
              <Share2 className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex"
            onClick={() => window.print()}
            aria-label="Imprimer cette fiche"
            title="Imprimer cette fiche"
          >
            <Printer className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex"
            onClick={handlePrintChapter}
            aria-label="Imprimer tout le chapitre"
            title="Imprimer tout le chapitre"
          >
            <Files className="h-4 w-4" />
          </Button>
          {publishedFlashcards.length >= 4 && (
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:inline-flex"
              onClick={() => setQuizOpen(true)}
              aria-label="Mode quiz"
              title="Mode quiz (questions à choix multiples)"
            >
              <ListChecks className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex"
            onClick={() => setShortcutsOpen(true)}
            aria-label="Raccourcis clavier"
            title="Raccourcis clavier (?)"
          >
            <Keyboard className="h-4 w-4" />
          </Button>
          {pdfUrl && (
            <a
              href={pdfUrl}
              download
              target="_blank"
              rel="noreferrer"
              title="Télécharger le PDF"
              aria-label="Télécharger le PDF"
              className="hidden h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-foreground-muted hover:bg-surface-muted hover:text-foreground sm:inline-flex"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            onClick={() => setFocusMode((v) => !v)}
            aria-label={focusMode ? "Quitter le mode lecture" : "Mode lecture (masquer les panneaux)"}
            title={focusMode ? "Quitter le mode lecture" : "Mode lecture"}
          >
            {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button variant="secondary" size="sm" className="md:hidden" onClick={() => setPdfModalOpen(true)}>
            <FileText className="h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </div>

      <div className={`min-h-0 flex-1 gap-4 lg:grid lg:overflow-hidden ${focusMode ? "lg:grid-cols-1" : "lg:grid-cols-[220px_1fr_1fr]"}`}>
        <div
          className={`-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 print:hidden lg:mx-0 lg:mb-0 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:rounded-[var(--radius-lg)] lg:border lg:border-border lg:bg-surface lg:p-2 lg:px-2 lg:pb-2 ${focusMode ? "hidden" : ""}`}
        >
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
              {bookmarks.has(sub.id) && <Star className="mr-1 inline h-3 w-3 fill-accent text-accent" />}
              {sub.name}
            </button>
          ))}
        </div>

        {/* Content + PDF: side by side from the md (tablet) breakpoint up, so
            tablets get a real reading view instead of inheriting the mobile
            stack or squeezing into the desktop's 3-column layout. */}
        <div className={`min-h-0 gap-4 md:grid lg:contents ${focusMode ? "md:grid-cols-1" : "md:grid-cols-2"}`}>
          <div className={`relative min-h-0 ${focusMode ? "md:mx-auto md:w-full md:max-w-3xl" : ""}`}>
            <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden rounded-t-[var(--radius-lg)] print:hidden">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${scrollProgress}%` }} />
            </div>
            <div
              ref={contentRef}
              onScroll={handleContentScroll}
              className={`h-full min-h-0 rounded-[var(--radius-lg)] border border-border bg-surface p-5 text-foreground print:overflow-visible print:rounded-none print:border-0 print:p-0 md:overflow-y-auto lg:overflow-y-auto ${printTarget === "single" ? "print-area" : ""}`}
              style={
                {
                  ...(readingComfort
                    ? {
                        "--background": "#f4ecd8",
                        "--surface": "#f4ecd8",
                        "--surface-muted": "#ece0c6",
                        "--foreground": "#3b3226",
                        "--foreground-muted": "#5a4d3a",
                        "--foreground-subtle": "#7a6c54",
                        "--border": "#ddceac",
                      }
                    : {}),
                  ...(dyslexicFont ? { fontFamily: "var(--font-dyslexic)" } : {}),
                } as CSSProperties
              }
              onPointerDown={handleContentPointerDown}
              onPointerUp={handleContentPointerUp}
            >
              {selected?.fiche ? (
                <>
                  <FicheViewer
                    title={selected.fiche.title}
                    summary={selected.summary}
                    blocks={selected.fiche.blocks}
                    onCitationClick={handleCitationClick}
                    fontScale={fontScale}
                  />
                  <NoteEditor key={selected.id} subEntityId={selected.id} />
                  <RelatedFiches key={selected.fiche.id} ficheId={selected.fiche.id} />
                </>
              ) : (
                <p className="text-sm text-foreground-subtle">Sélectionnez une entrée.</p>
              )}
            </div>
          </div>

          <div
            className={`min-h-0 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface print:hidden ${focusMode ? "hidden" : "hidden md:block"}`}
          >
            {pdfUrl ? (
              <PdfViewer url={pdfUrl} highlight={highlight} coverage={coverage} onSelection={setPendingSelection} />
            ) : (
              <p className="p-4 text-sm text-foreground-subtle">Chargement du PDF…</p>
            )}
          </div>
        </div>
      </div>

      {printTarget === "chapter" && (
        <div className="print-area hidden print:block">
          <h1 className="mb-6 font-serif-display text-2xl font-medium text-foreground">{chapterTitle}</h1>
          {withFiche.map((sub) => (
            <div key={sub.id} className="mb-8 break-inside-avoid">
              <FicheViewer title={sub.fiche!.title} summary={sub.summary} blocks={sub.fiche!.blocks} fontScale={fontScale} />
            </div>
          ))}
        </div>
      )}

      {pdfModalOpen && (
        <Modal
          title="Document source"
          onClose={() => setPdfModalOpen(false)}
          size="xl"
          footer={
            pdfUrl && (
              <a href={pdfUrl} download target="_blank" rel="noreferrer" className="text-sm text-primary-strong underline">
                Télécharger le PDF
              </a>
            )
          }
        >
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

      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}

      {quizOpen && <QuizMode cards={publishedFlashcards} onClose={() => setQuizOpen(false)} />}

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

/** Keyed by sub-entity id at the call site so switching notions remounts it fresh — no manual reset-on-change effect needed. */
function NoteEditor({ subEntityId }: { subEntityId: string }) {
  const { toast } = useToast();
  const [content, setContent] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyNote(subEntityId).then((note) => {
      if (!cancelled) {
        setContent(note.content);
        setShareToken(note.shareToken);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [subEntityId]);

  function handleChange(value: string) {
    setContent(value);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setSaving(true);
    saveTimeout.current = setTimeout(() => {
      saveMyNote(subEntityId, value).finally(() => setSaving(false));
    }, 800);
  }

  function handleShareNote() {
    toggleNoteShare(subEntityId, !shareToken).then((result) => {
      if (result.error) {
        toast(result.error, { variant: "error" });
        return;
      }
      setShareToken(result.shareToken ?? null);
      if (result.shareToken) {
        navigator.clipboard.writeText(`${window.location.origin}/share/note/${result.shareToken}`).catch(() => {});
        toast("Lien de partage copié.", { variant: "success" });
      } else {
        toast("Partage désactivé.", { variant: "success" });
      }
    });
  }

  if (content === null) return null;

  return (
    <div className="mt-6 border-t border-border pt-4 print:hidden">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
          Mes notes personnelles
          {saving && <span className="text-foreground-subtle">(enregistrement…)</span>}
        </p>
        {content.trim() && (
          <button
            type="button"
            onClick={handleShareNote}
            className={`flex items-center gap-1 text-xs ${shareToken ? "text-primary-strong" : "text-foreground-subtle hover:text-foreground"}`}
            title={shareToken ? "Partagée — cliquer pour copier le lien, re-cliquer pour désactiver" : "Partager cette note (lien public en lecture seule)"}
          >
            <Link2 className="h-3.5 w-3.5" /> {shareToken ? "Partagée" : "Partager"}
          </button>
        )}
      </div>
      <textarea
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        rows={3}
        placeholder="Notes privées, visibles par vous seul…"
        className="w-full resize-y rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      />
    </div>
  );
}
