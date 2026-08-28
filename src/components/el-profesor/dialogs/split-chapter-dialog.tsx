"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Sparkles, Plus, ClipboardPaste, Copy, Download } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { suggestChapterSplit, splitChapterIntoParts } from "@/app/apps/el-profesor/actions/split-chapter";
import { getChapterPdfUrl } from "@/app/apps/el-profesor/actions/pdf";
import { computeTargetSplitPartCount } from "@/lib/el-profesor/chapter-quality";
import { validateChapterSplitRanges } from "@/lib/el-profesor/chapter-split-ranges";
import { RangeRow } from "@/components/el-profesor/dialogs/range-row";
import type { ChapterStatus } from "@/lib/el-profesor/types";

interface Row {
  title: string;
  startPage: string;
  endPage: string;
}

/** Even split as a starting point only — the admin corrects it by hand or via the AI suggestion before anything is actually split. */
function naiveSplitRows(pageCount: number, partCount: number, baseTitle: string): Row[] {
  const rows: Row[] = [];
  let start = 1;
  for (let i = 0; i < partCount; i++) {
    const end = i === partCount - 1 ? pageCount : Math.round((pageCount * (i + 1)) / partCount);
    rows.push({ title: `${baseTitle} (partie ${i + 1})`, startPage: String(start), endPage: String(end) });
    start = end + 1;
  }
  return rows;
}

function buildPartListPrompt(chapterTitle: string, pageCount: number): string {
  return `Voici un chapitre médical au format PDF de ${pageCount} pages, intitulé « ${chapterTitle} ». Il doit être divisé en plusieurs parties plus courtes, chacune à un point de coupure naturel (début de sous-partie/sous-titre, ou au minimum début de paragraphe — jamais au milieu d'un tableau, d'une figure ou d'un protocole). Identifie ces coupures, avec pour chaque partie son titre et sa première/dernière page — la position réelle dans le fichier PDF fourni, en comptant à partir de 1 pour la toute première page.

Réponds uniquement avec un tableau JSON, sans texte avant ni après, au format exact :
[{"title": "Titre de la partie", "startPage": 1, "endPage": 14}, ...]`;
}

/** Same tolerant shape as split-book-dialog's parseChapterListJson — accepts a few reasonable key variants from an external chat response. */
function parsePartListJson(raw: string): Row[] | { error: string } {
  let parsed: unknown;
  try {
    const fenced = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    parsed = JSON.parse(fenced ? fenced[1].trim() : raw.trim());
  } catch {
    return { error: "JSON invalide — vérifiez que vous avez bien copié tout le tableau, sans texte avant ou après." };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: "Le JSON doit être un tableau non vide de parties." };
  }
  const rows: Row[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") return { error: "Chaque entrée doit être un objet avec titre, page de début et page de fin." };
    const e = entry as Record<string, unknown>;
    const title = e.title ?? e.name;
    const startPage = e.startPage ?? e.start_page;
    const endPage = e.endPage ?? e.end_page;
    if (typeof title !== "string" || !title.trim()) return { error: "Une partie n'a pas de titre valide." };
    if (typeof startPage !== "number" || typeof endPage !== "number") {
      return { error: `« ${title} » : page de début/fin manquante ou invalide.` };
    }
    rows.push({ title: title.trim(), startPage: String(startPage), endPage: String(endPage) });
  }
  return rows;
}

/**
 * "Diviser ce chapitre" (2026-08-28) — the per-chapter counterpart of
 * SplitBookDialog, for a chapter whose PDF is already in storage (no
 * upload step). See split-chapter.ts's module doc comment for why this
 * exists: single-pass extraction quality was found to degrade past ~20
 * pages, and the fix is splitting at a natural boundary, never an
 * arbitrary fixed page count.
 */
export function SplitChapterDialog({
  chapter,
  onClose,
  onSaved,
}: {
  chapter: { id: string; bookId: string; title: string; orderIndex: number; pdfPageCount: number; status: ChapterStatus };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [isSuggesting, startSuggesting] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [isDownloading, setIsDownloading] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => naiveSplitRows(chapter.pdfPageCount, computeTargetSplitPartCount(chapter.pdfPageCount), chapter.title));
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  async function handleDownloadPdf() {
    setIsDownloading(true);
    const result = await getChapterPdfUrl(chapter.id);
    setIsDownloading(false);
    if (result.error || !result.url) {
      toast(result.error ?? "Impossible de générer le lien vers le PDF.", { variant: "error" });
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  function handleSuggest() {
    startSuggesting(async () => {
      const result = await suggestChapterSplit(chapter.id);
      if (result.error) toast(result.error, { variant: "error" });
      if (result.suggestions && result.suggestions.length > 0) {
        const total = result.pageCount ?? chapter.pdfPageCount;
        const next = [...result.suggestions].sort((a, b) => a.startPage - b.startPage);
        setRows(
          next.map((s, i) => ({
            title: `${chapter.title} (partie ${i + 1})`,
            startPage: String(s.startPage),
            endPage: String((i + 1 < next.length ? next[i + 1].startPage - 1 : total) || s.startPage),
          }))
        );
        if (result.success) toast(result.success, { variant: "success" });
      }
    });
  }

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(buildPartListPrompt(chapter.title, chapter.pdfPageCount));
      toast("Instructions copiées — collez-les dans Claude.ai, ChatGPT... avec le PDF du chapitre.", { variant: "success" });
    } catch {
      toast("Impossible de copier automatiquement — sélectionnez le texte manuellement.", { variant: "error" });
    }
  }

  function handleImportJson() {
    const result = parsePartListJson(importText);
    if ("error" in result) {
      toast(result.error, { variant: "error" });
      return;
    }
    setRows(result);
    setShowImport(false);
    setImportText("");
    toast(`${result.length} partie(s) importée(s) — à vérifier avant de valider.`, { variant: "success" });
  }

  function addRow() {
    const lastEnd = rows.length > 0 ? Number(rows[rows.length - 1].endPage) || 0 : 0;
    setRows((prev) => [...prev, { title: "", startPage: String(lastEnd + 1), endPage: String(chapter.pdfPageCount) }]);
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, ri) => (ri === i ? { ...r, ...patch } : r)));
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, ri) => ri !== i));
  }

  const numericRanges = rows.map((r) => ({ title: r.title.trim(), startPage: Number(r.startPage), endPage: Number(r.endPage) }));
  const validationError = validateChapterSplitRanges(numericRanges, chapter.pdfPageCount);

  function handleSave() {
    if (validationError) return;
    startSaving(async () => {
      const result = await splitChapterIntoParts(chapter.id, numericRanges);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Chapitre divisé.", { variant: "success" });
        onSaved();
      }
    });
  }

  const isPending = isSuggesting || isSaving || isDownloading;
  const hasContent = chapter.status !== "pending" && chapter.status !== "failed";

  return (
    <Modal
      title={`Diviser « ${chapter.title} »`}
      description={`${chapter.pdfPageCount} page(s) — définissez chaque partie par sa première et sa dernière page, à une coupure naturelle (sous-partie ou paragraphe). Suggestion IA (Gemini), import d'une liste JSON obtenue ailleurs, ou saisie manuelle : tout reste modifiable avant validation.`}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-3">
        {hasContent && (
          <div className="flex gap-3 rounded-[var(--radius-md)] border border-danger/30 bg-danger-tint p-3">
            <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-danger" />
            <p className="text-sm text-danger">
              « {chapter.title} » a déjà du contenu généré (fiches, flashcards, historique de révision). Diviser ce chapitre
              supprimera définitivement ce contenu et le remplacera par les nouvelles parties, à ré-extraire individuellement.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={handleSuggest} disabled={isPending}>
            <Sparkles className="h-3.5 w-3.5" /> {isSuggesting ? "Analyse en cours…" : "Suggérer les parties via IA"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowImport((v) => !v)} disabled={isPending}>
            <ClipboardPaste className="h-3.5 w-3.5" /> Importer une liste (JSON)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={isPending}
            title="Télécharger le PDF de ce chapitre pour repérer vous-même les bonnes coupures (ex. si la suggestion IA échoue sur un gros chapitre)"
          >
            <Download className="h-3.5 w-3.5" /> {isDownloading ? "…" : "Télécharger le PDF"}
          </Button>
        </div>

        {showImport && (
          <div className="space-y-2 rounded-[var(--radius-md)] border border-border p-3">
            <p className="text-xs text-foreground-subtle">
              Si la suggestion IA ne fonctionne pas bien pour ce chapitre, demandez la liste des parties à une IA externe
              (Claude.ai, ChatGPT...) avec le PDF du chapitre, puis collez sa réponse JSON ci-dessous.
            </p>
            <Button variant="ghost" size="sm" onClick={handleCopyPrompt} type="button">
              <Copy className="h-3.5 w-3.5" /> Copier les instructions à envoyer
            </Button>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='[{"title": "Partie 1", "startPage": 1, "endPage": 14}, ...]'
              rows={6}
              className="w-full resize-y rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 font-mono text-xs placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            <Button size="sm" onClick={handleImportJson} disabled={!importText.trim()}>
              Importer cette liste
            </Button>
          </div>
        )}

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {rows.map((row, i) => (
            <RangeRow
              key={i}
              title={row.title}
              startPage={row.startPage}
              endPage={row.endPage}
              onChange={(patch) => updateRow(i, patch)}
              onRemove={() => removeRow(i)}
            />
          ))}
        </div>

        <Button variant="ghost" size="sm" onClick={addRow} disabled={isPending}>
          <Plus className="h-3.5 w-3.5" /> Ajouter une partie
        </Button>

        {validationError && <p className="text-xs text-danger">{validationError}</p>}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
        <Button variant={hasContent ? "danger" : "primary"} onClick={handleSave} disabled={isPending || !!validationError}>
          {isSaving ? "Division…" : hasContent ? "Diviser et remplacer" : `Diviser en ${rows.length || ""} parties`}
        </Button>
      </div>
    </Modal>
  );
}
