"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  useEffect(() => {
    getChapterPdfUrl(chapterId).then((result) => setPdfUrl(result.url ?? null));
  }, [chapterId]);

  const selected = withFiche.find((s) => s.id === selectedId) ?? null;

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
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-7xl flex-col px-4 py-4 sm:px-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/apps/el-profesor">
            <Button variant="ghost" size="icon" aria-label="Retour">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="font-serif-display text-lg font-medium text-foreground">Relecture — {chapterTitle}</h1>
        </div>
        <Button onClick={handleFinalize} disabled={isPending}>
          <CheckCircle2 className="h-4 w-4" /> Publier le chapitre
        </Button>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[220px_1fr_1fr]">
        <div className="overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-surface p-2">
          {withFiche.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => setSelectedId(sub.id)}
              className={`flex w-full items-center justify-between rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm ${
                sub.id === selectedId ? "bg-primary-tint text-primary-strong" : "text-foreground-muted hover:bg-surface-muted"
              }`}
            >
              <span>{sub.name}</span>
              {sub.fiche?.status === "published" ? (
                <Badge variant="success">OK</Badge>
              ) : (
                <Badge variant="neutral">Brouillon</Badge>
              )}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-surface p-4">
          {selected?.fiche ? (
            <div>
              <div className="flex items-center justify-between">
                <h2 className="font-serif-display text-lg font-medium text-foreground">{selected.fiche.title}</h2>
                {selected.fiche.status !== "published" && (
                  <Button size="sm" onClick={() => handlePublishFiche(selected.fiche!.id)} disabled={isPending}>
                    Publier cette fiche
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
    </div>
  );
}
