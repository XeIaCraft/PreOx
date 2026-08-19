"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  useEffect(() => {
    getChapterPdfUrl(chapterId).then((result) => setPdfUrl(result.url ?? null));
  }, [chapterId]);

  const selected = withFiche.find((s) => s.id === selectedId) ?? null;

  function handleCitationClick(citation: Citation) {
    setHighlight({ page: citation.page, quote: citation.quote });
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-7xl flex-col px-4 py-4 sm:px-6">
      <div className="mb-3 flex items-center gap-3">
        <Link href="/apps/el-profesor">
          <Button variant="ghost" size="icon" aria-label="Retour">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="font-serif-display text-lg font-medium text-foreground">{chapterTitle}</h1>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[220px_1fr_1fr]">
        <div className="overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-surface p-2">
          {withFiche.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => setSelectedId(sub.id)}
              className={`block w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm ${
                sub.id === selectedId ? "bg-primary-tint text-primary-strong" : "text-foreground-muted hover:bg-surface-muted"
              }`}
            >
              {sub.name}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-surface p-5">
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
    </div>
  );
}
