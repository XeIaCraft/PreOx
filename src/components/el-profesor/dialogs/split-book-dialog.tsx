"use client";

import { useState, useTransition } from "react";
import { Sparkles, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { getBookPdfPageCount, suggestBookChapters, splitBookIntoChapters } from "@/app/apps/el-profesor/actions/split-book";

interface Row {
  title: string;
  startPage: string;
  endPage: string;
}

function titleFromFilename(name: string): string {
  return name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
}

/**
 * "Diviser un PDF en chapitres" (requested 2026-08-24) — uploads the whole
 * book once and defines chapter boundaries by page range, instead of
 * pre-splitting each chapter into its own file by hand before uploading via
 * UploadChapterDialog. AI suggestion is optional and Gemini-only (see the
 * doc comment on detectChapterBoundaries in gemini.ts) — manual entry
 * always works regardless of which provider is configured for extraction.
 */
export function SplitBookDialog({
  bookId,
  nextOrder,
  onClose,
  onSaved,
}: {
  bookId: string;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [isSuggesting, startSuggesting] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  async function handleFileChange(f: File | null) {
    setFile(f);
    setPageCount(null);
    setRows([]);
    if (!f) return;
    const result = await getBookPdfPageCount(f);
    if (result.error) {
      toast(result.error, { variant: "error" });
      return;
    }
    setPageCount(result.pageCount ?? null);
    setRows([{ title: titleFromFilename(f.name), startPage: "1", endPage: String(result.pageCount ?? "") }]);
  }

  function handleSuggest() {
    if (!file) return;
    startSuggesting(async () => {
      const result = await suggestBookChapters(file);
      if (result.error) toast(result.error, { variant: "error" });
      if (result.suggestions && result.suggestions.length > 0) {
        const total = result.pageCount ?? pageCount ?? 0;
        const next = [...result.suggestions].sort((a, b) => a.startPage - b.startPage);
        setRows(
          next.map((s, i) => ({
            title: s.title,
            startPage: String(s.startPage),
            endPage: String((i + 1 < next.length ? next[i + 1].startPage - 1 : total) || s.startPage),
          }))
        );
        if (result.success) toast(result.success, { variant: "success" });
      }
    });
  }

  function addRow() {
    const lastEnd = rows.length > 0 ? Number(rows[rows.length - 1].endPage) || 0 : 0;
    setRows((prev) => [...prev, { title: "", startPage: String(lastEnd + 1), endPage: pageCount ? String(pageCount) : "" }]);
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, ri) => (ri === i ? { ...r, ...patch } : r)));
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, ri) => ri !== i));
  }

  const rowsValid =
    rows.length > 0 &&
    rows.every((r) => r.title.trim() && Number(r.startPage) >= 1 && Number(r.endPage) >= Number(r.startPage) && (!pageCount || Number(r.endPage) <= pageCount));

  function handleSave() {
    if (!file || !rowsValid) return;
    startSaving(async () => {
      const result = await splitBookIntoChapters(
        bookId,
        nextOrder,
        file,
        rows.map((r) => ({ title: r.title.trim(), startPage: Number(r.startPage), endPage: Number(r.endPage) }))
      );
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Chapitres créés.", { variant: "success" });
        onSaved();
      }
    });
  }

  const isPending = isSuggesting || isSaving;

  return (
    <Modal
      title="Diviser un PDF en chapitres"
      description="Uploadez le PDF complet du livre, puis définissez chaque chapitre par sa première et sa dernière page — essayez d'abord la suggestion IA (Gemini) si vous voulez gagner du temps, elle reste entièrement modifiable avant validation."
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="book-pdf">PDF du livre complet</Label>
          <input
            id="book-pdf"
            type="file"
            accept="application/pdf"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-foreground-muted file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-primary-tint file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-strong"
          />
          {pageCount !== null && <p className="text-xs text-foreground-subtle">{pageCount} page(s) au total.</p>}
        </div>

        {file && (
          <>
            <Button variant="secondary" size="sm" onClick={handleSuggest} disabled={isPending}>
              <Sparkles className="h-3.5 w-3.5" /> {isSuggesting ? "Analyse en cours…" : "Suggérer les chapitres via IA"}
            </Button>

            <div className="max-h-80 space-y-2 overflow-y-auto">
              {rows.map((row, i) => (
                <div key={i} className="flex items-end gap-2 rounded-[var(--radius-sm)] border border-border p-2">
                  <div className="flex-1 space-y-1">
                    <Label>Titre</Label>
                    <Input value={row.title} onChange={(e) => updateRow(i, { title: e.target.value })} placeholder="Titre du chapitre" />
                  </div>
                  <div className="w-20 space-y-1">
                    <Label>Page début</Label>
                    <Input type="number" min={1} value={row.startPage} onChange={(e) => updateRow(i, { startPage: e.target.value })} />
                  </div>
                  <div className="w-20 space-y-1">
                    <Label>Page fin</Label>
                    <Input type="number" min={1} value={row.endPage} onChange={(e) => updateRow(i, { endPage: e.target.value })} />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeRow(i)} aria-label="Retirer ce chapitre">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button variant="ghost" size="sm" onClick={addRow} disabled={isPending}>
              <Plus className="h-3.5 w-3.5" /> Ajouter un chapitre
            </Button>
          </>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
        <Button onClick={handleSave} disabled={isPending || !file || !rowsValid}>
          {isSaving ? "Création…" : `Créer ${rows.length || ""} chapitre${rows.length > 1 ? "s" : ""}`}
        </Button>
      </div>
    </Modal>
  );
}
