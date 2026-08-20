"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FicheViewer } from "@/components/el-profesor/fiche-viewer";
import { PdfViewer, type PdfHighlight } from "@/components/el-profesor/pdf-viewer";
import { getChapterPdfUrl } from "@/app/apps/el-profesor/actions/pdf";
import type { SubEntityWithFiche } from "@/lib/el-profesor/dal";
import type { Citation } from "@/lib/el-profesor/types";

export function ChapterView({
  chapterId,
  chapterTitle,
  subEntities,
}: {
  chapterId: string;
  chapterTitle: string;
  subEntities: SubEntityWithFiche[];
}) {
  const withFiche = subEntities.filter((s) => s.fiche);
  const [selectedId, setSelectedId] = useState(withFiche[0]?.id ?? null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<PdfHighlight>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  useEffect(() => {
    getChapterPdfUrl(chapterId).then((result) => setPdfUrl(result.url ?? null));
  }, [chapterId]);

  const selected = withFiche.find((s) => s.id === selectedId) ?? null;

  function handleCitationClick(citation: Citation) {
    setHighlight({ page: citation.page, quote: citation.quote });
    // On phones there's no room for a persistent PDF panel — jump straight
    // into the source instead of leaving the user to find a "voir le PDF" button.
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
          <h1 className="font-serif-display text-lg font-medium text-foreground">{chapterTitle}</h1>
        </div>
        <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setPdfModalOpen(true)}>
          <FileText className="h-3.5 w-3.5" /> PDF
        </Button>
      </div>

      <div className="min-h-0 flex-1 gap-4 lg:grid lg:grid-cols-[220px_1fr_1fr] lg:overflow-hidden">
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:mb-0 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:rounded-[var(--radius-lg)] lg:border lg:border-border lg:bg-surface lg:p-2 lg:px-2 lg:pb-2">
          {withFiche.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => setSelectedId(sub.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-sm transition-colors lg:block lg:w-full lg:shrink lg:whitespace-normal lg:rounded-[var(--radius-sm)] lg:px-3 lg:py-2 lg:text-left ${
                sub.id === selectedId
                  ? "bg-primary-tint text-primary-strong"
                  : "bg-surface-muted text-foreground-muted lg:bg-transparent lg:hover:bg-surface-muted"
              }`}
            >
              {sub.name}
            </button>
          ))}
        </div>

        <div className="lg:overflow-y-auto lg:rounded-[var(--radius-lg)] lg:border lg:border-border lg:bg-surface lg:p-5">
          {selected?.fiche ? (
            <FicheViewer title={selected.fiche.title} blocks={selected.fiche.blocks} onCitationClick={handleCitationClick} />
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
