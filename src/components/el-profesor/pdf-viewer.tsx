"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PdfHighlight = { page: number; quote: string } | null;

interface HighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function PdfViewer({ url, highlight }: { url: string; highlight?: PdfHighlight }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [rects, setRects] = useState<HighlightRect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Adjust the current page when a new highlight target arrives, computed
  // during render (React's recommended pattern for "state depends on a
  // changing prop") rather than via a setState-in-effect side effect.
  const highlightKey = highlight ? `${highlight.page}:${highlight.quote}` : null;
  const [lastHighlightKey, setLastHighlightKey] = useState(highlightKey);
  if (highlightKey !== lastHighlightKey) {
    setLastHighlightKey(highlightKey);
    if (highlight?.page) setPageNum(highlight.page);
  }

  // Loads the document. `url` is stable for the lifetime of this component
  // in practice (the parent only mounts it once a signed URL is ready), so
  // no reset-on-change branch is needed — state updates happen only inside
  // the async continuation, never synchronously in the effect body.
  useEffect(() => {
    let cancelled = false;

    import("pdfjs-dist").then(async (pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      try {
        const doc = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
        pdfRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("Impossible de charger le PDF.");
          setLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Renders the current page + locates/highlights the citation quote, if any.
  useEffect(() => {
    let cancelled = false;

    async function render() {
      const doc = pdfRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas || pageNum < 1 || pageNum > doc.numPages) return;

      const page = await doc.getPage(pageNum);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1.4 });
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
      if (cancelled) return;

      if (highlight && highlight.page === pageNum && highlight.quote) {
        const pdfjsLib = await import("pdfjs-dist");
        const textContent = await page.getTextContent();
        const items = textContent.items.filter((item): item is import("pdfjs-dist/types/src/display/api").TextItem => "str" in item);
        const fullText = items.map((it) => it.str).join(" ");
        const needle = normalize(highlight.quote);
        const haystack = normalize(fullText);
        const matchIndex = needle.length > 0 ? haystack.indexOf(needle.slice(0, Math.min(needle.length, 120))) : -1;

        if (matchIndex === -1) {
          setRects([]);
        } else {
          // Walk items accumulating character offsets (approximating the " "-joined
          // haystack) to find which items overlap the matched range.
          let offset = 0;
          const matchEnd = matchIndex + needle.length;
          const matched: typeof items = [];
          for (const item of items) {
            const start = offset;
            const end = start + item.str.length;
            if (end >= matchIndex && start <= matchEnd) matched.push(item);
            offset = end + 1;
          }
          const next = matched.map((item) => {
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
            const fontHeight = Math.hypot(tx[2], tx[3]);
            return { left: tx[4], top: tx[5] - fontHeight, width: item.width * viewport.scale, height: fontHeight * 1.15 };
          });
          setRects(next);
        }
      } else {
        setRects([]);
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [pageNum, highlight]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <Button variant="ghost" size="icon" onClick={() => setPageNum((p) => Math.max(1, p - 1))} disabled={pageNum <= 1}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-foreground-subtle">
          Page {pageNum} / {numPages || "…"}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setPageNum((p) => Math.min(numPages, p + 1))} disabled={pageNum >= numPages}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div ref={containerRef} className="relative flex-1 overflow-auto bg-surface-muted p-3">
        {loading && (
          <div className="flex h-full items-center justify-center text-foreground-subtle">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="relative mx-auto w-fit">
          <canvas ref={canvasRef} className="rounded-[var(--radius-sm)] shadow-sm" />
          {rects.map((r, i) => (
            <div
              key={i}
              className="pointer-events-none absolute rounded-sm bg-accent/30 ring-2 ring-accent/60"
              style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
            />
          ))}
        </div>
        {!loading && !error && highlight && highlight.page === pageNum && rects.length === 0 && (
          <p className="mt-2 text-center text-xs text-foreground-subtle">
            Passage non surligné automatiquement (page probablement scannée) — vous êtes sur la bonne page.
          </p>
        )}
      </div>
    </div>
  );
}
