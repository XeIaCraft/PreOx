"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Search, Minus, Plus, Printer, Files, Link2, Star, Keyboard, Download, Maximize2, Minimize2, Sun, ListChecks, Share2, SpellCheck, Brain, PenSquare, ChevronLeft, ChevronRight, PanelRightOpen, PanelRightClose, LayoutTemplate, LayoutList, BookOpenText, ListTree, SlidersHorizontal, AlignJustify, Check } from "lucide-react";
import { QuizMode } from "@/components/el-profesor/quiz-mode";
import { MindMapDialog } from "@/components/el-profesor/mind-map-dialog";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { FicheViewer } from "@/components/el-profesor/fiche-viewer";
import { LibrarySearch } from "@/components/el-profesor/library-search";
import { PdfViewer, type PdfHighlight, type CoverageEntry, type PdfSelection } from "@/components/el-profesor/pdf-viewer";
import { CoverageInfoPanel, type CoverageInfoTarget } from "@/components/el-profesor/coverage-info-panel";
import { buildCoverageEntries } from "@/lib/el-profesor/coverage-entries";
import { blockToPlainText } from "@/lib/el-profesor/block-text";
import { ProposeFromSelectionDialog } from "@/components/el-profesor/propose-from-selection-dialog";
import { ProposeFlashcardDialog } from "@/components/el-profesor/propose-flashcard-dialog";
import { FicheQA } from "@/components/el-profesor/fiche-qa";
import { StudyToolsButtons } from "@/components/el-profesor/study-tools-buttons";
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
  getTextJustify,
  setTextJustify,
  getFicheLayout,
  setFicheLayout,
  type FontScale,
  type FicheLayout,
} from "@/lib/el-profesor/local-prefs";
import type { SubEntityWithFiche, BlockReviewState, AdjacentChapterEntry } from "@/lib/el-profesor/dal";
import type { Citation, ChapterSourceKind } from "@/lib/el-profesor/types";

/** Read-only fallback for a chapter sourced from Word/PowerPoint (item 5 of the backlog) — no PDF to render, so citations only ever show as plain quoted text and there's no page to jump to. */
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

export const FICHE_LAYOUT_OPTIONS: { id: FicheLayout; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "actuel", label: "Actuelle", description: "La mise en page d'aujourd'hui — blocs avec icône et en-tête.", icon: LayoutList },
  { id: "livre", label: "Livre", description: "Lecture continue façon chapitre, sans encadrés, texte en serif.", icon: BookOpenText },
  {
    id: "sommaire",
    label: "Sommaire d'abord",
    description: "Sommaire des blocs toujours visible en haut, navigation entre fiches ancrée en bas.",
    icon: ListTree,
  },
];

/** Reader-facing choice between the three fiche reading layouts (piste 2026-08-28, after mocking up 4 mobile directions). */
export function FicheLayoutPicker({ value, onChange, onClose }: { value: FicheLayout; onChange: (layout: FicheLayout) => void; onClose: () => void }) {
  return (
    <Modal title="Mise en page de la fiche" onClose={onClose} size="sm">
      <div className="-m-4 flex flex-col gap-2 p-2">
        {FICHE_LAYOUT_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                onChange(opt.id);
                onClose();
              }}
              className={`flex items-start gap-3 rounded-[var(--radius-md)] border p-3 text-left transition-colors ${
                active ? "border-primary bg-primary-tint" : "border-border hover:bg-surface-muted"
              }`}
            >
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] ${
                  active ? "bg-primary text-surface" : "bg-surface-muted text-foreground-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-medium text-foreground">{opt.label}</span>
                <span className="mt-0.5 block text-xs text-foreground-subtle">{opt.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

/** A single on/off row inside FicheOptionsMenu — active state shown via a filled icon color plus a trailing check, not just a background tint (needs to read at a glance in a scrollable list of otherwise-identical rows). */
export function OptionToggleRow({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
    >
      <span className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${active ? "text-primary-strong" : "text-foreground-subtle"}`} /> {label}
      </span>
      {active && <Check className="h-4 w-4 shrink-0 text-primary-strong" />}
    </button>
  );
}

/**
 * Mobile-only full-screen immersive reader for "livre"/"sommaire" (piste
 * 2026-08-28, round 2 — the first pass kept these layouts nested inside
 * the normal chrome-full page: hub header, chapter-view toolbar, sidebar
 * — which read as nothing close to the mockups shown beforehand). Covers
 * the whole viewport (including the hub header above it) and deliberately
 * drops every secondary control — confirmed explicitly ("les fonctions ne
 * sont plus visibles, c'est voulu") in favor of maximizing reading
 * surface. Only kept beyond the mockups: a small top-right icon back to
 * the layout picker, the sole way out of this shell once it's the saved
 * preference. Desktop (lg+) never renders this — it keeps the full grid
 * with layout-flavored FicheViewer body styling only, since the mockups
 * were explicitly a mobile redesign.
 */
function ImmersiveFicheReader({
  chapterTitle,
  layout,
  fiche,
  summary,
  fontScale,
  justify,
  blockReviewStates,
  ficheIndex,
  ficheCount,
  hasPrevChapter,
  hasNextChapter,
  onCitationClick,
  onGoToFiche,
  onOpenFicheList,
  onOpenLayoutPicker,
}: {
  chapterTitle: string;
  layout: "livre" | "sommaire";
  fiche: NonNullable<SubEntityWithFiche["fiche"]>;
  summary?: string;
  fontScale: FontScale;
  justify: boolean;
  blockReviewStates?: Record<string, BlockReviewState>;
  ficheIndex: number;
  ficheCount: number;
  /** Whether a neighboring chapter (with somewhere to land) exists — so the "sommaire" dock's Précédente/Suivante don't disable themselves right at this chapter's own boundary when a swipe there would still go somewhere. */
  hasPrevChapter: boolean;
  hasNextChapter: boolean;
  onCitationClick: (c: Citation) => void;
  onGoToFiche: (direction: 1 | -1) => void;
  onOpenFicheList: () => void;
  onOpenLayoutPicker: () => void;
}) {
  const swipeStartX = useRef<number | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch") return;
    swipeStartX.current = e.clientX;
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const startX = swipeStartX.current;
    swipeStartX.current = null;
    if (e.pointerType !== "touch" || startX === null) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) < 60) return;
    onGoToFiche(dx < 0 ? 1 : -1);
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background print:hidden lg:hidden">
      <div
        className={
          layout === "livre"
            ? "sticky top-0 z-10 shrink-0 bg-[linear-gradient(var(--background)_62%,transparent)] px-5 pb-3 pt-4"
            : "shrink-0 px-5 pb-2 pt-4"
        }
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link href="/apps/el-profesor" className="flex items-center gap-1 text-xs font-semibold text-foreground-subtle" aria-label="Retour à la bibliothèque">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
            <button type="button" onClick={onOpenFicheList} className="flex items-center gap-1 text-xs font-semibold text-foreground-subtle">
              <ChevronLeft className="h-3.5 w-3.5" /> Chapitre
            </button>
          </div>
          <button
            type="button"
            onClick={onOpenLayoutPicker}
            aria-label="Mise en page de la fiche"
            title="Mise en page de la fiche"
            className="rounded-full p-1.5 text-foreground-subtle hover:bg-surface-muted hover:text-foreground"
          >
            <LayoutTemplate className="h-4 w-4" />
          </button>
        </div>
        {layout === "livre" && (
          <p className="mt-3 truncate text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">
            {chapterTitle} · {ficheIndex + 1} / {ficheCount}
          </p>
        )}
        <h1
          className={`text-balance font-serif-display font-medium leading-tight text-foreground ${
            layout === "livre" ? "mt-1.5 text-[20px]" : "mt-1 text-[19px]"
          }`}
        >
          {fiche.title}
        </h1>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6" onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
        <FicheViewer
          title={fiche.title}
          summary={summary}
          blocks={fiche.blocks}
          onCitationClick={onCitationClick}
          fontScale={fontScale}
          justify={justify}
          layout={layout}
          blockReviewStates={blockReviewStates}
          immersive
          superseded={
            fiche.supersededByFicheId ? { reason: fiche.supersededReason ?? "outdated", note: fiche.supersededNote } : undefined
          }
        />
      </div>
      {layout === "sommaire" ? (
        <div className="flex shrink-0 gap-2 border-t border-border bg-surface px-4 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => onGoToFiche(-1)}
            disabled={ficheIndex <= 0 && !hasPrevChapter}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-surface-muted px-3 py-2.5 text-sm font-medium text-foreground-muted disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Précédente
          </button>
          <button
            type="button"
            onClick={onOpenFicheList}
            aria-label="Toutes les fiches de ce chapitre"
            className="shrink-0 rounded-[var(--radius-md)] bg-surface-muted px-3 py-2.5 text-xs font-medium tabular-nums text-foreground-subtle"
          >
            {ficheIndex + 1}/{ficheCount}
          </button>
          <button
            type="button"
            onClick={() => onGoToFiche(1)}
            disabled={ficheIndex >= ficheCount - 1 && !hasNextChapter}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-primary px-3 py-2.5 text-sm font-medium text-surface disabled:opacity-40"
          >
            Suivante <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="h-[3px] shrink-0 bg-surface-muted">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${((ficheIndex + 1) / Math.max(1, ficheCount)) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

export function ChapterView({
  chapterId,
  chapterTitle,
  subEntities,
  initialEntityId,
  bookmarkedIds,
  sourceKind = "pdf",
  sourceText = null,
  blockReviewStates,
  isAdmin = false,
  prevChapter = null,
  nextChapter = null,
}: {
  chapterId: string;
  chapterTitle: string;
  subEntities: SubEntityWithFiche[];
  initialEntityId?: string;
  bookmarkedIds?: string[];
  sourceKind?: ChapterSourceKind;
  sourceText?: string | null;
  blockReviewStates?: Record<string, BlockReviewState>;
  isAdmin?: boolean;
  /** The book's neighboring chapters (piste 2026-08-28) — lets prev/next fiche navigation continue straight into the next/previous chapter once it runs out of fiches in this one, instead of just stopping at the boundary. */
  prevChapter?: AdjacentChapterEntry | null;
  nextChapter?: AdjacentChapterEntry | null;
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
  const [textJustify, setTextJustifyState] = useState(() => getTextJustify());
  const [ficheLayout, setFicheLayoutState] = useState<FicheLayout>(() => getFicheLayout());
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false);
  // Every secondary fiche control (format toggles, admin tools, print,
  // shortcuts…) grouped behind one trigger (piste 2026-08-28, round 2) —
  // the icon row this replaces had grown to 15+ buttons, most of them
  // silently hidden below sm/md and so completely unreachable on mobile.
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [bookmarks, setBookmarks] = useState(() => new Set(bookmarkedIds ?? []));
  const [bookmarkPending, setBookmarkPending] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [printTarget, setPrintTarget] = useState<"single" | "chapter">("single");
  const [quizOpen, setQuizOpen] = useState(false);
  const [mindMapOpen, setMindMapOpen] = useState(false);
  // Mobile/tablet "browse all fiches" sheet (requested 2026-08-28 — the
  // cramped horizontal-scroll pill row below lg made the chapter's other
  // fiches all but invisible). Desktop keeps its always-visible sidebar list.
  const [ficheListOpen, setFicheListOpen] = useState(false);
  // PDF side panel starts collapsed (requested 2026-08-28) — the fiche is
  // the primary reading surface; the source PDF is a reference the reader
  // pulls up on demand, not something that should permanently claim half
  // the tablet/desktop width. Mobile is unaffected (it already opens the
  // PDF in its own modal, see pdfModalOpen).
  const [pdfPanelOpen, setPdfPanelOpen] = useState(false);
  const [contributingFlashcard, setContributingFlashcard] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  // Item 37 of the backlog: this page (already visited) is served from the
  // service worker's offline cache when the network is down — this banner
  // just tells the reader why interactive/AI features won't respond, not
  // that the page itself failed to load.
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
    }
    function handleOffline() {
      setIsOffline(true);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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
    if (sourceKind !== "pdf") return;
    getChapterPdfUrl(chapterId).then((result) => setPdfUrl(result.url ?? null));
  }, [chapterId, sourceKind]);

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

  const coverage = useMemo<CoverageEntry[]>(() => buildCoverageEntries(withFiche), [withFiche]);

  // Item 26 follow-up (requested 2026-08-24): clicking a coverage rectangle
  // on the PDF shows which fiche block/flashcard it came from. Blocks can
  // be scrolled to directly (they're rendered inline in the left pane, see
  // `id="fiche-block-${id}"` in fiche-viewer.tsx) — switching sub-entity
  // first if the block belongs to one not currently selected. Flashcards
  // aren't listed inline in this read-only view (they're studied via
  // /review), so their front/back are shown directly in the panel instead.
  const [coverageInfo, setCoverageInfo] = useState<CoverageInfoTarget | null>(null);
  const coverageNavTarget = useRef<{ subEntityId: string; blockId: string } | null>(null);
  const pendingScrollBlockId = useRef<string | null>(null);

  useEffect(() => {
    if (!pendingScrollBlockId.current) return;
    const id = pendingScrollBlockId.current;
    pendingScrollBlockId.current = null;
    requestAnimationFrame(() => {
      document.getElementById(`fiche-block-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [selectedId]);

  function handleCoverageClick(entry: CoverageEntry) {
    const sub = withFiche.find((s) =>
      entry.kind === "block" ? s.fiche!.blocks.some((b) => b.id === entry.id) : s.fiche!.flashcards.some((c) => c.id === entry.id)
    );
    if (!sub) return;
    if (entry.kind === "block") {
      const block = sub.fiche!.blocks.find((b) => b.id === entry.id)!;
      setCoverageInfo({ kind: "block", subEntityName: sub.name, blockType: block.blockType, excerpt: blockToPlainText(block.blockType, block.content).slice(0, 400) });
      coverageNavTarget.current = { subEntityId: sub.id, blockId: block.id };
    } else {
      const card = sub.fiche!.flashcards.find((c) => c.id === entry.id)!;
      setCoverageInfo({ kind: "flashcard", subEntityName: sub.name, front: card.front.text, back: card.back.text });
      coverageNavTarget.current = null;
    }
  }

  function handleCoverageNavigate() {
    const nav = coverageNavTarget.current;
    if (!nav) return;
    setCoverageInfo(null);
    if (nav.subEntityId !== selectedId) {
      pendingScrollBlockId.current = nav.blockId;
      setSelectedId(nav.subEntityId);
    } else {
      document.getElementById(`fiche-block-${nav.blockId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const publishedFlashcards = useMemo(
    () => withFiche.flatMap((sub) => sub.fiche!.flashcards.filter((c) => c.status === "published")),
    [withFiche]
  );

  const swipeStartX = useRef<number | null>(null);
  const currentFicheIndex = withFiche.findIndex((s) => s.id === selectedId);

  // Shared prev/next-with-bounds — used by the swipe gesture below, the
  // mobile page-turn buttons, and (previously duplicated) nowhere else.
  function goToFiche(direction: 1 | -1) {
    if (currentFicheIndex === -1) return;
    const nextIndex = currentFicheIndex + direction;
    if (nextIndex >= 0 && nextIndex < withFiche.length) {
      setSelectedId(withFiche[nextIndex].id);
      return;
    }
    // At the last/first fiche of this chapter — continue straight into the
    // neighboring chapter instead of just stopping dead at the boundary.
    const adjacent = direction === 1 ? nextChapter : prevChapter;
    if (adjacent?.entrySubEntityId) {
      router.push(`/apps/el-profesor/chapters/${adjacent.chapterId}?entity=${adjacent.entrySubEntityId}`);
    }
  }

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
    goToFiche(dx < 0 ? 1 : -1);
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

  function toggleTextJustify() {
    setTextJustifyState((prev) => {
      const next = !prev;
      setTextJustify(next);
      return next;
    });
  }

  function chooseFicheLayout(layout: FicheLayout) {
    setFicheLayoutState(layout);
    setFicheLayout(layout);
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
    } else {
      // The side panel now starts collapsed (more room for the fiche) — a
      // citation click still needs to actually reveal the highlighted page.
      setPdfPanelOpen(true);
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col px-4 py-4 sm:px-6 md:h-[calc(100vh-4rem)]">
      {!focusMode && ficheLayout !== "actuel" && selected?.fiche && (
        <ImmersiveFicheReader
          chapterTitle={chapterTitle}
          layout={ficheLayout}
          fiche={selected.fiche}
          summary={selected.summary}
          fontScale={fontScale}
          justify={textJustify}
          blockReviewStates={blockReviewStates}
          ficheIndex={currentFicheIndex}
          ficheCount={withFiche.length}
          hasPrevChapter={Boolean(prevChapter?.entrySubEntityId)}
          hasNextChapter={Boolean(nextChapter?.entrySubEntityId)}
          onCitationClick={handleCitationClick}
          onGoToFiche={goToFiche}
          onOpenFicheList={() => setFicheListOpen(true)}
          onOpenLayoutPicker={() => setLayoutPickerOpen(true)}
        />
      )}
      {isOffline && (
        <div className="mb-2 rounded-[var(--radius-sm)] border border-accent/40 bg-accent-tint px-3 py-1.5 text-center text-xs text-accent print:hidden">
          Hors ligne — vous consultez une version déjà enregistrée de ce chapitre. Les fonctionnalités nécessitant une connexion (IA, révision, PDF) peuvent ne pas répondre.
        </div>
      )}
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
          <Button variant="ghost" size="icon" onClick={() => setOptionsMenuOpen(true)} aria-label="Options de la fiche" title="Options de la fiche">
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
          <Button
            variant={pdfPanelOpen ? "secondary" : "ghost"}
            size="icon"
            className="hidden md:inline-flex"
            onClick={() => setPdfPanelOpen((v) => !v)}
            aria-label={pdfPanelOpen ? "Masquer le PDF source" : "Afficher le PDF source"}
            title={pdfPanelOpen ? "Masquer le PDF source" : "Afficher le PDF source"}
          >
            {pdfPanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </Button>
          <Button variant="secondary" size="sm" className="md:hidden" onClick={() => setPdfModalOpen(true)}>
            <FileText className="h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </div>

      {/* Every other fiche control, grouped behind the SlidersHorizontal
          trigger above (piste 2026-08-28, round 2) — this used to be a
          15+ icon row where most icons were `hidden sm:/md:inline-flex`
          and so entirely unreachable on mobile. Now reachable at every
          breakpoint, same as the dashboard's own HeaderMenu. */}
      {optionsMenuOpen && (
        <Modal title="Options de la fiche" onClose={() => setOptionsMenuOpen(false)} size="sm">
          <div className="-m-4 flex flex-col gap-0.5 p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setOptionsMenuOpen(false);
                setLayoutPickerOpen(true);
              }}
            >
              <LayoutTemplate className="h-3.5 w-3.5" /> Mise en page de la fiche
            </Button>

            <div className="flex items-center justify-between px-3 py-2 text-sm text-foreground">
              <span>Taille du texte</span>
              <div className="flex items-center gap-0.5 rounded-full border border-border">
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
            </div>

            <OptionToggleRow icon={AlignJustify} label="Texte justifié" active={textJustify} onClick={toggleTextJustify} />
            <OptionToggleRow icon={Sun} label="Lecture confort (sépia)" active={readingComfort} onClick={toggleReadingComfort} />
            <OptionToggleRow icon={SpellCheck} label="Police adaptée dyslexie" active={dyslexicFont} onClick={toggleDyslexicFont} />
            <OptionToggleRow
              icon={focusMode ? Minimize2 : Maximize2}
              label="Mode lecture (masquer les panneaux)"
              active={focusMode}
              onClick={() => setFocusMode((v) => !v)}
            />

            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setOptionsMenuOpen(false);
                setShortcutsOpen(true);
              }}
            >
              <Keyboard className="h-3.5 w-3.5" /> Raccourcis clavier
            </Button>
            {pdfUrl && (
              <a
                href={pdfUrl}
                download
                target="_blank"
                rel="noreferrer"
                onClick={() => setOptionsMenuOpen(false)}
                className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
              >
                <Download className="h-3.5 w-3.5 text-foreground-subtle" /> Télécharger le PDF
              </a>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setOptionsMenuOpen(false);
                window.print();
              }}
            >
              <Printer className="h-3.5 w-3.5" /> Imprimer cette fiche
            </Button>

            {isAdmin && <div className="my-1 border-t border-border" />}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setOptionsMenuOpen(false);
                  handleCopyLink();
                }}
              >
                <Link2 className="h-3.5 w-3.5" /> Copier le lien de cette fiche
              </Button>
            )}
            {isAdmin && selected?.fiche && (
              <Button
                variant="ghost"
                size="sm"
                className={`w-full justify-start ${selected.fiche.shareToken ? "text-primary-strong" : ""}`}
                onClick={() => {
                  setOptionsMenuOpen(false);
                  handleShare();
                }}
              >
                <Share2 className="h-3.5 w-3.5" />
                {selected.fiche.shareToken ? "Partagée — copier / désactiver le lien" : "Partager cette fiche"}
              </Button>
            )}
            {isAdmin && selected?.fiche && (
              <StudyToolsButtons
                ficheTitle={selected.fiche.title}
                subEntityName={selected.name}
                blocks={selected.fiche.blocks}
                onOpen={() => setOptionsMenuOpen(false)}
              />
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setOptionsMenuOpen(false);
                  handlePrintChapter();
                }}
              >
                <Files className="h-3.5 w-3.5" /> Imprimer tout le chapitre
              </Button>
            )}
            {isAdmin && publishedFlashcards.length >= 4 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setOptionsMenuOpen(false);
                  setQuizOpen(true);
                }}
              >
                <ListChecks className="h-3.5 w-3.5" /> Mode quiz
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setOptionsMenuOpen(false);
                  setMindMapOpen(true);
                }}
              >
                <Brain className="h-3.5 w-3.5" /> Carte mentale du chapitre
              </Button>
            )}
          </div>
        </Modal>
      )}

      {/* Below lg: a compact "page turn" bar (prev/next + a tap target that
          opens the full list as a sheet) instead of the desktop sidebar —
          requested 2026-08-28, the old horizontal-scroll pill row made a
          chapter's other fiches all but invisible/undiscoverable on
          mobile. lg+ keeps the always-visible sidebar list below. "livre"
          and "sommaire" replace this bar (and the rest of this page's
          chrome) with the full-screen ImmersiveFicheReader instead. */}
      {!focusMode && ficheLayout === "actuel" && withFiche.length > 0 && (
        <div className="mb-3 flex items-center gap-1.5 print:hidden lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goToFiche(-1)}
            disabled={currentFicheIndex <= 0 && !prevChapter?.entrySubEntityId}
            aria-label="Fiche précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={() => setFicheListOpen(true)}
            className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-sm"
          >
            {selected && bookmarks.has(selected.id) && <Star className="h-3 w-3 shrink-0 fill-accent text-accent" />}
            <span className="truncate font-medium text-foreground">{selected?.name ?? "Sélectionner une entrée"}</span>
            <span className="shrink-0 text-xs tabular-nums text-foreground-subtle">
              {currentFicheIndex + 1}/{withFiche.length}
            </span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goToFiche(1)}
            disabled={currentFicheIndex === -1 || (currentFicheIndex >= withFiche.length - 1 && !nextChapter?.entrySubEntityId)}
            aria-label="Fiche suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {ficheListOpen && (
        <Modal title={`Fiches de ce chapitre (${withFiche.length})`} onClose={() => setFicheListOpen(false)} size="md">
          <div className="-m-4 max-h-[70vh] overflow-y-auto">
            {withFiche.map((sub, i) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => {
                  setSelectedId(sub.id);
                  setFicheListOpen(false);
                }}
                className={`flex w-full items-center gap-2 border-b border-border px-4 py-3 text-left text-sm last:border-b-0 ${
                  sub.id === selectedId ? "bg-primary-tint text-primary-strong" : "text-foreground-muted hover:bg-surface-muted"
                }`}
              >
                <span className="shrink-0 text-xs tabular-nums text-foreground-subtle">{i + 1}</span>
                {bookmarks.has(sub.id) && <Star className="h-3 w-3 shrink-0 fill-accent text-accent" />}
                <span className="truncate">{sub.name}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      <div
        className={`min-h-0 flex-1 gap-4 lg:grid lg:overflow-hidden ${
          focusMode ? "lg:grid-cols-1" : pdfPanelOpen ? "lg:grid-cols-[220px_1fr_1fr]" : "lg:grid-cols-[220px_1fr]"
        }`}
      >
        <div
          className={`hidden print:hidden lg:flex lg:flex-col lg:gap-1 lg:overflow-y-auto lg:rounded-[var(--radius-lg)] lg:border lg:border-border lg:bg-surface lg:p-2 ${focusMode ? "lg:hidden" : ""}`}
        >
          {withFiche.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => setSelectedId(sub.id)}
              className={`block w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm transition-colors ${
                sub.id === selectedId ? "bg-primary-tint text-primary-strong" : "text-foreground-muted hover:bg-surface-muted"
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
        <div className={`min-h-0 gap-4 md:grid lg:contents ${focusMode || !pdfPanelOpen ? "md:grid-cols-1" : "md:grid-cols-2"}`}>
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
                    justify={textJustify}
                    layout={ficheLayout}
                    blockReviewStates={blockReviewStates}
                    superseded={
                      selected.fiche.supersededByFicheId
                        ? { reason: selected.fiche.supersededReason ?? "outdated", note: selected.fiche.supersededNote }
                        : undefined
                    }
                  />
                  <NoteEditor key={selected.id} subEntityId={selected.id} />
                  <FicheQA key={selected.fiche.id} ficheId={selected.fiche.id} isAdmin={isAdmin} />
                  <button
                    type="button"
                    onClick={() => setContributingFlashcard(true)}
                    className="mt-4 flex items-center gap-1.5 text-xs text-foreground-subtle hover:text-primary-strong print:hidden"
                  >
                    <PenSquare className="h-3.5 w-3.5" /> Proposer une flashcard sur cette notion
                  </button>
                </>
              ) : (
                <p className="text-sm text-foreground-subtle">Sélectionnez une entrée.</p>
              )}
            </div>
          </div>

          <div
            className={`relative min-h-0 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface print:hidden ${
              !focusMode && pdfPanelOpen ? "hidden md:block" : "hidden"
            }`}
          >
            {sourceKind !== "pdf" ? (
              <SourceTextPanel text={sourceText} />
            ) : pdfUrl ? (
              <PdfViewer url={pdfUrl} highlight={highlight} coverage={coverage} onSelection={setPendingSelection} onCoverageClick={handleCoverageClick} />
            ) : (
              <p className="p-4 text-sm text-foreground-subtle">Chargement du PDF…</p>
            )}
            {coverageInfo && (
              <CoverageInfoPanel
                target={coverageInfo}
                onClose={() => setCoverageInfo(null)}
                onNavigate={coverageInfo.kind === "block" ? handleCoverageNavigate : undefined}
              />
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
          <div className="relative -m-4 h-[75vh]">
            {sourceKind !== "pdf" ? (
              <SourceTextPanel text={sourceText} />
            ) : pdfUrl ? (
              <PdfViewer url={pdfUrl} highlight={highlight} coverage={coverage} onSelection={setPendingSelection} onCoverageClick={handleCoverageClick} />
            ) : (
              <p className="p-4 text-sm text-foreground-subtle">Chargement du PDF…</p>
            )}
            {coverageInfo && (
              <CoverageInfoPanel
                target={coverageInfo}
                onClose={() => setCoverageInfo(null)}
                onNavigate={
                  coverageInfo.kind === "block"
                    ? () => {
                        handleCoverageNavigate();
                        setPdfModalOpen(false);
                      }
                    : undefined
                }
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

      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}

      {layoutPickerOpen && (
        <FicheLayoutPicker value={ficheLayout} onChange={chooseFicheLayout} onClose={() => setLayoutPickerOpen(false)} />
      )}

      {quizOpen && <QuizMode cards={publishedFlashcards} onClose={() => setQuizOpen(false)} />}
      {mindMapOpen && <MindMapDialog chapterId={chapterId} onClose={() => setMindMapOpen(false)} />}

      {contributingFlashcard && selected && (
        <ProposeFlashcardDialog
          subEntityId={selected.id}
          subEntityName={selected.name}
          onClose={() => setContributingFlashcard(false)}
          onSubmitted={() => {
            setContributingFlashcard(false);
            router.refresh();
          }}
        />
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
