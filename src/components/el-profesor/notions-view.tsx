"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Tag, ShieldAlert, Sparkles, Check, X, Merge, Undo2, Copy, FileSearch, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  categorizeChapterNotions,
  detectContradictionsForNotion,
  resolveContradiction,
  dismissContradiction,
  markFicheSuperseded,
  clearFicheSuperseded,
  resolveContradictionAndSupersede,
} from "@/app/apps/el-profesor/actions/notions";
import {
  checkNotionForUpdatesFromText,
  checkNotionForUpdatesFromArticle,
  applyNotionUpdateProposal,
  dismissNotionUpdateProposal,
} from "@/app/apps/el-profesor/actions/notion-updates";
import { useToast } from "@/components/ui/toast";
import type { NotionSummary, Contradiction, CrossBookDuplicateFlashcards, SupersededFicheEntry, NotionUpdateProposal } from "@/lib/el-profesor/types";

function FicheRef({ fiche }: { fiche: { ficheTitle: string; chapterTitle: string; bookTitle: string; chapterId: string } }) {
  return (
    <Link href={`/apps/el-profesor/chapters/${fiche.chapterId}`} className="hover:underline">
      <span className="font-medium text-foreground">{fiche.ficheTitle}</span>{" "}
      <span className="text-foreground-subtle">
        — {fiche.bookTitle} / {fiche.chapterTitle}
      </span>
    </Link>
  );
}

function ContradictionCard({ contradiction, onChanged }: { contradiction: Contradiction; onChanged: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");

  function handleResolve() {
    startTransition(async () => {
      const result = await resolveContradiction(contradiction.id, note);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onChanged();
      }
    });
  }

  function handleDismiss() {
    startTransition(async () => {
      const result = await dismissContradiction(contradiction.id);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onChanged();
      }
    });
  }

  function handleSupersede(supersededFicheId: string, replacementFicheId: string) {
    startTransition(async () => {
      const result = await resolveContradictionAndSupersede(contradiction.id, supersededFicheId, replacementFicheId, note);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onChanged();
      }
    });
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-danger/30 bg-danger-tint/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 text-sm">
          <FicheRef fiche={contradiction.ficheA} />
          <p className="text-xs text-foreground-subtle">contre</p>
          <FicheRef fiche={contradiction.ficheB} />
        </div>
        {contradiction.notionName && <Badge variant="neutral">{contradiction.notionName}</Badge>}
      </div>
      <p className="mt-3 text-sm text-foreground">{contradiction.explanation}</p>

      {contradiction.status === "pending" ? (
        <div className="mt-3 space-y-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note de résolution (optionnel — ex. quelle version est correcte)"
            className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-1.5 text-xs placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleResolve} disabled={isPending}>
              <Check className="h-3.5 w-3.5" /> Résolu
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDismiss} disabled={isPending}>
              <X className="h-3.5 w-3.5" /> Ignorer
            </Button>
            <span className="text-xs text-foreground-subtle">ou, la fiche la plus récente a raison :</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleSupersede(contradiction.ficheA.ficheId, contradiction.ficheB.ficheId)}
              disabled={isPending}
              title="A est obsolète, remplacée par B"
            >
              A → obsolète (remplacée par B)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleSupersede(contradiction.ficheB.ficheId, contradiction.ficheA.ficheId)}
              disabled={isPending}
              title="B est obsolète, remplacée par A"
            >
              B → obsolète (remplacée par A)
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-foreground-subtle">
          {contradiction.status === "resolved" ? "Résolue" : "Ignorée"}
          {contradiction.resolutionNote && ` — ${contradiction.resolutionNote}`}
        </p>
      )}
    </div>
  );
}

function MergeFichesForm({ fiches, onChanged }: { fiches: NotionSummary["fiches"]; onChanged: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [duplicateId, setDuplicateId] = useState(fiches[0]?.ficheId ?? "");
  const [canonicalId, setCanonicalId] = useState(fiches[1]?.ficheId ?? "");

  function handleMerge() {
    if (!duplicateId || !canonicalId || duplicateId === canonicalId) return;
    startTransition(async () => {
      const result = await markFicheSuperseded(duplicateId, canonicalId, "duplicate", "");
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onChanged();
      }
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs">
      <Merge className="h-3.5 w-3.5 shrink-0 text-foreground-subtle" />
      <span className="text-foreground-subtle">Fusionner</span>
      <Select value={duplicateId} onChange={(e) => setDuplicateId(e.target.value)} className="max-w-[220px] text-xs">
        {fiches.map((f) => (
          <option key={f.ficheId} value={f.ficheId}>
            {f.ficheTitle} ({f.bookTitle})
          </option>
        ))}
      </Select>
      <span className="text-foreground-subtle">dans</span>
      <Select value={canonicalId} onChange={(e) => setCanonicalId(e.target.value)} className="max-w-[220px] text-xs">
        {fiches.map((f) => (
          <option key={f.ficheId} value={f.ficheId}>
            {f.ficheTitle} ({f.bookTitle})
          </option>
        ))}
      </Select>
      <Button variant="ghost" size="sm" onClick={handleMerge} disabled={isPending || duplicateId === canonicalId}>
        Fusionner
      </Button>
    </div>
  );
}

function SupersededFicheRow({ entry, onChanged }: { entry: SupersededFicheEntry; onChanged: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleReactivate() {
    startTransition(async () => {
      const result = await clearFicheSuperseded(entry.fiche.ficheId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onChanged();
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border p-2.5 text-sm">
      <div className="space-y-0.5">
        <p>
          <FicheRef fiche={entry.fiche} />
          <Badge variant={entry.reason === "duplicate" ? "neutral" : "accent"} className="ml-2">
            {entry.reason === "duplicate" ? "Fusionnée" : "Obsolète"}
          </Badge>
        </p>
        <p className="text-xs text-foreground-subtle">
          → remplacée par <FicheRef fiche={entry.supersededBy} />
          {entry.note && ` — ${entry.note}`}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={handleReactivate} disabled={isPending}>
        <Undo2 className="h-3.5 w-3.5" /> Réactiver
      </Button>
    </li>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * "Comparer à une source externe" (demande du 2026-08-24) : l'admin colle la
 * réponse d'un outil de littérature médicale (Consensus, OpenEvidence...) ou
 * importe un article, et chaque fiche liée à la notion est comparée à ce
 * texte — les fiches qui semblent devoir être mises à jour ressortent comme
 * propositions en brouillon (voir NotionUpdateProposalCard), jamais
 * appliquées automatiquement.
 */
function NotionUpdateCheckDialog({
  notionId,
  notionName,
  onClose,
  onSubmitted,
}: {
  notionId: string;
  notionName: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [pastedText, setPastedText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmitText() {
    if (!pastedText.trim()) return;
    startTransition(async () => {
      const result = await checkNotionForUpdatesFromText(notionId, pastedText);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onSubmitted();
        onClose();
      }
    });
  }

  function handleSubmitFile() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    startTransition(async () => {
      try {
        const base64 = await fileToBase64(file);
        const result = await checkNotionForUpdatesFromArticle(notionId, base64, file.name);
        if (result.error) toast(result.error, { variant: "error" });
        else {
          toast(result.success ?? "", { variant: "success" });
          onSubmitted();
          onClose();
        }
      } catch {
        toast("Échec de la lecture du fichier.", { variant: "error" });
      }
    });
  }

  return (
    <Modal
      title={`Comparer « ${notionName} » à une source externe`}
      description="Collez la réponse d'un outil de littérature médicale (Consensus, OpenEvidence...) ou importez un article — chaque fiche liée à cette notion sera comparée, et une proposition de mise à jour apparaîtra pour celles qui semblent devoir changer."
      onClose={onClose}
      size="md"
    >
      <div className="space-y-1.5">
        <label htmlFor="notion-update-text" className="text-sm font-medium text-foreground">
          Coller un texte
        </label>
        <textarea
          id="notion-update-text"
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          rows={6}
          placeholder="Réponse collée d'un outil de littérature médicale, ou tout autre texte pertinent…"
          className="w-full resize-none rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
        <Button size="sm" onClick={handleSubmitText} disabled={isPending || !pastedText.trim()}>
          <FileSearch className="h-3.5 w-3.5" /> {isPending ? "…" : "Comparer ce texte"}
        </Button>
      </div>

      <div className="mt-5 space-y-1.5 border-t border-border pt-4">
        <label htmlFor="notion-update-file" className="text-sm font-medium text-foreground">
          Ou importer un article
        </label>
        <input
          id="notion-update-file"
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.pptx,.txt,.md"
          className="block w-full text-sm text-foreground-muted file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm"
        />
        <p className="text-xs text-foreground-subtle">PDF, Word (.docx), PowerPoint (.pptx) ou texte brut — 15 Mo maximum.</p>
        <Button variant="secondary" size="sm" onClick={handleSubmitFile} disabled={isPending}>
          <Upload className="h-3.5 w-3.5" /> {isPending ? "…" : "Comparer ce fichier"}
        </Button>
      </div>

      <div className="mt-5 flex justify-end">
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Fermer
        </Button>
      </div>
    </Modal>
  );
}

function NotionUpdateProposalCard({ proposal, onChanged }: { proposal: NotionUpdateProposal; onChanged: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleApply() {
    startTransition(async () => {
      const result = await applyNotionUpdateProposal(proposal.id);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onChanged();
      }
    });
  }

  function handleDismiss() {
    startTransition(async () => {
      const result = await dismissNotionUpdateProposal(proposal.id);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onChanged();
      }
    });
  }

  const itemCount = proposal.additions.blocks.length + proposal.additions.flashcards.length;

  return (
    <div className="rounded-[var(--radius-md)] border border-accent/30 bg-accent-tint/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FicheRef fiche={proposal.fiche} />
        <div className="flex items-center gap-1.5">
          <Badge variant="neutral">{proposal.notionName}</Badge>
          <Badge variant="accent">{proposal.sourceKind === "article" ? "Article importé" : "Texte collé"}</Badge>
        </div>
      </div>
      <p className="mt-2 text-sm text-foreground">{proposal.explanation}</p>
      <p className="mt-2 text-xs italic text-foreground-subtle">« {proposal.sourceExcerpt.slice(0, 200)}{proposal.sourceExcerpt.length > 200 ? "…" : ""} »</p>
      <p className="mt-2 text-xs text-foreground-subtle">
        {itemCount} élément{itemCount > 1 ? "s" : ""} proposé{itemCount > 1 ? "s" : ""} ({proposal.additions.blocks.length} bloc(s), {proposal.additions.flashcards.length} flashcard(s))
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={handleApply} disabled={isPending}>
          <Check className="h-3.5 w-3.5" /> Appliquer en brouillon
        </Button>
        <Button variant="ghost" size="sm" onClick={handleDismiss} disabled={isPending}>
          <X className="h-3.5 w-3.5" /> Ignorer
        </Button>
      </div>
    </div>
  );
}

export function NotionsView({
  chapters,
  notionSummaries,
  contradictions,
  crossBookDuplicates,
  supersededFiches,
  notionUpdateProposals,
}: {
  chapters: { id: string; title: string; bookTitle: string }[];
  notionSummaries: NotionSummary[];
  contradictions: Contradiction[];
  crossBookDuplicates: CrossBookDuplicateFlashcards[];
  supersededFiches: SupersededFicheEntry[];
  notionUpdateProposals: NotionUpdateProposal[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isCategorizing, startCategorizing] = useTransition();
  const [isDetecting, startDetecting] = useTransition();
  const [selectedChapterId, setSelectedChapterId] = useState(chapters[0]?.id ?? "");
  const [detectingNotionId, setDetectingNotionId] = useState<string | null>(null);
  const [updateCheckNotion, setUpdateCheckNotion] = useState<{ id: string; name: string } | null>(null);

  function handleCategorize() {
    if (!selectedChapterId) return;
    startCategorizing(async () => {
      const result = await categorizeChapterNotions(selectedChapterId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        refresh();
      }
    });
  }

  function handleDetect(notionId: string) {
    setDetectingNotionId(notionId);
    startDetecting(async () => {
      const result = await detectContradictionsForNotion(notionId);
      setDetectingNotionId(null);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        refresh();
      }
    });
  }

  function refresh() {
    router.refresh();
  }

  const pending = contradictions.filter((c) => c.status === "pending");
  const resolved = contradictions.filter((c) => c.status !== "pending");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/apps/el-profesor" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground-subtle hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour à la bibliothèque
      </Link>
      <h1 className="font-serif-display text-2xl font-medium text-foreground">Notions &amp; contradictions</h1>
      <p className="mt-1 text-sm text-foreground-muted">
        Catégorise le contenu par notions transversales, puis compare entre eux les passages qui partagent une notion — utile pour
        repérer des livres qui se contredisent sur un point de fait.
      </p>

      <div className="mt-6 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Tag className="h-4 w-4" /> Catégoriser un chapitre
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select value={selectedChapterId} onChange={(e) => setSelectedChapterId(e.target.value)} className="max-w-xs">
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.bookTitle} — {c.title}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={handleCategorize} disabled={isCategorizing || !selectedChapterId}>
            {isCategorizing ? "Analyse…" : "Catégoriser"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-foreground-subtle">
          Appelle Gemini une fois par fiche publiée du chapitre — à faire chapitre par chapitre plutôt que d&apos;un coup, pour garder
          le coût prévisible.
        </p>
      </div>

      {pending.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <ShieldAlert className="h-4 w-4 text-danger" /> Contradictions à arbitrer ({pending.length})
          </p>
          <div className="space-y-3">
            {pending.map((c) => (
              <ContradictionCard key={c.id} contradiction={c} onChanged={refresh} />
            ))}
          </div>
        </div>
      )}

      {notionUpdateProposals.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <FileSearch className="h-4 w-4 text-accent" /> Mises à jour proposées ({notionUpdateProposals.length})
          </p>
          <div className="space-y-3">
            {notionUpdateProposals.map((p) => (
              <NotionUpdateProposalCard key={p.id} proposal={p} onChanged={refresh} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <p className="mb-2 text-sm font-medium text-foreground">Notions ({notionSummaries.length})</p>
        {notionSummaries.length === 0 ? (
          <p className="text-sm text-foreground-subtle">Aucune notion pour l&apos;instant — catégorisez un premier chapitre ci-dessus.</p>
        ) : (
          <div className="space-y-3">
            {notionSummaries.map(({ notion, fiches }) => {
              const distinctBooks = new Set(fiches.map((f) => f.bookId)).size;
              return (
                <div key={notion.id} className="rounded-[var(--radius-md)] border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">{notion.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">
                        {fiches.length} fiche{fiches.length > 1 ? "s" : ""}
                        {distinctBooks > 1 ? ` · ${distinctBooks} livres` : ""}
                      </Badge>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDetect(notion.id)}
                        disabled={isDetecting || fiches.length < 2}
                        title={fiches.length < 2 ? "Il faut au moins 2 fiches liées" : "Compare chaque paire de fiches liées à cette notion"}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {isDetecting && detectingNotionId === notion.id ? "Analyse…" : "Détecter les contradictions"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setUpdateCheckNotion({ id: notion.id, name: notion.name })}
                        title="Comparer cette notion à un article ou à une réponse d'un outil de littérature médicale"
                      >
                        <FileSearch className="h-3.5 w-3.5" /> Comparer à une source
                      </Button>
                    </div>
                  </div>
                  <ul className="mt-2 space-y-0.5 text-xs text-foreground-subtle">
                    {fiches.map((f) => (
                      <li key={f.ficheId}>
                        <FicheRef fiche={f} />
                      </li>
                    ))}
                  </ul>
                  {fiches.length >= 2 && <MergeFichesForm fiches={fiches} onChanged={refresh} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {crossBookDuplicates.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Copy className="h-4 w-4 text-accent" /> Flashcards quasi-identiques entre deux livres ({crossBookDuplicates.length})
          </p>
          <div className="space-y-3">
            {crossBookDuplicates.map((d, i) => (
              <div key={i} className="rounded-[var(--radius-md)] border border-accent/30 bg-accent-tint/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1 text-sm">
                    <FicheRef fiche={d.ficheA} />
                    <p className="text-xs text-foreground-subtle">et</p>
                    <FicheRef fiche={d.ficheB} />
                  </div>
                  <Badge variant="neutral">{d.notionName}</Badge>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-foreground-subtle">
                  {d.pairs.map((p, j) => (
                    <li key={j} className="rounded-[var(--radius-sm)] bg-surface px-2 py-1.5">
                      <p>« {p.frontA} »</p>
                      <p>« {p.frontB} »</p>
                      <p className="mt-0.5 text-[10px]">{Math.round(p.similarity * 100)}% de similarité</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-foreground-subtle">
                  Éditez directement la fiche pour retirer le doublon, ou fusionnez les deux fiches ci-dessus si tout le contenu se
                  recoupe.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {supersededFiches.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 text-sm font-medium text-foreground">Fiches fusionnées / obsolètes ({supersededFiches.length})</p>
          <ul className="space-y-2">
            {supersededFiches.map((entry) => (
              <SupersededFicheRow key={entry.fiche.ficheId} entry={entry} onChanged={refresh} />
            ))}
          </ul>
        </div>
      )}

      {resolved.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-medium text-foreground-subtle">Historique traité ({resolved.length})</summary>
          <div className="mt-3 space-y-3">
            {resolved.map((c) => (
              <ContradictionCard key={c.id} contradiction={c} onChanged={refresh} />
            ))}
          </div>
        </details>
      )}

      {updateCheckNotion && (
        <NotionUpdateCheckDialog
          notionId={updateCheckNotion.id}
          notionName={updateCheckNotion.name}
          onClose={() => setUpdateCheckNotion(null)}
          onSubmitted={refresh}
        />
      )}
    </div>
  );
}
