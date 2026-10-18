"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ClipboardCopy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { applyVerification, exportVerification, previewVerification, type VerificationScope } from "@/app/apps/el-profesor/actions/fiche-verification";

/** Above this, one conversation struggles to hold the fiches plus its literature searches. */
const LONG_PROMPT_CHARS = 60_000;

/**
 * « Vérifier l'actualité » of a fiche or a whole chapter: it goes out as a
 * prompt to paste into a conversation with an AI that can search the
 * literature (Claude with PubMed and Consensus), its JSON answer comes back
 * here, is previewed change by change, then applied — changes marked « à
 * vérifier », with their references (PubMed / DOI links).
 */
export function FicheVerificationModal({ scope, onClose, onApplied }: { scope: VerificationScope; onClose: () => void; onApplied: () => void }) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [copied, setCopied] = useState(false);
  const [answer, setAnswer] = useState("");
  const [preview, setPreview] = useState<{ lines: string[]; summary: string; warnings: string[] } | null>(null);
  const [ficheCount, setFicheCount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const scopeKey = JSON.stringify(scope);
  useEffect(() => {
    exportVerification(JSON.parse(scopeKey) as VerificationScope).then((r) => {
      if (r.error) setError(r.error);
      else {
        setPrompt(r.prompt ?? "");
        setTitle(r.title ?? "fiche");
        setFicheCount(r.ficheCount ?? 1);
      }
    });
  }, [scopeKey]);

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
      const r = await previewVerification(scope, answer);
      if (r.error) {
        setPreview(null);
        setError(r.error);
      } else setPreview({ lines: r.lines ?? [], summary: r.summary ?? "", warnings: r.warnings ?? [] });
    });
  }

  function apply() {
    startTransition(async () => {
      const r = await applyVerification(scope, answer);
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
      title={scope.kind === "chapter" ? "Vérifier l'actualité du chapitre" : "Vérifier l'actualité de la fiche"}
      description="Actualité, études et auteurs clés, historique des pratiques : collez le prompt dans une conversation Claude où PubMed et Consensus sont connectés (ou toute IA avec recherche web), puis collez sa réponse ici. Vous verrez chaque changement avant de l'appliquer."
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
          <p className="font-medium text-foreground">1. Exporter {scope.kind === "chapter" ? `le chapitre (${ficheCount} fiche${ficheCount > 1 ? "s" : ""})` : "la fiche"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={copy} disabled={!prompt}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />} {copied ? "Copié" : "Copier le prompt"}
            </Button>
            <Button variant="ghost" size="sm" onClick={download} disabled={!prompt}>
              <Download className="h-3.5 w-3.5" /> Télécharger (.md)
            </Button>
          </div>
          {prompt && prompt.length > LONG_PROMPT_CHARS && (
            <p className="mt-2 text-xs text-foreground-subtle">
              Prompt long (≈ {Math.round(prompt.length / 1000)} k caractères) : avec les recherches PubMed et Consensus, la conversation risque de saturer — vérifiez plutôt fiche par fiche.
            </p>
          )}
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
            {preview.warnings.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-accent">
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
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
