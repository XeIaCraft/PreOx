"use client";

import { Suspense, use, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  GraduationCap,
  Plus,
  Trash2,
  Pencil,
  Sparkles,
  BookOpen,
  ClipboardCheck,
  SearchCheck,
  ArrowRight,
  Settings,
  HelpCircle,
  Download,
  ShieldAlert,
  ChevronUp,
  ChevronDown,
  Search,
  Trophy,
  Zap,
  Tag,
  Gauge,
  BellOff,
  Archive,
  ListTree,
  GitBranch,
  Scissors,
  BookText,
  Timer,
  Siren,
  NotebookPen,
  RotateCcw,
  ChevronRight,
  History,
  MoreVertical,
} from "lucide-react";
import { OnboardingTour } from "@/components/onboarding-tour";
import { hasSeenOnboarding } from "@/lib/onboarding";
import { EL_PROFESOR_ONBOARDING_STEPS } from "@/components/el-profesor/onboarding-steps";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { LibrarySearch } from "@/components/el-profesor/library-search";
import { NotesSearchDialog } from "@/components/el-profesor/notes-search-dialog";
import { DashboardNotionView, DashboardNotionViewSkeleton } from "@/components/el-profesor/dashboard-notion-view";
import { AddBookDialog } from "@/components/el-profesor/dialogs/add-book-dialog";
import { UploadChapterDialog } from "@/components/el-profesor/dialogs/upload-chapter-dialog";
import { SplitBookDialog } from "@/components/el-profesor/dialogs/split-book-dialog";
import { ConfirmDeleteDialog } from "@/components/el-profesor/dialogs/confirm-delete-dialog";
import { GeminiSettingsDialog } from "@/components/el-profesor/dialogs/gemini-settings-dialog";
import { LibraryStats } from "@/components/el-profesor/learning-widgets";
import { DashboardSecondaryWidgets, DashboardWidgetsSkeleton } from "@/components/el-profesor/dashboard-secondary-widgets";
import { deleteBook, deleteChapter, moveBook } from "@/app/apps/el-profesor/actions/library";
import { extractChapter, extractChapterComplementary, resetStuckExtraction } from "@/app/apps/el-profesor/actions/extraction";
import { submitExtractionBatch, submitComplementaryBatch } from "@/app/apps/el-profesor/actions/batches";
import { ImportContentDialog } from "@/components/el-profesor/dialogs/import-content-dialog";
import { ExtractionHistoryDialog } from "@/components/el-profesor/dialogs/extraction-history-dialog";
import { exportBookArchive, archiveBook } from "@/app/apps/el-profesor/actions/archive";
import { getChapterFlashcardsForExport } from "@/app/apps/el-profesor/actions/export";
import { exportBookNotes } from "@/app/apps/el-profesor/actions/notes";
import {
  getLastChapter,
  getDashboardViewMode,
  setDashboardViewMode,
  getCollapsedBooks,
  setCollapsedBooks,
  type DashboardViewMode,
} from "@/lib/el-profesor/local-prefs";
import { formatUsd } from "@/lib/el-profesor/ai-pricing";
import type { BookWithChapters, ChapterDueCounts, ChapterMasteryCounts, ChapterMasteryPercentile, ElProfesorAiProvider } from "@/lib/el-profesor/dal";
import type { ChapterStatus } from "@/lib/el-profesor/types";
import type { DashboardSecondaryData, DashboardAiConfigData, DashboardNotionViewData } from "@/lib/el-profesor/dashboard-types";

function MasteryBar({ counts }: { counts: { total: number; new: number; learning: number; acquired: number } }) {
  if (counts.total === 0) return null;
  const pct = (n: number) => `${(n / counts.total) * 100}%`;
  return (
    <div className="mt-2">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div className="bg-success" style={{ width: pct(counts.acquired) }} />
        <div className="bg-accent" style={{ width: pct(counts.learning) }} />
      </div>
      <p className="mt-1 text-[11px] text-foreground-subtle">
        {counts.acquired} acquise{counts.acquired > 1 ? "s" : ""} · {counts.learning} en cours · {counts.new} nouvelle{counts.new > 1 ? "s" : ""}
      </p>
    </div>
  );
}

/** Per-book comparison of how far along each of its chapters is — a quick "where should I focus" glance across a book's chapters. */
function ChapterProgressComparison({
  chapters,
  masteryCounts,
}: {
  chapters: BookWithChapters["chapters"];
  masteryCounts: ChapterMasteryCounts;
}) {
  const rows = chapters
    .map((c) => {
      const m = masteryCounts[c.id];
      const pct = m && m.total > 0 ? Math.round((m.acquired / m.total) * 100) : 0;
      return { chapter: c, pct };
    })
    .filter((r) => masteryCounts[r.chapter.id]?.total);
  if (rows.length < 2) return null;

  return (
    <div className="mt-3 rounded-[var(--radius-md)] border border-border bg-surface-muted/40 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">Progression par chapitre</p>
      <div className="mt-2 space-y-1.5">
        {rows.map(({ chapter, pct }) => (
          <div key={chapter.id} className="flex items-center gap-2">
            <span className="w-32 shrink-0 truncate text-xs text-foreground-muted" title={chapter.title}>
              {chapter.title}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-9 shrink-0 text-right text-[11px] text-foreground-subtle">{pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;
}

function ElapsedTime({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return <span className="tabular-nums">{formatElapsed(now - startedAt)}</span>;
}

/**
 * Groups a chapter card's less-frequently-used admin actions behind a
 * "Plus" menu (requested 2026-08-26 — the per-book chapter list was "très
 * dense" with every action always visible) — closes on Escape or on
 * clicking outside/inside (a backdrop plus a click handler on the panel
 * itself, since every menu item is a normal onClick button and closing on
 * bubble is simpler than wiring each one individually).
 */
function MoreActionsMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)} aria-label="Plus d'actions" aria-expanded={open}>
        <MoreVertical className="h-4 w-4" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            onClick={() => setOpen(false)}
            className="absolute right-0 z-20 mt-1 flex w-52 flex-col gap-0.5 rounded-[var(--radius-md)] border border-border bg-surface p-1.5 shadow-lg"
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}

// Mirrors STUCK_EXTRACTION_MINUTES in actions/extraction.ts — only offer
// the reset button once the server would actually accept it, so it never
// flashes up for a chapter that's still genuinely extracting.
const STUCK_EXTRACTION_MS = 3 * 60 * 1000;

// Purely cosmetic gate for "queued" chapters (Claude batch) — the server
// action itself decides via the batch item's own resolved status, not
// elapsed time (a batch can legitimately take hours), but showing the
// button the instant a batch is submitted would read as broken when it's
// just still processing normally.
const STUCK_QUEUED_MS = 15 * 60 * 1000;

function isStuckExtraction(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() > STUCK_EXTRACTION_MS;
}

function isStuckQueued(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() > STUCK_QUEUED_MS;
}

const STATUS_LABEL: Record<ChapterStatus, string> = {
  pending: "PDF importé",
  queued: "En file (lot Claude)",
  extracting: "Extraction en cours…",
  draft_ready: "Brouillon à relire",
  published: "Publié",
  failed: "Échec de l'extraction",
};

const STATUS_VARIANT: Record<ChapterStatus, "neutral" | "accent" | "success" | "danger"> = {
  pending: "neutral",
  queued: "accent",
  extracting: "accent",
  draft_ready: "accent",
  published: "success",
  failed: "danger",
};

type ModalState =
  | { type: "add_book" }
  | { type: "edit_book"; book: { id: string; title: string; author: string | null; edition: string | null; theme: string | null } }
  | { type: "upload_chapter"; bookId: string; nextOrder: number }
  | { type: "split_book"; bookId: string; nextOrder: number }
  | { type: "delete_book"; bookId: string; title: string; chapterCount: number }
  | { type: "delete_chapter"; chapterId: string; title: string; flashcardCount: number }
  | { type: "gemini_settings" }
  | { type: "search_book"; bookId: string; bookTitle: string }
  | { type: "search_notes" }
  | { type: "import_content"; chapterId: string; chapterTitle: string }
  | { type: "archive_book"; bookId: string; title: string }
  | { type: "new_edition"; book: { id: string; title: string; author: string | null; edition: string | null; theme: string | null } }
  | { type: "exam_start"; chapterId: string; chapterTitle: string }
  | { type: "extraction_history"; chapterId: string; chapterTitle: string }
  | null;

const EXAM_DURATION_PRESETS = [
  { label: "10 min", seconds: 10 * 60 },
  { label: "20 min", seconds: 20 * 60 },
  { label: "30 min", seconds: 30 * 60 },
  { label: "45 min", seconds: 45 * 60 },
];

/**
 * Piste 2026-08-24 ("chargement progressif du tableau de bord") — the
 * average-cost-per-Claude-call estimate only exists once chapters are
 * selected for a bulk batch, so its data (usage stats, spend log) is
 * streamed separately from the rest of the dashboard rather than blocking
 * initial paint. See the comment on estimatedBulkCostUsd this replaced.
 */
function BulkCostEstimate({
  aiConfigPromise,
  selectedChapters,
}: {
  aiConfigPromise: Promise<DashboardAiConfigData | null>;
  selectedChapters: { id: string; pdfPageCount: number | null }[];
}) {
  const config = use(aiConfigPromise);
  const claudeModelKey = `claude:${config?.claudeModel || "claude-sonnet-5"}`;
  const claudeUsage = config?.geminiUsageStats?.byModel.find((m) => m.model === claudeModelKey);
  const costPerPageUsd = claudeUsage?.costPerPageUsd ?? null;
  const avgCostPerCallUsd = claudeUsage && claudeUsage.calls > 0 && !claudeUsage.hasUnpricedCalls ? claudeUsage.estimatedCostUsd / claudeUsage.calls : null;

  // Per-chapter when its page count is known (scales with actual size);
  // falls back to the flat per-call average for a chapter that has none
  // (older upload, page count not yet tracked at the time it was added).
  let estimatedBulkCostUsd: number | null = null;
  let anyPerPage = false;
  if (costPerPageUsd !== null || avgCostPerCallUsd !== null) {
    let total = 0;
    for (const c of selectedChapters) {
      if (c.pdfPageCount != null && costPerPageUsd !== null) {
        total += c.pdfPageCount * costPerPageUsd;
        anyPerPage = true;
      } else if (avgCostPerCallUsd !== null) {
        total += avgCostPerCallUsd;
      } else {
        // No page count for this chapter and no per-call average either — skip it, the total would understate rather than estimate falsely.
        continue;
      }
    }
    estimatedBulkCostUsd = total;
  }

  return estimatedBulkCostUsd !== null ? (
    <span
      className="text-xs text-foreground-subtle"
      title={
        anyPerPage
          ? "Estimation basée sur le coût moyen par page des appels Claude déjà journalisés sur 7 jours, appliqué au nombre de pages de chaque chapitre sélectionné (moyenne par appel en repli pour un chapitre sans nombre de pages connu) — une passe ; un complément « jusqu'à couverture » peut en enchaîner plusieurs si le contenu est dense."
          : "Estimation basée sur le coût moyen des appels Claude déjà journalisés sur 7 jours (extraction + complément + autres usages confondus) — une passe par chapitre ; un complément « jusqu'à couverture » peut en enchaîner plusieurs si le contenu est dense."
      }
    >
      ≈ {formatUsd(estimatedBulkCostUsd)} estimé
    </span>
  ) : (
    <span className="text-xs text-foreground-subtle" title="Pas encore assez d'appels Claude journalisés pour estimer un coût moyen.">
      coût estimé indisponible
    </span>
  );
}

function GeminiSettingsLoadingModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Réglages IA" onClose={onClose} size="md">
      <p className="text-sm text-foreground-subtle">Chargement…</p>
    </Modal>
  );
}

/** Only fetched/awaited when the settings dialog actually opens — see aiConfigPromise on ElProfesorBoard. */
function GeminiSettingsLoader({
  aiConfigPromise,
  hasApiKey,
  aiProvider,
  onClose,
}: {
  aiConfigPromise: Promise<DashboardAiConfigData | null>;
  hasApiKey: boolean;
  aiProvider: ElProfesorAiProvider;
  onClose: () => void;
}) {
  const config = use(aiConfigPromise);
  if (!config) return null;
  return (
    <GeminiSettingsDialog
      currentModel={config.geminiModel ?? "gemini-flash-latest"}
      hasApiKey={hasApiKey}
      extraKeyCount={config.geminiExtraKeyCount}
      fallbackModel={config.geminiFallbackModel}
      usageStats={config.geminiUsageStats}
      aiSpendCapUsd={config.aiSpendCapUsd}
      currentMonthAiSpendUsd={config.currentMonthAiSpendUsd}
      aiProvider={aiProvider}
      hasClaudeKey={config.hasClaudeKey}
      claudeModel={config.claudeModel || "claude-sonnet-5"}
      batchJobs={config.batchJobs}
      onClose={onClose}
    />
  );
}

export function ElProfesorBoard({
  books,
  dueCounts,
  needsReviewCounts,
  masteryCounts,
  isAdmin,
  difficultCounts,
  globalMastery,
  hasGeminiKey,
  aiProvider,
  serverResumeChapterId,
  secondaryDataPromise,
  aiConfigPromise,
  notionViewDataPromise,
}: {
  books: BookWithChapters[];
  dueCounts: ChapterDueCounts;
  needsReviewCounts: ChapterDueCounts;
  masteryCounts: ChapterMasteryCounts;
  isAdmin: boolean;
  difficultCounts: ChapterDueCounts;
  globalMastery: Record<string, ChapterMasteryPercentile>;
  hasGeminiKey: boolean;
  aiProvider: ElProfesorAiProvider;
  /** Cross-device resume position (server-stored) — preferred over the local-only cache when present. */
  serverResumeChapterId: string | null;
  /**
   * Piste 2026-08-24 ("chargement progressif du tableau de bord") — started
   * server-side without being awaited, unwrapped with React's use() inside
   * DashboardSecondaryWidgets/GeminiSettingsLoader/BulkCostEstimate below,
   * each behind its own <Suspense> boundary, so the book list above never
   * waits on these heavier queries.
   */
  secondaryDataPromise: Promise<DashboardSecondaryData>;
  aiConfigPromise: Promise<DashboardAiConfigData | null>;
  /** Same streamed-promise pattern, consumed by DashboardNotionView only once the "Par notion" toggle is selected. */
  notionViewDataPromise: Promise<DashboardNotionViewData>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [modal, setModal] = useState<ModalState>(null);
  const [themeFilter, setThemeFilter] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingStartedAt, setPendingStartedAt] = useState<number | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  // Multi-chapter selection for bulk Claude batches (extraction/complément) — only
  // meaningful when Claude is the active provider, since batching a single Gemini
  // call by hand doesn't apply (Gemini stays synchronous, one chapter at a time).
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [isBulkPending, startBulkTransition] = useTransition();
  // Lazy initializer (client-only read), same pattern used elsewhere for
  // one-time localStorage reads — null on the server, resolved on mount.
  const [resumeChapterId] = useState(() => serverResumeChapterId ?? getLastChapter());
  const [tourOpen, setTourOpen] = useState(() => !hasSeenOnboarding("el-profesor"));
  const [viewMode, setViewModeState] = useState<DashboardViewMode>(() => getDashboardViewMode());
  function setViewMode(mode: DashboardViewMode) {
    setViewModeState(mode);
    setDashboardViewMode(mode);
  }

  // Per-book collapse on the "Par livre" view — long chapter lists across
  // several books made for a lot of scrolling on mobile (requested 2026-08-25).
  const [collapsedBookIds, setCollapsedBookIds] = useState<Set<string>>(() => getCollapsedBooks());
  function toggleBookCollapsed(bookId: string) {
    setCollapsedBookIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      setCollapsedBooks(next);
      return next;
    });
  }

  let resume: { book: BookWithChapters; chapter: BookWithChapters["chapters"][number] } | null = null;
  if (resumeChapterId) {
    for (const book of books) {
      const chapter = book.chapters.find((c) => c.id === resumeChapterId && c.status === "published");
      if (chapter) {
        resume = { book, chapter };
        break;
      }
    }
  }

  const masteryValues = Object.values(masteryCounts);
  const totalAcquired = masteryValues.reduce((sum, m) => sum + m.acquired, 0);
  const chaptersMastered = masteryValues.filter((m) => m.total > 0 && m.acquired === m.total).length;
  const totalChapters = books.reduce((sum, b) => sum + b.chapters.filter((c) => c.status === "published").length, 0);
  const totalFlashcards = masteryValues.reduce((sum, m) => sum + m.total, 0);
  const themes = [...new Set(books.map((b) => b.theme).filter((t): t is string => Boolean(t)))].sort();
  const visibleBooks = themeFilter ? books.filter((b) => b.theme === themeFilter) : books;

  // Every chapter a Claude batch could apply to, regardless of current status —
  // "Tout sélectionner" below and the cost estimate in the sticky bar both use
  // this same set (see bulkSelectable below, computed identically per-chapter).
  const bulkSelectableChapterIds =
    isAdmin && aiProvider === "claude" ? books.flatMap((b) => b.chapters.filter((c) => c.sourceKind === "pdf").map((c) => c.id)) : [];

  const selectedChapters = books
    .flatMap((b) => b.chapters)
    .filter((c) => selectedChapterIds.has(c.id))
    .map((c) => ({ id: c.id, pdfPageCount: c.pdfPageCount }));

  function refresh() {
    startTransition(() => router.refresh());
  }

  function handleExtract(chapterId: string) {
    setPendingId(chapterId);
    setPendingStartedAt(() => Date.now());
    startTransition(async () => {
      const result = await extractChapter(chapterId);
      setPendingId(null);
      setPendingStartedAt(null);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Extraction terminée.", { variant: "success" });
        refresh();
      }
    });
  }

  function handleResetStuck(chapterId: string) {
    setPendingId(chapterId);
    startTransition(async () => {
      const result = await resetStuckExtraction(chapterId);
      setPendingId(null);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Réinitialisé.", { variant: "success" });
        refresh();
      }
    });
  }

  function handleComplement(chapterId: string, untilComplete?: boolean) {
    setPendingId(chapterId);
    setPendingStartedAt(() => Date.now());
    startTransition(async () => {
      const result = await extractChapterComplementary(chapterId, { untilComplete });
      setPendingId(null);
      setPendingStartedAt(null);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Terminé.", { variant: "success" });
        refresh();
      }
    });
  }

  function toggleChapterSelection(chapterId: string) {
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }

  function handleBulkExtract() {
    const ids = [...selectedChapterIds];
    startBulkTransition(async () => {
      const result = await submitExtractionBatch(ids);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Lot soumis.", { variant: "success" });
        setSelectedChapterIds(new Set());
        refresh();
      }
    });
  }

  function handleBulkComplement() {
    const ids = [...selectedChapterIds];
    startBulkTransition(async () => {
      const result = await submitComplementaryBatch(ids, { untilComplete: true });
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Lot soumis.", { variant: "success" });
        setSelectedChapterIds(new Set());
        refresh();
      }
    });
  }

  function handleMoveBook(bookId: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveBook(bookId, direction);
      if (result.error) toast(result.error, { variant: "error" });
      else refresh();
    });
  }

  function csvField(value: string) {
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }

  function handleExportCsv(chapterId: string, chapterTitle: string) {
    setExportingId(chapterId);
    startTransition(async () => {
      const result = await getChapterFlashcardsForExport(chapterId);
      setExportingId(null);
      if ("error" in result) {
        toast(result.error, { variant: "error" });
        return;
      }
      if (result.length === 0) {
        toast("Aucune flashcard publiée à exporter pour ce chapitre.", { variant: "error" });
        return;
      }
      const rows = [
        ["Recto", "Verso", "Page"],
        ...result.map((c) => [c.front, c.back, c.page ? String(c.page) : ""]),
      ];
      const csv = rows.map((row) => row.map(csvField).join(",")).join("\n");
      const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${chapterTitle.replace(/[^\w\s-]/g, "").trim() || "chapitre"}-flashcards.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  // True Anki .apkg export would require building a SQLite-in-zip package —
  // no library for that is available here, and it'd be disproportionate for
  // this use case. Anki's own "Fichier > Importer" reads a plain tab-separated
  // text file directly (front\tback per line), which gets the same result
  // with none of the binary-format complexity.
  function handleExportAnki(chapterId: string, chapterTitle: string) {
    setExportingId(chapterId);
    startTransition(async () => {
      const result = await getChapterFlashcardsForExport(chapterId);
      setExportingId(null);
      if ("error" in result) {
        toast(result.error, { variant: "error" });
        return;
      }
      if (result.length === 0) {
        toast("Aucune flashcard publiée à exporter pour ce chapitre.", { variant: "error" });
        return;
      }
      const sanitize = (s: string) => s.replace(/[\t\n\r]+/g, " ").trim();
      const lines = result.map((c) => `${sanitize(c.front)}\t${sanitize(c.back)}`);
      const blob = new Blob([`﻿${lines.join("\n")}`], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${chapterTitle.replace(/[^\w\s-]/g, "").trim() || "chapitre"}-anki.txt`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  function handleExportNotes(bookId: string, bookTitle: string) {
    startTransition(async () => {
      const result = await exportBookNotes(bookId);
      if ("error" in result) {
        toast(result.error, { variant: "error" });
        return;
      }
      if (!result.hasNotes) {
        toast("Aucune note personnelle pour ce livre.", { variant: "error" });
        return;
      }
      const blob = new Blob([`﻿${result.content}`], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${bookTitle.replace(/[^\w\s-]/g, "").trim() || "livre"}-mes-notes.md`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  function handleArchiveBook(bookId: string, bookTitle: string) {
    startTransition(async () => {
      const exported = await exportBookArchive(bookId);
      if ("error" in exported) {
        toast(exported.error, { variant: "error" });
        return;
      }
      const blob = new Blob([exported.content], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${bookTitle.replace(/[^\w\s-]/g, "").trim() || "livre"}-archive.json`;
      link.click();
      URL.revokeObjectURL(url);

      const result = await archiveBook(bookId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Livre archivé.", { variant: "success" });
        setModal(null);
        refresh();
      }
    });
  }

  function confirmDeleteChapter(chapterId: string) {
    setPendingId(chapterId);
    startTransition(async () => {
      const result = await deleteChapter(chapterId);
      setPendingId(null);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        setModal(null);
        refresh();
      }
    });
  }

  function confirmDeleteBook(bookId: string) {
    startTransition(async () => {
      const result = await deleteBook(bookId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        setModal(null);
        refresh();
      }
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 xl:max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary-tint text-primary-strong">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-serif-display text-2xl font-medium text-foreground">El Profesor</h1>
            <p className="text-sm text-foreground-muted">Fiches et flashcards générées à partir de vos livres.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/apps/el-profesor/emergency"
            className="flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger-tint px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-tint/70"
            title="Références d'urgence marquées par un administrateur — consultation rapide"
          >
            <Siren className="h-3.5 w-3.5" /> Mode urgence
          </Link>
          <Link href="/apps/el-profesor/guide">
            <Button variant="ghost" size="icon" aria-label="Guide d'utilisation" title="Guide d'utilisation">
              <BookText className="h-4 w-4" />
            </Button>
          </Link>
          <Button variant="ghost" size="icon" onClick={() => setTourOpen(true)} aria-label="Revoir le tutoriel" title="Revoir le tutoriel">
            <HelpCircle className="h-4 w-4" />
          </Button>
          <Link href="/apps/el-profesor/glossary">
            <Button variant="ghost" size="icon" aria-label="Glossaire des notions" title="Glossaire des notions">
              <BookOpen className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/apps/el-profesor/journal">
            <Button variant="ghost" size="icon" aria-label="Mon journal de cas" title="Mon journal de cas">
              <NotebookPen className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/apps/el-profesor/suspended">
            <Button variant="ghost" size="icon" aria-label="Cartes exclues de mes révisions" title="Cartes exclues de mes révisions">
              <BellOff className="h-4 w-4" />
            </Button>
          </Link>
          {isAdmin && (
            <>
              <Link href="/apps/el-profesor/notions">
                <Button variant="ghost" size="icon" aria-label="Notions et contradictions" title="Notions et contradictions">
                  <Tag className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/apps/el-profesor/quality">
                <Button variant="ghost" size="icon" aria-label="Tableau de bord qualité" title="Tableau de bord qualité">
                  <Gauge className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/apps/el-profesor/archived">
                <Button variant="ghost" size="icon" aria-label="Livres archivés" title="Livres archivés">
                  <Archive className="h-4 w-4" />
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setModal({ type: "gemini_settings" })}
                aria-label={hasGeminiKey ? "Réglages IA (Gemini)" : "Réglages IA (Gemini) — clé API manquante"}
                title={hasGeminiKey ? "Réglages IA (Gemini)" : "Clé API Gemini manquante — l'extraction échouera"}
                className="relative"
              >
                <Settings className="h-4 w-4" />
                {!hasGeminiKey && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" />}
              </Button>
              <Button onClick={() => setModal({ type: "add_book" })}>
                <Plus className="h-4 w-4" /> Ajouter un livre
              </Button>
            </>
          )}
        </div>
      </div>

      {books.length > 0 && <LibraryStats totalBooks={books.length} totalChapters={totalChapters} totalFlashcards={totalFlashcards} />}

      {resume && (
        <Link
          href={`/apps/el-profesor/chapters/${resume.chapter.id}`}
          className="mt-6 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-primary/30 bg-primary-tint px-4 py-3 text-primary-strong hover:border-primary/50"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">Reprendre la lecture</p>
            <p className="truncate text-sm font-medium">
              {resume.chapter.title} <span className="opacity-70">— {resume.book.title}</span>
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>
      )}

      {books.length > 0 && (
        <Suspense fallback={<DashboardWidgetsSkeleton />}>
          <DashboardSecondaryWidgets
            dataPromise={secondaryDataPromise}
            totalAcquired={totalAcquired}
            chaptersMastered={chaptersMastered}
            isAdmin={isAdmin}
          />
        </Suspense>
      )}

      {books.length > 0 && (
        <div className="mt-6">
          <LibrarySearch />
          <button
            type="button"
            onClick={() => setModal({ type: "search_notes" })}
            className="mt-1.5 text-xs text-foreground-subtle underline hover:text-foreground"
          >
            Rechercher dans mes notes
          </button>
        </div>
      )}

      {books.length === 0 && (
        <div className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
          Aucun livre pour l&apos;instant.{isAdmin ? " Ajoutez-en un pour commencer." : " Un administrateur doit d'abord en importer."}
        </div>
      )}

      {books.length > 0 && (
        <div className="mt-6 flex w-fit items-center gap-1 rounded-full border border-border p-1">
          <button
            type="button"
            onClick={() => setViewMode("book")}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              viewMode === "book" ? "bg-primary-tint text-primary-strong" : "text-foreground-subtle hover:text-foreground"
            }`}
          >
            Par livre
          </button>
          <button
            type="button"
            onClick={() => setViewMode("notion")}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              viewMode === "notion" ? "bg-primary-tint text-primary-strong" : "text-foreground-subtle hover:text-foreground"
            }`}
          >
            Par notion
          </button>
        </div>
      )}

      {viewMode === "book" && themes.length > 1 && (
        <div className="mt-6 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setThemeFilter(null)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              themeFilter === null ? "border-primary bg-primary-tint text-primary-strong" : "border-border text-foreground-subtle"
            }`}
          >
            Tous les thèmes
          </button>
          {themes.map((theme) => (
            <button
              key={theme}
              type="button"
              onClick={() => setThemeFilter(theme)}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                themeFilter === theme ? "border-primary bg-primary-tint text-primary-strong" : "border-border text-foreground-subtle"
              }`}
            >
              {theme}
            </button>
          ))}
        </div>
      )}

      {viewMode === "book" && isAdmin && aiProvider === "claude" && bulkSelectableChapterIds.length > 0 && selectedChapterIds.size === 0 && (
        <button
          type="button"
          onClick={() => setSelectedChapterIds(new Set(bulkSelectableChapterIds))}
          className="mt-4 text-xs text-foreground-subtle underline hover:text-foreground"
        >
          Sélectionner tous les chapitres PDF ({bulkSelectableChapterIds.length}) pour estimer le coût de tout générer
        </button>
      )}

      {selectedChapterIds.size > 0 && (
        <div className="sticky top-2 z-10 mt-6 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-primary bg-surface p-3 shadow-md">
          <span className="text-sm font-medium text-foreground">
            {selectedChapterIds.size} chapitre{selectedChapterIds.size > 1 ? "s" : ""} sélectionné{selectedChapterIds.size > 1 ? "s" : ""}
          </span>
          <Suspense fallback={<span className="text-xs text-foreground-subtle">calcul du coût…</span>}>
            <BulkCostEstimate aiConfigPromise={aiConfigPromise} selectedChapters={selectedChapters} />
          </Suspense>
          <Button size="sm" onClick={handleBulkExtract} disabled={isBulkPending}>
            <Sparkles className="h-3.5 w-3.5" /> {isBulkPending ? "…" : "Extraire via un lot Claude"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBulkComplement}
            disabled={isBulkPending}
            title="Complète chaque chapitre sélectionné, en enchaînant automatiquement les passes jusqu'à couverture complète"
          >
            <Zap className="h-3.5 w-3.5" /> {isBulkPending ? "…" : "Compléter jusqu'à couverture"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedChapterIds(new Set())} disabled={isBulkPending}>
            Désélectionner tout
          </Button>
        </div>
      )}

      {viewMode === "notion" && (
        <div className="mt-6">
          <Suspense fallback={<DashboardNotionViewSkeleton />}>
            <DashboardNotionView dataPromise={notionViewDataPromise} isAdmin={isAdmin} />
          </Suspense>
        </div>
      )}

      {viewMode === "book" && (
      <div className="mt-8 space-y-8">
        {visibleBooks.map((book) => {
          const bookIndex = books.findIndex((b) => b.id === book.id);
          const publishedChapters = book.chapters.filter((c) => c.status === "published");
          const bookMastered =
            publishedChapters.length > 0 &&
            publishedChapters.every((c) => {
              const m = masteryCounts[c.id];
              return m && m.total > 0 && m.acquired === m.total;
            });
          const collapsed = collapsedBookIds.has(book.id);
          return (
          <div key={book.id}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => toggleBookCollapsed(book.id)}
                aria-expanded={!collapsed}
                aria-label={`${collapsed ? "Développer" : "Réduire"} ${book.title}`}
                className="flex flex-1 items-center gap-3 text-left"
              >
                <ChevronRight className={`h-4 w-4 shrink-0 text-foreground-subtle transition-transform ${collapsed ? "" : "rotate-90"}`} />
                {book.coverUrl && (
                  <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface-muted">
                    <Image src={book.coverUrl} alt="" fill sizes="40px" className="object-cover" />
                  </span>
                )}
                <div>
                  <h2 className="font-serif-display text-lg font-medium text-foreground">{book.title}</h2>
                  {collapsed && (
                    <p className="text-xs text-foreground-subtle">
                      {book.chapters.length} chapitre{book.chapters.length > 1 ? "s" : ""}
                    </p>
                  )}
                  {bookMastered && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-accent">
                      <Trophy className="h-3 w-3" /> Livre maîtrisé
                    </span>
                  )}
                  {(book.author || book.edition) && (
                    <p className="text-sm text-foreground-subtle">
                      {[book.author, book.edition].filter(Boolean).join(" — ")}
                    </p>
                  )}
                  {book.theme && (
                    <span className="mt-0.5 inline-block rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground-subtle">
                      {book.theme}
                    </span>
                  )}
                </div>
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/apps/el-profesor/books/${book.id}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-foreground-subtle hover:bg-surface-muted hover:text-foreground"
                  aria-label={`Table des matières de ${book.title}`}
                  title="Table des matières"
                >
                  <ListTree className="h-4 w-4" />
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setModal({ type: "search_book", bookId: book.id, bookTitle: book.title })}
                  aria-label={`Rechercher dans ${book.title}`}
                  title="Rechercher dans ce livre"
                >
                  <Search className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleExportNotes(book.id, book.title)}
                  aria-label={`Exporter mes notes pour ${book.title}`}
                  title="Exporter mes notes de ce livre"
                >
                  <Download className="h-4 w-4" />
                </Button>
                {isAdmin && (
                  <>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => handleMoveBook(book.id, "up")}
                      disabled={bookIndex === 0 || isPending}
                      aria-label="Monter ce livre"
                      className="text-foreground-subtle hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveBook(book.id, "down")}
                      disabled={bookIndex === books.length - 1 || isPending}
                      aria-label="Descendre ce livre"
                      className="text-foreground-subtle hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setModal({
                        type: "edit_book",
                        book: { id: book.id, title: book.title, author: book.author, edition: book.edition, theme: book.theme },
                      })
                    }
                    aria-label="Modifier le livre"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setModal({ type: "upload_chapter", bookId: book.id, nextOrder: book.chapters.length })}
                  >
                    <Plus className="h-3.5 w-3.5" /> Chapitre
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    title="Uploader le PDF complet du livre et le diviser en plusieurs chapitres (manuellement ou via une suggestion IA)"
                    onClick={() => setModal({ type: "split_book", bookId: book.id, nextOrder: book.chapters.length })}
                  >
                    <Scissors className="h-3.5 w-3.5" /> Diviser un PDF
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setModal({
                        type: "new_edition",
                        book: { id: book.id, title: book.title, author: book.author, edition: book.edition, theme: book.theme },
                      })
                    }
                    aria-label="Nouvelle édition de ce livre"
                    title="Nouvelle édition (archive celle-ci, en garde l'historique)"
                  >
                    <GitBranch className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setModal({ type: "archive_book", bookId: book.id, title: book.title })}
                    aria-label="Archiver le livre"
                    title="Exporter puis archiver ce livre (réversible)"
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setModal({ type: "delete_book", bookId: book.id, title: book.title, chapterCount: book.chapters.length })}
                    aria-label="Supprimer le livre"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  </>
                )}
              </div>
            </div>

            {!collapsed && (
            <>
            <ChapterProgressComparison chapters={publishedChapters} masteryCounts={masteryCounts} />

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {book.chapters.map((chapter) => {
                const due = dueCounts[chapter.id] ?? 0;
                const needsReview = needsReviewCounts[chapter.id] ?? 0;
                const busy = isPending && pendingId === chapter.id;
                const bulkSelectable = isAdmin && aiProvider === "claude" && chapter.sourceKind === "pdf";
                const selected = selectedChapterIds.has(chapter.id);
                return (
                  <div
                    key={chapter.id}
                    className={`rounded-[var(--radius-lg)] border p-4 ${selected ? "border-primary bg-primary-tint/30" : "border-border bg-surface"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        {bulkSelectable && (
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleChapterSelection(chapter.id)}
                            aria-label={`Sélectionner « ${chapter.title} » pour un lot Claude`}
                            className="mt-1 h-4 w-4 shrink-0"
                          />
                        )}
                        <p className="font-medium text-foreground">{chapter.title}</p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        {chapter.sourceKind !== "pdf" && (
                          <Badge variant="neutral" title="Importé depuis Word/PowerPoint — pas de PDF source ni de citations par page">
                            {chapter.sourceKind === "docx" ? "Word" : "PowerPoint"}
                          </Badge>
                        )}
                        {isAdmin && needsReview > 0 && <Badge variant="accent">{needsReview} à vérifier</Badge>}
                        <Badge variant={STATUS_VARIANT[chapter.status]}>{STATUS_LABEL[chapter.status]}</Badge>
                      </div>
                    </div>
                    {chapter.status === "failed" && chapter.extractionError && (
                      <p className="mt-1.5 text-xs text-danger">{chapter.extractionError}</p>
                    )}
                    {chapter.status === "published" && masteryCounts[chapter.id] && <MasteryBar counts={masteryCounts[chapter.id]} />}
                    {chapter.status === "published" && globalMastery[chapter.id] && (
                      <p className="mt-1 text-[11px] text-foreground-subtle">
                        {globalMastery[chapter.id].masteredPct}% des autres utilisateurs actifs ont aussi maîtrisé ce chapitre
                      </p>
                    )}
                    {chapter.status === "published" && (difficultCounts[chapter.id] ?? 0) > 0 && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-danger">
                        <ShieldAlert className="h-3 w-3" /> {difficultCounts[chapter.id]} carte
                        {(difficultCounts[chapter.id] ?? 0) > 1 ? "s" : ""} difficile
                        {(difficultCounts[chapter.id] ?? 0) > 1 ? "s" : ""}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {chapter.status === "published" && (
                        <>
                          <Link href={`/apps/el-profesor/chapters/${chapter.id}`}>
                            <Button variant="secondary" size="sm">
                              <BookOpen className="h-3.5 w-3.5" /> Fiches
                            </Button>
                          </Link>
                          <Link href={`/apps/el-profesor/chapters/${chapter.id}/review?mode=due`}>
                            <Button size="sm" disabled={due === 0}>
                              {due > 0 ? `Réviser (${due})` : "À jour"}
                            </Button>
                          </Link>
                          <Link href={`/apps/el-profesor/chapters/${chapter.id}/review?mode=free`}>
                            <Button variant="ghost" size="sm">
                              Révision libre
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setModal({ type: "exam_start", chapterId: chapter.id, chapterTitle: chapter.title })}
                          >
                            <Timer className="h-3.5 w-3.5" /> Examen blanc
                          </Button>
                        </>
                      )}

                      {isAdmin && (chapter.status === "pending" || chapter.status === "failed") && (
                        <Button size="sm" onClick={() => handleExtract(chapter.id)} disabled={busy}>
                          <Sparkles className="h-3.5 w-3.5" />
                          {busy ? (
                            <>
                              Extraction… {pendingStartedAt && <ElapsedTime startedAt={pendingStartedAt} />}
                            </>
                          ) : (
                            "Extraire"
                          )}
                        </Button>
                      )}
                      {isAdmin &&
                        ((chapter.status === "extracting" && isStuckExtraction(chapter.updatedAt)) ||
                          (chapter.status === "queued" && isStuckQueued(chapter.updatedAt))) && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleResetStuck(chapter.id)}
                            disabled={busy}
                            title={
                              chapter.status === "queued"
                                ? "Le lot Claude semble résolu sans que ce chapitre ait été mis à jour — réinitialise le chapitre pour pouvoir relancer l'extraction (sans effet si le lot est en réalité toujours en cours)"
                                : "L'extraction semble bloquée (aucune progression depuis plusieurs minutes) — réinitialise le chapitre pour pouvoir relancer l'extraction"
                            }
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
                          </Button>
                        )}
                      {isAdmin && chapter.status === "draft_ready" && (
                        <Link href={`/apps/el-profesor/chapters/${chapter.id}/admin-review`}>
                          <Button size="sm">
                            <ClipboardCheck className="h-3.5 w-3.5" /> Relire &amp; publier
                          </Button>
                        </Link>
                      )}
                      {isAdmin && chapter.sourceKind === "pdf" && (chapter.status === "draft_ready" || chapter.status === "published") && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleComplement(chapter.id)}
                            disabled={busy}
                            title="Relit le PDF et ne génère que les notions pas encore couvertes (une passe)"
                          >
                            <SearchCheck className="h-3.5 w-3.5" />
                            {busy ? (
                              <>
                                Analyse… {pendingStartedAt && <ElapsedTime startedAt={pendingStartedAt} />}
                              </>
                            ) : chapter.estimatedRemainingPasses ? (
                              `Compléter (≈${chapter.estimatedRemainingPasses})`
                            ) : (
                              "Compléter"
                            )}
                          </Button>
                          {!busy && (chapter.estimatedRemainingPasses ?? 0) > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleComplement(chapter.id, true)}
                              disabled={busy}
                              title="Enchaîne automatiquement plusieurs passes, jusqu'à couverture complète ou blocage (limite de sécurité incluse)"
                            >
                              <Zap className="h-3.5 w-3.5" /> Jusqu&apos;à couverture
                            </Button>
                          )}
                        </>
                      )}
                      {isAdmin && (
                        <MoreActionsMenu>
                          {chapter.status === "published" && (
                            <Link href={`/apps/el-profesor/chapters/${chapter.id}/admin-review`}>
                              <Button variant="ghost" size="sm" className="w-full justify-start">
                                <Pencil className="h-3.5 w-3.5" /> Éditer
                              </Button>
                            </Link>
                          )}
                          {chapter.status === "published" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start"
                              onClick={() => handleExportCsv(chapter.id, chapter.title)}
                              disabled={exportingId === chapter.id}
                            >
                              <Download className="h-3.5 w-3.5" /> Export CSV
                            </Button>
                          )}
                          {chapter.status === "published" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start"
                              onClick={() => handleExportAnki(chapter.id, chapter.title)}
                              disabled={exportingId === chapter.id}
                              title="Format texte tabulé, importable via Fichier > Importer dans Anki"
                            >
                              Export Anki
                            </Button>
                          )}
                          {chapter.status !== "extracting" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start"
                              onClick={() => setModal({ type: "import_content", chapterId: chapter.id, chapterTitle: chapter.title })}
                              title="Importer des fiches/flashcards générées ailleurs (ex. Claude.ai) au lieu d'appeler Gemini"
                            >
                              Importer
                            </Button>
                          )}
                          {chapter.status !== "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start"
                              onClick={() => setModal({ type: "extraction_history", chapterId: chapter.id, chapterTitle: chapter.title })}
                              title="Voir les 5 dernières tentatives d'extraction — utile pour diagnostiquer une génération vide"
                            >
                              <History className="h-3.5 w-3.5" /> Historique IA
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-danger"
                            onClick={() =>
                              setModal({
                                type: "delete_chapter",
                                chapterId: chapter.id,
                                title: chapter.title,
                                flashcardCount: masteryCounts[chapter.id]?.total ?? 0,
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Supprimer
                          </Button>
                        </MoreActionsMenu>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            </>
            )}
          </div>
          );
        })}
      </div>
      )}

      {modal?.type === "add_book" && (
        <AddBookDialog
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {modal?.type === "edit_book" && (
        <AddBookDialog
          book={modal.book}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {modal?.type === "new_edition" && (
        <AddBookDialog
          newEditionOf={modal.book}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {modal?.type === "upload_chapter" && (
        <UploadChapterDialog
          bookId={modal.bookId}
          nextOrder={modal.nextOrder}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {modal?.type === "split_book" && (
        <SplitBookDialog
          bookId={modal.bookId}
          nextOrder={modal.nextOrder}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {modal?.type === "delete_book" && (
        <ConfirmDeleteDialog
          title="Supprimer le livre ?"
          itemName={modal.title}
          consequences={[
            modal.chapterCount > 0
              ? `${modal.chapterCount} chapitre${modal.chapterCount > 1 ? "s" : ""} et tout leur contenu (fiches, flashcards, historique de révision)`
              : "Aucun chapitre pour l'instant",
            "Le PDF de chaque chapitre",
          ]}
          isPending={isPending}
          onConfirm={() => confirmDeleteBook(modal.bookId)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "delete_chapter" && (
        <ConfirmDeleteDialog
          title="Supprimer le chapitre ?"
          itemName={modal.title}
          consequences={[
            "Toutes les fiches et blocs générés pour ce chapitre",
            modal.flashcardCount > 0
              ? `${modal.flashcardCount} flashcard${modal.flashcardCount > 1 ? "s" : ""} et leur historique de révision`
              : "Les flashcards associées et leur historique de révision",
            "Le PDF source",
          ]}
          isPending={isPending}
          onConfirm={() => confirmDeleteChapter(modal.chapterId)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "search_book" && (
        <Modal title="Rechercher" onClose={() => setModal(null)} size="md">
          <LibrarySearch autoFocus bookId={modal.bookId} bookTitle={modal.bookTitle} />
        </Modal>
      )}

      {modal?.type === "search_notes" && <NotesSearchDialog onClose={() => setModal(null)} />}
      {modal?.type === "import_content" && (
        <ImportContentDialog
          chapterId={modal.chapterId}
          chapterTitle={modal.chapterTitle}
          onClose={() => setModal(null)}
          onImported={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {modal?.type === "extraction_history" && (
        <ExtractionHistoryDialog
          chapterId={modal.chapterId}
          chapterTitle={modal.chapterTitle}
          onClose={() => setModal(null)}
          onRetried={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {modal?.type === "archive_book" && (
        <Modal title="Archiver ce livre ?" onClose={() => setModal(null)} size="sm">
          <p className="text-sm text-foreground-muted">
            « {modal.title} » sera retiré de la bibliothèque active. Rien n&apos;est supprimé — un export complet du contenu et des
            statistiques anonymisées se télécharge automatiquement, et le livre reste réactivable depuis « Livres archivés ».
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)} disabled={isPending}>
              Annuler
            </Button>
            <Button onClick={() => handleArchiveBook(modal.bookId, modal.title)} disabled={isPending}>
              {isPending ? "…" : "Exporter et archiver"}
            </Button>
          </div>
        </Modal>
      )}
      {modal?.type === "exam_start" && (
        <Modal title="Examen blanc" description={modal.chapterTitle} onClose={() => setModal(null)} size="sm">
          <p className="text-sm text-foreground-muted">
            Toutes les flashcards publiées du chapitre, mélangées, sous un compte à rebours — la session s&apos;arrête
            automatiquement au temps écoulé. Comme la révision libre, jamais pris en compte dans la planification.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {EXAM_DURATION_PRESETS.map((preset) => (
              <Link
                key={preset.seconds}
                href={`/apps/el-profesor/chapters/${modal.chapterId}/review?mode=exam&duration=${preset.seconds}`}
                onClick={() => setModal(null)}
              >
                <Button variant="secondary" className="w-full">
                  {preset.label}
                </Button>
              </Link>
            ))}
          </div>
        </Modal>
      )}
      {modal?.type === "gemini_settings" && (
        <Suspense fallback={<GeminiSettingsLoadingModal onClose={() => setModal(null)} />}>
          <GeminiSettingsLoader
            aiConfigPromise={aiConfigPromise}
            hasApiKey={hasGeminiKey}
            aiProvider={aiProvider}
            onClose={() => {
              setModal(null);
              refresh();
            }}
          />
        </Suspense>
      )}

      <OnboardingTour moduleKey="el-profesor" steps={EL_PROFESOR_ONBOARDING_STEPS} open={tourOpen} onOpenChange={setTourOpen} />
    </div>
  );
}
