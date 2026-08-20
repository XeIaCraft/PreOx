"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { PdfViewer, type PdfHighlight } from "@/components/el-profesor/pdf-viewer";
import { BlockEditor } from "@/components/el-profesor/block-editor";
import { FlashcardEditor } from "@/components/el-profesor/flashcard-editor";
import { getChapterPdfUrl } from "@/app/apps/el-profesor/actions/pdf";
import { publishFiche, finalizeChapterPublication } from "@/app/apps/el-profesor/actions/extraction";
import { useToast } from "@/components/ui/toast";
import type { SubEntityWithFiche } from "@/lib/el-profesor/dal";
import type { Citation } from "@/lib/el-profesor/types";

export function ExtractionReviewView({
  chapterId,
  chapterTitle,
  subEntities,
}: {
  chapterId: string;
  chapterTitle: string;
  subEntities: SubEntityWithFiche[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const withFiche = subEntities.filter((s) => s.fiche);
  const [selectedId, setSelectedId] = useState(withFiche[0]?.id ?? null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<PdfHighlight>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  useEffect(() => {
    getChapterPdfUrl(chapterId).then((result) => setPdfUrl(result.url ?? null));
  }, [chapterId]);

  const selected = withFiche.find((s) => s.id === selectedId) ?? null;
  const selectedHasDraftContent =
    !!selected?.fiche &&
    (selected.fiche.status !== "published" ||
      selected.fiche.blocks.some((b) => b.status !== "published") ||
      selected.fiche.flashcards.some((c) => c.status !== "published"));

  function refresh() {
    startTransition(() => router.refresh());
  }

  function handlePublishFiche(ficheId: string) {
    startTransition(async () => {
      const result = await publishFiche(ficheId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast("Fiche publiée.", { variant: "success" });
        refresh();
      }
    });
  }

  function handleFinalize() {
    if (!confirm("Publier tout ce qui reste en brouillon dans ce chapitre ?")) return;
    startTransition(async () => {
      const result = await finalizeChapterPublication(chapterId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast("Chapitre publié.", { variant: "success" });
        router.push("/apps/el-profesor");
      }
    });
  }

  function handleCitationClick(citation: Citation) {
    setHighlight({ page: citation.page, quote: citation.quote });
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setPdfModalOpen(true);
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col px-4 py-4 sm:px-6 lg:h-[calc(100vh-4rem)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/apps/el-profesor">
            <Button variant="ghost" size="icon" aria-label="Retour">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="font-serif-display text-base font-medium text-foreground sm:text-lg">Relecture — {chapterTitle}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setPdfModalOpen(true)}>
            <FileText className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={handleFinalize} disabled={isPending}>
            <CheckCircle2 className="h-4 w-4" /> <span className="hidden sm:inline">Publier le chapitre</span>
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 gap-4 lg:grid lg:grid-cols-[220px_1fr_1fr] lg:overflow-hidden">
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:mb-0 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:rounded-[var(--radius-lg)] lg:border lg:border-border lg:bg-surface lg:p-2 lg:px-2 lg:pb-2">
          {withFiche.map((sub) => {
            const hasDraft =
              sub.fiche!.status !== "published" ||
              sub.fiche!.blocks.some((b) => b.status !== "published") ||
              sub.fiche!.flashcards.some((c) => c.status !== "published");
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => setSelectedId(sub.id)}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-sm transition-colors lg:w-full lg:shrink lg:justify-between lg:whitespace-normal lg:rounded-[var(--radius-sm)] lg:px-3 lg:py-2 lg:text-left ${
                  sub.id === selectedId
                    ? "bg-primary-tint text-primary-strong"
                    : "bg-surface-muted text-foreground-muted lg:bg-transparent lg:hover:bg-surface-muted"
                }`}
              >
                <span>{sub.name}</span>
                {hasDraft ? <Badge variant="accent">Brouillon</Badge> : <Badge variant="success">OK</Badge>}
              </button>
            );
          })}
        </div>

        <div className="lg:overflow-y-auto lg:rounded-[var(--radius-lg)] lg:border lg:border-border lg:bg-surface lg:p-4">
          {selected?.fiche ? (
            <div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-serif-display text-lg font-medium text-foreground">{selected.fiche.title}</h2>
                {selectedHasDraftContent && (
                  <Button size="sm" onClick={() => handlePublishFiche(selected.fiche!.id)} disabled={isPending}>
                    {selected.fiche.status === "published" ? "Publier les compléments" : "Publier cette fiche"}
                  </Button>
                )}
              </div>

              <div className="mt-3 space-y-3">
                {selected.fiche.blocks.map((block) => (
                  <BlockEditor key={block.id} block={block} onChanged={refresh} onCitationClick={handleCitationClick} />
                ))}
              </div>

              <h3 className="mt-5 text-sm font-medium text-foreground">Flashcards</h3>
              <div className="mt-2 space-y-3">
                {selected.fiche.flashcards.map((card) => (
                  <FlashcardEditor key={card.id} flashcard={card} onChanged={refresh} onCitationClick={handleCitationClick} />
                ))}
                {selected.fiche.flashcards.length === 0 && (
                  <p className="text-sm text-foreground-subtle">Aucune flashcard générée pour cette fiche.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-foreground-subtle">Sélectionnez une entrée.</p>
          )}
        </div>

        <div className="hidden overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface lg:block">
          {pdfUrl ? <PdfViewer url={pdfUrl} highlight={highlight} /> : <p className="p-4 text-sm text-foreground-subtle">Chargement du PDF…</p>}
        </div>
      </div>

      {pdfModalOpen && (
        <Modal title="Document source" onClose={() => setPdfModalOpen(false)} size="xl">
          <div className="-m-4 h-[75vh]">
            {pdfUrl ? <PdfViewer url={pdfUrl} highlight={highlight} /> : <p className="p-4 text-sm text-foreground-subtle">Chargement du PDF…</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
