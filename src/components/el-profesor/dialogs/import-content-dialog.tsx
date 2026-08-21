"use client";

import { useState, useTransition } from "react";
import { Copy, Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { importChapterContent } from "@/app/apps/el-profesor/actions/extraction";
import { buildExternalImportPrompt } from "@/lib/el-profesor/prompts";
import { useToast } from "@/components/ui/toast";

export function ImportContentDialog({
  chapterId,
  chapterTitle,
  onClose,
  onImported,
}: {
  chapterId: string;
  chapterTitle: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [json, setJson] = useState("");
  const [copied, setCopied] = useState(false);

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

  function handleImport() {
    if (!json.trim()) return;
    startTransition(async () => {
      const result = await importChapterContent(chapterId, json);
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
      description="Générez le contenu ailleurs (ex. Claude.ai, avec le PDF du chapitre joint à la main) puis collez le résultat ici — utile si le quota Gemini est épuisé."
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-3">
        <div>
          <Button variant="secondary" size="sm" onClick={handleCopyPrompt} disabled={isPending}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copié !" : "Copier le prompt"}
          </Button>
          <p className="mt-1.5 text-xs text-foreground-subtle">
            Collez ce texte dans une conversation avec le PDF du chapitre joint à la main, puis collez sa réponse (le JSON) ci-dessous.
          </p>
        </div>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder='{"sub_entities": [...], "estimated_remaining_passes": 0}'
          rows={10}
          disabled={isPending}
          className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 font-mono text-xs placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
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
