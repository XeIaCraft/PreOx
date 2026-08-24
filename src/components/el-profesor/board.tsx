"use client";

import { useEffect, useState, useTransition } from "react";
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
  AlertTriangle,
  Siren,
  NotebookPen,
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
import { AddBookDialog } from "@/components/el-profesor/dialogs/add-book-dialog";
import { UploadChapterDialog } from "@/components/el-profesor/dialogs/upload-chapter-dialog";
import { SplitBookDialog } from "@/components/el-profesor/dialogs/split-book-dialog";
import { ConfirmDeleteDialog } from "@/components/el-profesor/dialogs/confirm-delete-dialog";
import { GeminiSettingsDialog } from "@/components/el-profesor/dialogs/gemini-settings-dialog";
import { LearningWidgets, DailyCard, LibraryStats, BookmarksList, OnThisDayNoteCard, BookRecommendationCard, DueBlocksWidget } from "@/components/el-profesor/learning-widgets";
import { deleteBook, deleteChapter, moveBook } from "@/app/apps/el-profesor/actions/library";
import { extractChapter, extractChapterComplementary } from "@/app/apps/el-profesor/actions/extraction";
import { submitExtractionBatch, submitComplementaryBatch } from "@/app/apps/el-profesor/actions/batches";
import { ImportContentDialog } from "@/components/el-profesor/dialogs/import-content-dialog";
import { exportBookArchive, archiveBook } from "@/app/apps/el-profesor/actions/archive";
import { getChapterFlashcardsForExport } from "@/app/apps/el-profesor/actions/export";
import { exportBookNotes } from "@/app/apps/el-profesor/actions/notes";
import { getLastChapter } from "@/lib/el-profesor/local-prefs";
import { formatUsd } from "@/lib/el-profesor/ai-pricing";
import { suggestLeechVariant } from "@/app/apps/el-profesor/actions/leech";
import type {
  BookWithChapters,
  ChapterDueCounts,
  ChapterMasteryCounts,
  ReviewActivitySummary,
  UpcomingForecastDay,
  DifficultFlashcardStat,
  LeechFlashcardStat,
  BookmarkedEntity,
  ChapterMasteryPercentile,
  StaleChapterAlert,
  KnowledgeExpiryAlert,
  BlockTypeFlagStat,
  GeminiUsageStats,
  ElProfesorAiProvider,
  OnThisDayNote,
  BookRecommendation,
  DueBlockEntry,
} from "@/lib/el-profesor/dal";
import type { ChapterStatus, Flashcard, BlockType } from "@/lib/el-profesor/types";
import type { ElProfesorBatchJobRow } from "@/lib/supabase/types";

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  definition_mecanisme: "Définition / mécanisme",
  valeurs_seuils: "Valeurs & seuils",
  tableau_comparatif: "Tableau comparatif",
  protocole_paliers: "Protocole",
  mnemotechnique: "Mnémotechnique",
  perle_clinique: "Perle clinique",
  piege_erreur: "Piège fréquent",
  formule: "Formule",
  texte_libre: "Note",
};

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
  | null;

const EXAM_DURATION_PRESETS = [
  { label: "10 min", seconds: 10 * 60 },
  { label: "20 min", seconds: 20 * 60 },
  { label: "30 min", seconds: 30 * 60 },
  { label: "45 min", seconds: 45 * 60 },
];

export function ElProfesorBoard({
  books,
  dueCounts,
  needsReviewCounts,
  masteryCounts,
  isAdmin,
  geminiModel,
  globalDueCount,
  difficultCount,
  difficultCounts,
  activity,
  overconfidentMissCount,
  forecast,
  mostDifficultGlobal,
  leechFlashcards,
  dailyCard,
  bookmarks,
  globalMastery,
  staleChapters,
  knowledgeExpiryAlerts,
  reviewTimeStats,
  flagStatsByBlockType,
  hasGeminiKey,
  geminiExtraKeyCount,
  geminiFallbackModel,
  geminiUsageStats,
  aiSpendCapUsd,
  currentMonthAiSpendUsd,
  aiProvider,
  hasClaudeKey,
  claudeModel,
  serverResumeChapterId,
  onThisDayNote,
  bookRecommendation,
  dueBlocks,
  batchJobs,
}: {
  books: BookWithChapters[];
  dueCounts: ChapterDueCounts;
  needsReviewCounts: ChapterDueCounts;
  masteryCounts: ChapterMasteryCounts;
  isAdmin: boolean;
  geminiModel: string | null;
  globalDueCount: number;
  difficultCount: number;
  difficultCounts: ChapterDueCounts;
  activity: ReviewActivitySummary;
  overconfidentMissCount: number;
  forecast: UpcomingForecastDay[];
  mostDifficultGlobal: DifficultFlashcardStat[];
  leechFlashcards: LeechFlashcardStat[];
  dailyCard: Flashcard | null;
  bookmarks: BookmarkedEntity[];
  globalMastery: Record<string, ChapterMasteryPercentile>;
  staleChapters: StaleChapterAlert[];
  knowledgeExpiryAlerts: KnowledgeExpiryAlert[];
  reviewTimeStats: { totalMs: number; last7DaysMs: number };
  flagStatsByBlockType: BlockTypeFlagStat[];
  hasGeminiKey: boolean;
  geminiExtraKeyCount: number;
  geminiFallbackModel: string | null;
  geminiUsageStats: GeminiUsageStats | null;
  aiSpendCapUsd: number | null;
  currentMonthAiSpendUsd: number;
  aiProvider: ElProfesorAiProvider;
  hasClaudeKey: boolean;
  claudeModel: string;
  /** Cross-device resume position (server-stored) — preferred over the local-only cache when present. */
  serverResumeChapterId: string | null;
  onThisDayNote: OnThisDayNote | null;
  bookRecommendation: BookRecommendation | null;
  dueBlocks: DueBlockEntry[];
  batchJobs: ElProfesorBatchJobRow[];
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
  const [pendingLeechId, setPendingLeechId] = useState<string | null>(null);
  const [isLeechPending, startLeechTransition] = useTransition();
  // Lazy initializer (client-only read), same pattern used elsewhere for
  // one-time localStorage reads — null on the server, resolved on mount.
  const [resumeChapterId] = useState(() => serverResumeChapterId ?? getLastChapter());
  const [tourOpen, setTourOpen] = useState(() => !hasSeenOnboarding("el-profesor"));

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

  // Demandé le 2026-08-24 : prix estimé AVANT de lancer une génération, pas
  // seulement après coup (item 80/81 ne couvraient que l'historique déjà
  // consommé). Faute de suivi du nombre de pages par appel dans le journal
  // d'usage, on approxime par le coût moyen des appels Claude déjà loggés
  // sur 7 jours (mélange extraction/complément/etc., mais ce sont l'immense
  // majorité des appels Claude du module) — mieux qu'aucun chiffre, mais
  // annoncé comme approximatif dans l'infobulle plutôt que présenté comme
  // exact. `null` tant qu'aucun appel Claude n'a encore été journalisé.
  const claudeModelKey = `claude:${claudeModel || "claude-sonnet-5"}`;
  const claudeUsage = geminiUsageStats?.byModel.find((m) => m.model === claudeModelKey);
  const avgCostPerCallUsd = claudeUsage && claudeUsage.calls > 0 && !claudeUsage.hasUnpricedCalls ? claudeUsage.estimatedCostUsd / claudeUsage.calls : null;
  const estimatedBulkCostUsd = avgCostPerCallUsd !== null ? avgCostPerCallUsd * selectedChapterIds.size : null;

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

  function handleSuggestLeechVariant(stat: LeechFlashcardStat) {
    setPendingLeechId(stat.flashcardId);
    startLeechTransition(async () => {
      const result = await suggestLeechVariant(stat.flashcardId, stat.subEntityName, stat.againRate);
      setPendingLeechId(null);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.suggestion ? `Variante ajoutée : « ${result.suggestion} »` : (result.success ?? "Variante ajoutée."), { variant: "success" });
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
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-primary-tint text-primary-strong">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-serif-display text-2xl font-medium text-foreground">El Profesor</h1>
            <p className="text-sm text-foreground-muted">Fiches et flashcards générées à partir de vos livres.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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

      {dailyCard && <DailyCard card={dailyCard} />}
      {onThisDayNote && <OnThisDayNoteCard note={onThisDayNote} />}
      {bookRecommendation && <BookRecommendationCard recommendation={bookRecommendation} />}

      <BookmarksList bookmarks={bookmarks} />
      <DueBlocksWidget blocks={dueBlocks} />

      {books.length > 0 && (
        <LearningWidgets
          activity={activity}
          overconfidentMissCount={overconfidentMissCount}
          forecast={forecast}
          globalDueCount={globalDueCount}
          difficultCount={difficultCount}
          totalAcquired={totalAcquired}
          chaptersMastered={chaptersMastered}
          reviewTimeStats={reviewTimeStats}
        />
      )}

      {globalDueCount >= 50 && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3">
          <p className="text-sm text-danger">
            {globalDueCount} cartes en attente de révision — la pile s&apos;accumule, un rattrapage s&apos;impose.
          </p>
          <Link href="/apps/el-profesor/review?mode=due">
            <Button size="sm" variant="secondary">
              Rattraper
            </Button>
          </Link>
        </div>
      )}

      {knowledgeExpiryAlerts.length > 0 && (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-danger">
            <AlertTriangle className="h-4 w-4" /> Connaissances probablement périmées
          </p>
          <p className="mt-0.5 text-xs text-danger/80">
            Ces chapitres étaient maîtrisés mais n&apos;ont pas été revus depuis longtemps après leur échéance — le risque d&apos;oubli
            y est élevé, une révision dédiée vaut mieux qu&apos;une simple mise à jour.
          </p>
          <ul className="mt-2 space-y-1.5">
            {knowledgeExpiryAlerts.slice(0, 5).map((alert) => (
              <li key={alert.chapterId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-foreground-muted">
                  <span className="font-medium text-foreground">{alert.chapterTitle}</span> — {alert.bookTitle} · {alert.expiredCount} carte
                  {alert.expiredCount > 1 ? "s" : ""} en retard de {alert.oldestOverdueDays}+ jours
                </span>
                <Link href={`/apps/el-profesor/chapters/${alert.chapterId}/review?mode=due`}>
                  <Button size="sm" variant="secondary">
                    Rafraîchir
                  </Button>
                </Link>
              </li>
            ))}
            {knowledgeExpiryAlerts.length > 5 && (
              <li className="text-xs text-danger/80">+ {knowledgeExpiryAlerts.length - 5} autre(s) chapitre(s)</li>
            )}
          </ul>
        </div>
      )}

      {isAdmin && (mostDifficultGlobal.length > 0 || leechFlashcards.length > 0 || flagStatsByBlockType.length > 0 || staleChapters.length > 0) && (
        <details className="mt-6 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
            <ShieldAlert className="h-3.5 w-3.5" /> Diagnostics de contenu (admin)
          </summary>
          <div className="mt-3 space-y-4">
            {mostDifficultGlobal.length > 0 && (
              <div>
                <p className="text-xs font-medium text-foreground-subtle">Flashcards les plus ratées (tous utilisateurs)</p>
                <ul className="mt-2 space-y-1.5">
                  {mostDifficultGlobal.slice(0, 5).map((stat) => (
                    <li key={stat.flashcardId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-foreground-muted" title={stat.front}>
                        {stat.front}
                        {stat.chapterTitle && <span className="text-foreground-subtle"> — {stat.chapterTitle}</span>}
                      </span>
                      <Badge variant="danger" className="shrink-0">
                        {stat.againCount}×
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {leechFlashcards.length > 0 && (
              <div>
                <p className="text-xs font-medium text-foreground-subtle" title="Ratée par une forte proportion des utilisateurs qui l'ont vue — souvent une question mal formulée plutôt qu'une vraie difficulté">
                  Cartes sangsues (échec fréquent, probablement mal formulées)
                </p>
                <ul className="mt-2 space-y-1.5">
                  {leechFlashcards.slice(0, 5).map((stat) => (
                    <li key={stat.flashcardId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-foreground-muted" title={stat.front}>
                        {stat.front}
                        {stat.chapterTitle && <span className="text-foreground-subtle"> — {stat.chapterTitle}</span>}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="danger">{Math.round(stat.againRate * 100)} %</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSuggestLeechVariant(stat)}
                          disabled={isLeechPending && pendingLeechId === stat.flashcardId}
                          title="Génère une reformulation de la question via IA et l'ajoute comme variante à tester (item « Test de formulations »)"
                        >
                          <Sparkles className="h-3.5 w-3.5" /> {isLeechPending && pendingLeechId === stat.flashcardId ? "…" : "Reformuler"}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {flagStatsByBlockType.length > 0 && (
              <div>
                <p className="text-xs font-medium text-foreground-subtle">Signalements par type de bloc</p>
                <ul className="mt-2 space-y-1.5">
                  {flagStatsByBlockType.map((stat) => (
                    <li key={stat.blockType} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-foreground-muted">{BLOCK_TYPE_LABELS[stat.blockType]}</span>
                      <Badge variant="danger" className="shrink-0">
                        {stat.flagCount}×
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {staleChapters.length > 0 && (
              <div>
                <p className="text-xs font-medium text-accent">Chapitres jamais révisés récemment</p>
                <ul className="mt-2 space-y-1 text-sm text-foreground-muted">
                  {staleChapters.map((c) => (
                    <li key={c.chapterId}>
                      {c.chapterTitle} <span className="text-foreground-subtle">— {c.bookTitle}</span>
                      {c.lastReviewedAt ? (
                        <span className="text-foreground-subtle"> (dernière révision : {new Date(c.lastReviewedAt).toLocaleDateString("fr-FR")})</span>
                      ) : (
                        <span className="text-foreground-subtle"> (jamais révisé)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
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

      {themes.length > 1 && (
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

      {isAdmin && aiProvider === "claude" && bulkSelectableChapterIds.length > 0 && selectedChapterIds.size === 0 && (
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
          {estimatedBulkCostUsd !== null ? (
            <span
              className="text-xs text-foreground-subtle"
              title="Estimation basée sur le coût moyen des appels Claude déjà journalisés sur 7 jours (extraction + complément + autres usages confondus) — une passe par chapitre ; un complément « jusqu'à couverture » peut en enchaîner plusieurs si le contenu est dense."
            >
              ≈ {formatUsd(estimatedBulkCostUsd)} estimé
            </span>
          ) : (
            <span className="text-xs text-foreground-subtle" title="Pas encore assez d'appels Claude journalisés pour estimer un coût moyen.">
              coût estimé indisponible
            </span>
          )}
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
          return (
          <div key={book.id}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {book.coverUrl && (
                  <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface-muted">
                    <Image src={book.coverUrl} alt="" fill sizes="40px" className="object-cover" />
                  </span>
                )}
                <div>
                  <h2 className="font-serif-display text-lg font-medium text-foreground">{book.title}</h2>
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
              </div>
              <div className="flex items-center gap-2">
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
                      {isAdmin && chapter.status === "draft_ready" && (
                        <Link href={`/apps/el-profesor/chapters/${chapter.id}/admin-review`}>
                          <Button size="sm">
                            <ClipboardCheck className="h-3.5 w-3.5" /> Relire &amp; publier
                          </Button>
                        </Link>
                      )}
                      {isAdmin && chapter.status === "published" && (
                        <Link href={`/apps/el-profesor/chapters/${chapter.id}/admin-review`}>
                          <Button variant="ghost" size="sm">
                            Éditer
                          </Button>
                        </Link>
                      )}
                      {isAdmin && chapter.status === "published" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleExportCsv(chapter.id, chapter.title)}
                          disabled={exportingId === chapter.id}
                          aria-label="Exporter les flashcards en CSV"
                          title="Exporter les flashcards en CSV"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      {isAdmin && chapter.status === "published" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleExportAnki(chapter.id, chapter.title)}
                          disabled={exportingId === chapter.id}
                          title="Exporter au format Anki (texte tabulé, importable via Fichier > Importer)"
                        >
                          Export Anki
                        </Button>
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
                      {isAdmin && chapter.status !== "extracting" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setModal({ type: "import_content", chapterId: chapter.id, chapterTitle: chapter.title })}
                          title="Importer des fiches/flashcards générées ailleurs (ex. Claude.ai) au lieu d'appeler Gemini"
                        >
                          Importer
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setModal({
                              type: "delete_chapter",
                              chapterId: chapter.id,
                              title: chapter.title,
                              flashcardCount: masteryCounts[chapter.id]?.total ?? 0,
                            })
                          }
                          aria-label="Supprimer le chapitre"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>

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
        <GeminiSettingsDialog
          currentModel={geminiModel ?? "gemini-flash-latest"}
          hasApiKey={hasGeminiKey}
          extraKeyCount={geminiExtraKeyCount}
          fallbackModel={geminiFallbackModel}
          usageStats={geminiUsageStats}
          aiSpendCapUsd={aiSpendCapUsd}
          currentMonthAiSpendUsd={currentMonthAiSpendUsd}
          aiProvider={aiProvider}
          hasClaudeKey={hasClaudeKey}
          claudeModel={claudeModel || "claude-sonnet-5"}
          batchJobs={batchJobs}
          onClose={() => {
            setModal(null);
            refresh();
          }}
        />
      )}

      <OnboardingTour moduleKey="el-profesor" steps={EL_PROFESOR_ONBOARDING_STEPS} open={tourOpen} onOpenChange={setTourOpen} />
    </div>
  );
}
