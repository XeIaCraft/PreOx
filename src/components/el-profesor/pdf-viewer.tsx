"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPdfZoom, setPdfZoom } from "@/lib/el-profesor/local-prefs";

export type PdfHighlight = { page: number; quote: string } | null;
export type CoverageKind = "block" | "flashcard";
export type CoverageEntry = { page: number; quote: string; kind: CoverageKind };
export type PdfSelection = { page: number; quote: string };

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface TextSpan extends Rect {
  text: string;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Citation quotes come from Gemini reading the PDF, not from copy-pasting
// its text layer, so they can diverge slightly (hyphenation, dashes/quotes,
// a paraphrased tail). Try an exact match on a long prefix first, then fall
// back to shorter prefixes so a passage still highlights when only the
// start of the quote lines up with the extracted text.
const MATCH_PREFIX_LENGTHS = [120, 60, 30];

/** Finds the text items overlapping a (possibly partial) verbatim quote within a page's text content. */
function matchItems<T extends { str: string }>(items: T[], quote: string): T[] {
  const needle = normalize(quote);
  if (!needle) return [];

  const normalizedItems = items.map((item) => normalize(item.str));
  const haystack = normalizedItems.join(" ");

  let matchIndex = -1;
  for (const len of MATCH_PREFIX_LENGTHS) {
    const prefixLen = Math.min(needle.length, len);
    if (prefixLen < 8) break;
    matchIndex = haystack.indexOf(needle.slice(0, prefixLen));
    if (matchIndex !== -1) break;
  }
  if (matchIndex === -1) return [];

  let offset = 0;
  const matchEnd = matchIndex + needle.length;
  const matched: T[] = [];
  for (let i = 0; i < items.length; i++) {
    const start = offset;
    const end = start + normalizedItems[i].length;
    if (end >= matchIndex && start <= matchEnd) matched.push(items[i]);
    offset = end + 1;
  }
  return matched;
}

export function PdfViewer({
  url,
  highlight,
  coverage,
  onSelection,
}: {
  url: string;
  highlight?: PdfHighlight;
  coverage?: CoverageEntry[];
  onSelection?: (selection: PdfSelection) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  // Restores the last zoom level the user picked (any chapter/PDF). Lazy
  // initializer, same one-time-impure-read pattern used elsewhere in this
  // codebase (e.g. `useState(() => Date.now())`).
  const [zoom, setZoom] = useState(() => {
    const saved = getPdfZoom();
    return saved && saved >= MIN_ZOOM && saved <= MAX_ZOOM ? saved : 1;
  });
  const [containerWidth, setContainerWidth] = useState(0);
  const [rects, setRects] = useState<Rect[]>([]);
  const [coverageRects, setCoverageRects] = useState<{ rect: Rect; kind: CoverageKind }[]>([]);
  const [textSpans, setTextSpans] = useState<TextSpan[]>([]);
  const [showCoverage, setShowCoverage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);

  // Adjust the current page when a new highlight target arrives, computed
  // during render (React's recommended pattern for "state depends on a
  // changing prop") rather than via a setState-in-effect side effect.
  const highlightKey = highlight ? `${highlight.page}:${highlight.quote}` : null;
  const [lastHighlightKey, setLastHighlightKey] = useState(highlightKey);
  if (highlightKey !== lastHighlightKey) {
    setLastHighlightKey(highlightKey);
    if (highlight?.page) {
      setPageNum(highlight.page);
      setPageInput(String(highlight.page));
    }
  }

  useEffect(() => {
    setPdfZoom(zoom);
  }, [zoom]);

  // Tracks the scroll container's width so pages fit it (mobile/tablet/desktop alike).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth((prev) => (Math.abs(prev - width) > 4 ? width : prev));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

  // Renders the current page (fit to container width × zoom), its selectable
  // text layer, the active citation highlight, and — when enabled — the
  // coverage overlay for every citation already extracted on this page.
  useEffect(() => {
    let cancelled = false;

    async function render() {
      const doc = pdfRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas || pageNum < 1 || pageNum > doc.numPages || containerWidth === 0) return;

      const pdfjsLib = await import("pdfjs-dist");
      const page = await doc.getPage(pageNum);
      if (cancelled) return;

      const naturalWidth = page.getViewport({ scale: 1 }).width;
      const fitScale = containerWidth / naturalWidth;
      const viewport = page.getViewport({ scale: fitScale * zoom });

      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
      if (cancelled) return;

      const textContent = await page.getTextContent();
      const items = textContent.items.filter((item): item is import("pdfjs-dist/types/src/display/api").TextItem => "str" in item);

      setTextSpans(
        items
          .filter((item) => item.str.trim().length > 0)
          .map((item) => {
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
            const fontHeight = Math.hypot(tx[2], tx[3]);
            return { text: item.str, left: tx[4], top: tx[5] - fontHeight, width: item.width * viewport.scale, height: fontHeight * 1.15 };
          })
      );

      function rectsForQuote(quote: string): Rect[] {
        return matchItems(items, quote).map((item) => {
          const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
          const fontHeight = Math.hypot(tx[2], tx[3]);
          return { left: tx[4], top: tx[5] - fontHeight, width: item.width * viewport.scale, height: fontHeight * 1.15 };
        });
      }

      setRects(highlight && highlight.page === pageNum && highlight.quote ? rectsForQuote(highlight.quote) : []);

      if (showCoverage && coverage) {
        const onPage = coverage.filter((c) => c.page === pageNum);
        setCoverageRects(onPage.flatMap((c) => rectsForQuote(c.quote).map((rect) => ({ rect, kind: c.kind }))));
      } else {
        setCoverageRects([]);
      }
    }

    render();
    return () => {
      cancelled = true;
    };
    // `numPages` is included purely as a trigger: the doc-loading effect
    // above sets pdfRef.current + numPages together, but pdfRef is a plain
    // ref (not reactive) so without numPages in this list the very first
    // page never rendered once the doc finished loading after this effect's
    // first (early-return) pass — the canvas stayed blank until some other
    // dependency happened to change (switching page, toggling coverage…).
  }, [pageNum, highlight, containerWidth, zoom, showCoverage, coverage, numPages]);

  function goToPage(n: number) {
    const clamped = Math.max(1, Math.min(numPages || 1, n));
    setPageNum(clamped);
    setPageInput(String(clamped));
  }

  // Captures the user's own text selection within this page's text layer,
  // so it can be turned into a new fiche block / flashcard proposal.
  useEffect(() => {
    if (!onSelection) return;
    function handleSelectionChange() {
      const selection = document.getSelection();
      const text = selection?.toString().trim() ?? "";
      if (!text || !textLayerRef.current || !selection || selection.rangeCount === 0) {
        setPendingSelection(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!textLayerRef.current.contains(range.commonAncestorContainer)) {
        setPendingSelection(null);
        return;
      }
      setPendingSelection(text);
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [onSelection]);

  function handleUseSelection() {
    if (!pendingSelection) return;
    onSelection?.({ page: pageNum, quote: pendingSelection });
    document.getSelection()?.removeAllRanges();
    setPendingSelection(null);
  }

  function handleClearSelection() {
    document.getSelection()?.removeAllRanges();
    setPendingSelection(null);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => goToPage(pageNum - 1)} disabled={pageNum <= 1} aria-label="Page précédente">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <input
            type="text"
            inputMode="numeric"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={() => goToPage(Number(pageInput) || pageNum)}
            onKeyDown={(e) => {
              if (e.key === "Enter") goToPage(Number(pageInput) || pageNum);
            }}
            className="h-7 w-10 rounded-[var(--radius-sm)] border border-border bg-surface text-center text-xs text-foreground"
            aria-label="Aller à la page"
          />
          <span className="text-xs text-foreground-subtle">/ {numPages || "…"}</span>
          <Button variant="ghost" size="icon" onClick={() => goToPage(pageNum + 1)} disabled={pageNum >= numPages} aria-label="Page suivante">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          {coverage && coverage.length > 0 && (
            <button
              type="button"
              onClick={() => setShowCoverage((v) => !v)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                showCoverage ? "bg-primary-tint text-primary-strong" : "text-foreground-subtle hover:bg-surface-muted"
              }`}
              title="Surligner ce qui est déjà couvert par les fiches/flashcards"
            >
              <Layers className="h-3.5 w-3.5" /> Couverture
            </button>
          )}
          <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.15))} aria-label="Réduire">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="w-9 text-center text-xs text-foreground-subtle">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.15))} aria-label="Agrandir">
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showCoverage && coverage && coverage.length > 0 && (
        <div className="flex items-center gap-3 border-b border-border bg-surface-muted px-3 py-1.5 text-[11px] text-foreground-subtle">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-success/50 ring-1 ring-success" /> Fiches
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary/40 ring-1 ring-primary" /> Flashcards
          </span>
        </div>
      )}

      <div ref={scrollRef} className="relative flex-1 overflow-auto bg-surface-muted p-3">
        {loading && (
          <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3">
            <div className="aspect-[3/4] w-full animate-pulse rounded-[var(--radius-sm)] bg-surface" />
            <span className="flex items-center gap-1.5 text-xs text-foreground-subtle">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement du PDF…
            </span>
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="relative mx-auto w-fit">
          <canvas ref={canvasRef} className="rounded-[var(--radius-sm)] shadow-sm" />
          <div ref={textLayerRef} className="absolute inset-0" style={{ lineHeight: 1 }}>
            {onSelection &&
              textSpans.map((s, i) => (
                <span
                  key={i}
                  style={{
                    position: "absolute",
                    left: s.left,
                    top: s.top,
                    fontSize: s.height,
                    color: "transparent",
                    whiteSpace: "pre",
                    cursor: "text",
                  }}
                >
                  {s.text}
                </span>
              ))}
          </div>
          {coverageRects.map((c, i) => (
            <div
              key={i}
              className={`pointer-events-none absolute rounded-sm ${c.kind === "block" ? "bg-success/30 ring-1 ring-success/60" : "bg-primary/25 ring-1 ring-primary/60"}`}
              style={{ left: c.rect.left, top: c.rect.top, width: c.rect.width, height: c.rect.height }}
            />
          ))}
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

      {onSelection && pendingSelection && (
        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface px-3 py-2">
          <p className="line-clamp-1 text-xs text-foreground-muted">« {pendingSelection} »</p>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={handleClearSelection}>
              Annuler
            </Button>
            <Button size="sm" onClick={handleUseSelection}>
              Utiliser cette sélection
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
