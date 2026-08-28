"use client";

import { useState, useTransition } from "react";
import { Sparkles, Plus, ClipboardPaste, Copy } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { getBookPdfPageCount, suggestBookChapters, splitBookIntoChapters } from "@/app/apps/el-profesor/actions/split-book";
import { uploadPdfDirect } from "@/lib/el-profesor/client-pdf-upload";
import { RangeRow } from "@/components/el-profesor/dialogs/range-row";

interface Row {
  title: string;
  startPage: string;
  endPage: string;
}

function titleFromFilename(name: string): string {
  return name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
}

function buildChapterListPrompt(pageCount: number | null): string {
  return `Voici un livre au format PDF${pageCount ? ` de ${pageCount} pages` : ""}. Identifie chaque chapitre (ou grande partie numérotée), dans l'ordre, avec son titre exact et la première et la dernière page où il commence/se termine — la position réelle dans le fichier PDF fourni, en comptant à partir de 1 pour la toute première page du fichier, jamais le numéro imprimé sur la page elle-même.

Réponds uniquement avec un tableau JSON, sans texte avant ni après, au format exact :
[{"title": "Titre du chapitre", "startPage": 1, "endPage": 24}, ...]`;
}

/**
 * Accepts the built-in AI suggestion's own shape (startPage/endPage) as well
 * as a few reasonable variants a human might get back from pasting the
 * prompt above into an external Claude.ai/ChatGPT chat — title/name,
 * startPage/start_page, endPage/end_page — since that response isn't going
 * through our own schema-constrained call at all (item requested
 * 2026-08-25, as an external alternative when the in-app AI suggestion
 * doesn't work well for a given book).
 */
function parseChapterListJson(raw: string): Row[] | { error: string } {
  let parsed: unknown;
  try {
    const fenced = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    parsed = JSON.parse(fenced ? fenced[1].trim() : raw.trim());
  } catch {
    return { error: "JSON invalide — vérifiez que vous avez bien copié tout le tableau, sans texte avant ou après." };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: "Le JSON doit être un tableau non vide de chapitres." };
  }
  const rows: Row[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") return { error: "Chaque entrée doit être un objet avec titre, page de début et page de fin." };
    const e = entry as Record<string, unknown>;
    const title = e.title ?? e.name;
    const startPage = e.startPage ?? e.start_page;
    const endPage = e.endPage ?? e.end_page;
    if (typeof title !== "string" || !title.trim()) return { error: "Un chapitre n'a pas de titre valide." };
    if (typeof startPage !== "number" || typeof endPage !== "number") {
      return { error: `« ${title} » : page de début/fin manquante ou invalide.` };
    }
    rows.push({ title: title.trim(), startPage: String(startPage), endPage: String(endPage) });
  }
  return rows;
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
  const [isUploading, setIsUploading] = useState(false);
  const [isSuggesting, startSuggesting] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [bookPdfPath, setBookPdfPath] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  async function handleFileChange(f: File | null) {
    setFile(f);
    setBookPdfPath(null);
    setPageCount(null);
    setRows([]);
    if (!f) return;

    setIsUploading(true);
    // Staged under `_staging/` since the whole book is never a persisted
    // entity — only the resulting per-chapter PDFs are (see splitBookIntoChapters,
    // which deletes this path once it's done reading from it).
    const uploaded = await uploadPdfDirect(`_staging/${crypto.randomUUID()}.pdf`, f);
    if ("error" in uploaded) {
      setIsUploading(false);
      toast(uploaded.error, { variant: "error" });
      return;
    }
    setBookPdfPath(uploaded.path);

    const result = await getBookPdfPageCount(uploaded.path);
    setIsUploading(false);
    if (result.error) {
      toast(result.error, { variant: "error" });
      return;
    }
    setPageCount(result.pageCount ?? null);
    setRows([{ title: titleFromFilename(f.name), startPage: "1", endPage: String(result.pageCount ?? "") }]);
  }

  function handleSuggest() {
    if (!bookPdfPath) return;
    startSuggesting(async () => {
      const result = await suggestBookChapters(bookPdfPath);
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

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(buildChapterListPrompt(pageCount));
      toast("Instructions copiées — collez-les dans Claude.ai, ChatGPT... avec la table des matières ou le PDF du livre.", { variant: "success" });
    } catch {
      toast("Impossible de copier automatiquement — sélectionnez le texte manuellement.", { variant: "error" });
    }
  }

  function handleImportJson() {
    const result = parseChapterListJson(importText);
    if ("error" in result) {
      toast(result.error, { variant: "error" });
      return;
    }
    setRows(result);
    setShowImport(false);
    setImportText("");
    toast(`${result.length} chapitre(s) importé(s) — à vérifier avant de valider.`, { variant: "success" });
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
    if (!bookPdfPath || !rowsValid) return;
    startSaving(async () => {
      const result = await splitBookIntoChapters(
        bookId,
        nextOrder,
        bookPdfPath,
        rows.map((r) => ({ title: r.title.trim(), startPage: Number(r.startPage), endPage: Number(r.endPage) }))
      );
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Chapitres créés.", { variant: "success" });
        onSaved();
      }
    });
  }

  const isPending = isSuggesting || isSaving || isUploading;

  return (
    <Modal
      title="Diviser un PDF en chapitres"
      description="Uploadez le PDF complet du livre, puis définissez chaque chapitre par sa première et sa dernière page — suggestion IA (Gemini), import d'une liste JSON obtenue ailleurs, ou saisie manuelle : tout reste entièrement modifiable avant validation."
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
            disabled={isUploading}
            className="block w-full text-sm text-foreground-muted file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-primary-tint file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-strong"
          />
          {isUploading && <p className="text-xs text-foreground-subtle">Envoi du PDF en cours… (peut prendre un moment pour un gros fichier)</p>}
          {pageCount !== null && <p className="text-xs text-foreground-subtle">{pageCount} page(s) au total.</p>}
        </div>

        {file && bookPdfPath && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={handleSuggest} disabled={isPending}>
                <Sparkles className="h-3.5 w-3.5" /> {isSuggesting ? "Analyse en cours…" : "Suggérer les chapitres via IA"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowImport((v) => !v)} disabled={isPending}>
                <ClipboardPaste className="h-3.5 w-3.5" /> Importer une liste (JSON)
              </Button>
            </div>

            {showImport && (
              <div className="space-y-2 rounded-[var(--radius-md)] border border-border p-3">
                <p className="text-xs text-foreground-subtle">
                  Si la suggestion IA ne fonctionne pas bien pour ce livre, demandez la liste des chapitres à une IA externe
                  (Claude.ai, ChatGPT...) avec sa table des matières ou le PDF, puis collez sa réponse JSON ci-dessous.
                </p>
                <Button variant="ghost" size="sm" onClick={handleCopyPrompt} type="button">
                  <Copy className="h-3.5 w-3.5" /> Copier les instructions à envoyer
                </Button>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder='[{"title": "Chapitre 1", "startPage": 1, "endPage": 24}, ...]'
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
              <Plus className="h-3.5 w-3.5" /> Ajouter un chapitre
            </Button>
          </>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
        <Button onClick={handleSave} disabled={isPending || !bookPdfPath || !rowsValid}>
          {isSaving ? "Création…" : `Créer ${rows.length || ""} chapitre${rows.length > 1 ? "s" : ""}`}
        </Button>
      </div>
    </Modal>
  );
}
