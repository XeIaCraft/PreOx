"use client";

import { useRef, useState, useTransition } from "react";
import { Copy, Check, Upload, FileText } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { importChapterContent, importComplementaryContent } from "@/app/apps/el-profesor/actions/extraction";
import { attachChapterPdf } from "@/app/apps/el-profesor/actions/library";
import { uploadPdfDirect } from "@/lib/el-profesor/client-pdf-upload";
import { buildExternalImportPrompt } from "@/lib/el-profesor/prompts";
import { useToast } from "@/components/ui/toast";

export function ImportContentDialog({
  chapterId,
  chapterTitle,
  bookId,
  hasPdf,
  onClose,
  onImported,
}: {
  chapterId: string;
  chapterTitle: string;
  bookId: string;
  /** Word/PowerPoint chapters have no PDF (see importChapterContent's own comment on why that matters for citations) — offer to attach one only in that case; a chapter that already has a PDF keeps it (replacing it would invalidate citations already anchored to the old page numbers). */
  hasPdf: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [json, setJson] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [pdfAttached, setPdfAttached] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);

  function handleFileChosen(file: File | null) {
    if (!file) return;
    file
      .text()
      .then((text) => setJson(text))
      .catch(() => toast("Impossible de lire ce fichier.", { variant: "error" }));
  }

  async function handlePdfChosen(file: File | null) {
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast("Le fichier doit être un PDF.", { variant: "error" });
      return;
    }
    setIsUploadingPdf(true);
    try {
      const uploaded = await uploadPdfDirect(`${bookId}/${chapterId}.pdf`, file);
      if ("error" in uploaded) {
        toast(uploaded.error, { variant: "error" });
        return;
      }
      const result = await attachChapterPdf(chapterId, uploaded.path);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "PDF joint.", { variant: "success" });
        setPdfAttached(true);
      }
    } finally {
      setIsUploadingPdf(false);
    }
  }

  function handleCopyPrompt() {
    const prompt = buildExternalImportPrompt(chapterTitle);
    navigator.clipboard
      .writeText(prompt)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast("Impossible de copier automatiquement — sélectionnez et copiez le texte manuellement.", { variant: "error" }));
  }

  // Auto-detects which of the two shapes was pasted: a fresh extraction
  // ("sub_entities") or a gap-fill/"Compléter" pass on a chapter that
  // already has content ("additions_for_existing"/"new_sub_entities") —
  // substring checks rather than a full JSON.parse so this still routes
  // correctly even on a malformed/double-encoded paste that the server's
  // own salvage logic can still recover from.
  function handleImport() {
    if (!json.trim()) return;
    const looksComplementary = !/"sub_entities"/.test(json) && /"additions_for_existing"|"new_sub_entities"/.test(json);
    startTransition(async () => {
      const result = looksComplementary ? await importComplementaryContent(chapterId, json) : await importChapterContent(chapterId, json);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Contenu importé.", { variant: "success" });
        onImported();
      }
    });
  }

  return (
    <Modal
      title="Importer des fiches et flashcards"
      description="Générez le contenu ailleurs (ex. Claude.ai, avec le PDF du chapitre joint à la main) puis collez le résultat ici — utile si le quota Gemini est épuisé. Fonctionne aussi bien pour une première extraction que pour une passe de complément sur un chapitre déjà importé (le type est détecté automatiquement d'après le JSON collé)."
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-3">
        {!hasPdf && (
          <div className="rounded-[var(--radius-md)] border border-border bg-surface-muted/50 p-3">
            {pdfAttached ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-success">
                <FileText className="h-3.5 w-3.5" /> PDF joint à ce chapitre.
              </p>
            ) : (
              <>
                <Button variant="secondary" size="sm" onClick={() => pdfInputRef.current?.click()} disabled={isUploadingPdf}>
                  <FileText className="h-3.5 w-3.5" /> {isUploadingPdf ? "Envoi…" : "Joindre le PDF de ce chapitre"}
                </Button>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => handlePdfChosen(e.target.files?.[0] ?? null)}
                />
                <p className="mt-1.5 text-xs text-foreground-subtle">
                  Ce chapitre (Word/PowerPoint) n&apos;a pas de PDF — si vous avez généré le contenu ci-dessous à partir d&apos;un
                  PDF, le joindre ici permet de vérifier les citations automatiquement et de consulter le PDF dans l&apos;app,
                  comme pour un chapitre importé en PDF.
                </p>
              </>
            )}
          </div>
        )}

        <div>
          <Button variant="secondary" size="sm" onClick={handleCopyPrompt} disabled={isPending}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copié !" : "Copier le prompt"}
          </Button>
          <p className="mt-1.5 text-xs text-foreground-subtle">
            Collez ce texte dans une conversation avec le PDF du chapitre joint à la main, puis récupérez sa réponse (le JSON)
            ci-dessous — collée, ou déposée en fichier si le copier-coller tronque un contenu très long (fréquent sur mobile).
          </p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isPending}>
            <Upload className="h-3.5 w-3.5" /> Charger un fichier .json/.txt
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.txt,text/plain,application/json"
            className="hidden"
            onChange={(e) => handleFileChosen(e.target.files?.[0] ?? null)}
          />
          <span className="text-xs text-foreground-subtle">{json.length.toLocaleString("fr-FR")} caractère{json.length > 1 ? "s" : ""}</span>
        </div>

        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder='{"sub_entities": [...], "estimated_remaining_passes": 0}'
          rows={20}
          disabled={isPending}
          className="min-h-[50vh] w-full resize-y rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 font-mono text-xs placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
        <p className="text-xs text-foreground-subtle">
          Les pages de citation sont revérifiées automatiquement contre le PDF du chapitre, comme pour une extraction normale, et
          chaque élément importé est marqué « à vérifier » avant publication.
        </p>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
        <Button onClick={handleImport} disabled={isPending || !json.trim()}>
          {isPending ? "Import…" : "Importer"}
        </Button>
      </div>
    </Modal>
  );
}
