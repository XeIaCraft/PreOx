"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ClipboardCopy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { applyFicheVerification, exportFicheVerification, previewFicheVerification } from "@/app/apps/el-profesor/actions/fiche-verification";

/**
 * « Vérifier l'actualité » : the fiche goes out as a prompt to paste into
 * any AI with web search, its JSON answer comes back here, is previewed
 * change by change, then applied (changes marked « à vérifier », each with
 * its reference).
 */
export function FicheVerificationModal({ ficheId, onClose, onApplied }: { ficheId: string; onClose: () => void; onApplied: () => void }) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [copied, setCopied] = useState(false);
  const [answer, setAnswer] = useState("");
  const [preview, setPreview] = useState<{ lines: string[]; summary: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    exportFicheVerification(ficheId).then((r) => {
      if (r.error) setError(r.error);
      else {
        setPrompt(r.prompt ?? "");
        setTitle(r.title ?? "fiche");
      }
    });
  }, [ficheId]);

  async function copy() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Copie impossible : téléchargez le fichier à la place.", { variant: "error" });
    }
  }

  function download() {
    if (!prompt) return;
    const url = URL.createObjectURL(new Blob([prompt], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `verification-${title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").slice(0, 60) || "fiche"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function runPreview() {
    setError(null);
    startTransition(async () => {
      const r = await previewFicheVerification(ficheId, answer);
      if (r.error) {
        setPreview(null);
        setError(r.error);
      } else setPreview({ lines: r.lines ?? [], summary: r.summary ?? "" });
    });
  }

  function apply() {
    startTransition(async () => {
      const r = await applyFicheVerification(ficheId, answer);
      if (r.error) {
        setError(r.error);
        return;
      }
      toast(r.success ?? "Appliqué.", { variant: "success" });
      onApplied();
      onClose();
    });
  }

  return (
    <Modal
      title="Vérifier l'actualité de la fiche"
      description="Passez la fiche à une IA avec recherche web (ChatGPT, Claude, Perplexity…), puis collez sa réponse ici : vous verrez chaque changement avant de l'appliquer."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fermer
          </Button>
          {preview ? (
            <Button onClick={apply} disabled={pending || preview.lines.length === 0}>
              <Check className="h-4 w-4" /> Appliquer {preview.lines.length} changement{preview.lines.length > 1 ? "s" : ""}
            </Button>
          ) : (
            <Button onClick={runPreview} disabled={pending || !answer.trim()}>
              {pending ? "Lecture…" : "Voir les changements"}
            </Button>
          )}
        </>
      }
    >
      <ol className="space-y-5 text-sm">
        <li>
          <p className="font-medium text-foreground">1. Exporter la fiche</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={copy} disabled={!prompt}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />} {copied ? "Copié" : "Copier le prompt"}
            </Button>
            <Button variant="ghost" size="sm" onClick={download} disabled={!prompt}>
              <Download className="h-3.5 w-3.5" /> Télécharger (.md)
            </Button>
          </div>
          {prompt && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-foreground-subtle">Voir le prompt</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] bg-surface-muted p-2 text-xs text-foreground-muted">{prompt}</pre>
            </details>
          )}
        </li>
        <li>
          <label htmlFor="verification-answer" className="font-medium text-foreground">
            2. Coller la réponse de l&apos;IA
          </label>
          <textarea
            id="verification-answer"
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value);
              setPreview(null);
            }}
            rows={7}
            placeholder='{ "fiche_version": "…", "blocs": [ … ] }'
            className="mt-2 w-full rounded-[var(--radius-sm)] border border-border bg-surface p-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </li>
        {error && <p className="text-danger">{error}</p>}
        {preview && (
          <li>
            <p className="font-medium text-foreground">3. Changements proposés</p>
            {preview.summary && <p className="mt-1 text-foreground-muted">{preview.summary}</p>}
            {preview.lines.length === 0 ? (
              <p className="mt-2 text-foreground-subtle">Aucun changement : la fiche est jugée à jour.</p>
            ) : (
              <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
                {preview.lines.map((line, i) => (
                  <li key={i} className="rounded-[var(--radius-sm)] border border-border px-2.5 py-1.5 text-xs text-foreground-muted">
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </li>
        )}
      </ol>
    </Modal>
  );
}
