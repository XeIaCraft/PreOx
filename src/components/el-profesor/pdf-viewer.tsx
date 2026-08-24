"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut, Layers, Maximize, Minimize, Highlighter, Crop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPdfZoom, setPdfZoom } from "@/lib/el-profesor/local-prefs";

export type PdfHighlight = { page: number; quote: string } | null;
export type CoverageKind = "block" | "flashcard";
/** `id` is the source block/flashcard id — lets a click on the coverage overlay report back exactly which one covers that passage (see onCoverageClick). */
export type CoverageEntry = { page: number; quote: string; kind: CoverageKind; id: string };
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
  onCapture,
  captureRequest,
  onCoverageClick,
}: {
  url: string;
  highlight?: PdfHighlight;
  coverage?: CoverageEntry[];
  onSelection?: (selection: PdfSelection) => void;
  /** Item 23 of the backlog: lets an admin drag-select a rectangle on the currently rendered page and get it back as a PNG data URL, cropped straight from the canvas pdfjs already rendered — no server-side PDF rendering needed. */
  onCapture?: (dataUrl: string) => void;
  /** Remotely jumps to `page` and arms capture mode — bump `token` to re-trigger even for the same page. Follow-up to item 23: jumping straight to a Gemini-suggested image location. */
  captureRequest?: { page: number; token: number } | null;
  /** Clicking a coverage rectangle reports back which block/flashcard covers that passage — lets the parent show/scroll to it. */
  onCoverageClick?: (entry: CoverageEntry) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
  const [coverageRects, setCoverageRects] = useState<{ rect: Rect; entry: CoverageEntry }[]>([]);
  const [textSpans, setTextSpans] = useState<TextSpan[]>([]);
  const [showCoverage, setShowCoverage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  // Fallback selection path for mobile browsers where long-press-and-drag
  // native text selection over the (transparent, canvas-overlaid) text
  // layer is unreliable: tap one word to anchor, tap another to extend.
  const [tapMode, setTapMode] = useState(false);
  const [tapRange, setTapRange] = useState<{ start: number; end: number } | null>(null);
  // Image-capture mode (item 23) — a drag-selected rectangle over the
  // canvas, cropped to a PNG once released. Kept entirely separate from
  // the text-selection state above: the two interactions are mutually
  // exclusive (this one has its own toolbar toggle).
  const [captureMode, setCaptureMode] = useState(false);
  const [captureStart, setCaptureStart] = useState<{ x: number; y: number } | null>(null);
  const [captureRect, setCaptureRect] = useState<Rect | null>(null);

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

  // Remote "go capture this suggested image" request (item 23 follow-up) —
  // jumps to the hinted page and arms capture mode without the admin
  // touching the toolbar toggle. Same derived-during-render pattern as
  // highlightKey above: `token` changing is the signal, not its value.
  const [lastCaptureRequestToken, setLastCaptureRequestToken] = useState(captureRequest?.token ?? null);
  if ((captureRequest?.token ?? null) !== lastCaptureRequestToken) {
    setLastCaptureRequestToken(captureRequest?.token ?? null);
    if (captureRequest) {
      setPageNum(captureRequest.page);
      setPageInput(String(captureRequest.page));
      setCaptureMode(true);
      setCaptureStart(null);
      setCaptureRect(null);
    }
  }

  useEffect(() => {
    setPdfZoom(zoom);
  }, [zoom]);

  // Mirrors the actual fullscreen state (also changes if the user exits
  // via Esc or the browser's own UI, not just our button).
  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen();
    }
  }

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
        setCoverageRects(onPage.flatMap((c) => rectsForQuote(c.quote).map((rect) => ({ rect, entry: c }))));
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
      if (tapMode) return; // tap-to-select mode derives its own selection instead
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
  }, [onSelection, tapMode]);

  // A tap range refers to indices into this page's textSpans — stale once
  // the page changes, so drop it (same "derive during render" pattern as
  // highlightKey above, to avoid a setState-in-effect cascade).
  const [lastPageNumForTap, setLastPageNumForTap] = useState(pageNum);
  if (pageNum !== lastPageNumForTap) {
    setLastPageNumForTap(pageNum);
    if (tapRange) setTapRange(null);
  }

  function toggleTapMode() {
    setTapMode((v) => !v);
    document.getSelection()?.removeAllRanges();
    setTapRange(null);
    setPendingSelection(null);
  }

  function handleSpanTap(i: number) {
    setTapRange((prev) => (prev ? { start: prev.start, end: i } : { start: i, end: i }));
  }

  // The tapped word range (mobile fallback) derives its text directly at
  // render time rather than being mirrored into pendingSelection via an
  // effect; native browser selection still drives pendingSelection itself.
  const tapSelectionText =
    tapMode && tapRange
      ? textSpans
          .slice(Math.min(tapRange.start, tapRange.end), Math.max(tapRange.start, tapRange.end) + 1)
          .map((s) => s.text)
          .join(" ")
          .trim() || null
      : null;
  const activeSelection = tapMode ? tapSelectionText : pendingSelection;

  function handleUseSelection() {
    if (!activeSelection) return;
    onSelection?.({ page: pageNum, quote: activeSelection });
    document.getSelection()?.removeAllRanges();
    setPendingSelection(null);
    setTapRange(null);
  }

  function handleClearSelection() {
    document.getSelection()?.removeAllRanges();
    setPendingSelection(null);
    setTapRange(null);
  }

  const tapRects: Rect[] = tapMode && tapRange
    ? textSpans
        .slice(Math.min(tapRange.start, tapRange.end), Math.max(tapRange.start, tapRange.end) + 1)
        .map((s) => ({ left: s.left, top: s.top, width: s.width, height: s.height }))
    : [];

  function toggleCaptureMode() {
    setCaptureMode((v) => !v);
    setCaptureStart(null);
    setCaptureRect(null);
  }

  function capturePoint(e: React.PointerEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const box = canvas.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }

  function handleCapturePointerDown(e: React.PointerEvent) {
    if (!captureMode) return;
    const point = capturePoint(e);
    if (!point) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setCaptureStart(point);
    setCaptureRect({ left: point.x, top: point.y, width: 0, height: 0 });
  }

  function handleCapturePointerMove(e: React.PointerEvent) {
    if (!captureMode || !captureStart) return;
    const point = capturePoint(e);
    if (!point) return;
    setCaptureRect({
      left: Math.min(captureStart.x, point.x),
      top: Math.min(captureStart.y, point.y),
      width: Math.abs(point.x - captureStart.x),
      height: Math.abs(point.y - captureStart.y),
    });
  }

  function handleCapturePointerUp() {
    setCaptureStart(null);
  }

  function handleUseCaptureRect() {
    const canvas = canvasRef.current;
    if (!canvas || !captureRect || captureRect.width < 4 || captureRect.height < 4) return;
    const offscreen = document.createElement("canvas");
    offscreen.width = captureRect.width;
    offscreen.height = captureRect.height;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(canvas, captureRect.left, captureRect.top, captureRect.width, captureRect.height, 0, 0, captureRect.width, captureRect.height);
    onCapture?.(offscreen.toDataURL("image/png"));
    setCaptureRect(null);
    setCaptureMode(false);
  }

  return (
    <div ref={containerRef} className="flex h-full flex-col bg-surface">
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
          {onSelection && (
            <button
              type="button"
              onClick={toggleTapMode}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                tapMode ? "bg-primary-tint text-primary-strong" : "text-foreground-subtle hover:bg-surface-muted"
              }`}
              title="Sélectionner en touchant les mots — utile si la sélection tactile classique ne fonctionne pas"
            >
              <Highlighter className="h-3.5 w-3.5" /> Sélection tactile
            </button>
          )}
          {onCapture && (
            <button
              type="button"
              onClick={toggleCaptureMode}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                captureMode ? "bg-primary-tint text-primary-strong" : "text-foreground-subtle hover:bg-surface-muted"
              }`}
              title="Capturer une zone de la page en image, pour l'associer à une flashcard"
            >
              <Crop className="h-3.5 w-3.5" /> Capturer une image
            </button>
          )}
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
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
            title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
            className="hidden sm:inline-flex"
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {tapMode && (
        <div className="border-b border-border bg-surface-muted px-3 py-1.5 text-[11px] text-foreground-subtle">
          {tapRange
            ? "Touchez un autre mot pour étendre la sélection, puis « Utiliser cette sélection » ci-dessous."
            : "Touchez un mot pour commencer la sélection, puis un second mot pour la terminer."}
        </div>
      )}

      {captureMode && (
        <div className="border-b border-border bg-surface-muted px-3 py-1.5 text-[11px] text-foreground-subtle">
          Faites glisser un rectangle sur la zone à capturer.
        </div>
      )}

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

      <div
        ref={scrollRef}
        className="relative flex-1 overflow-auto bg-surface-muted p-3"
        style={onSelection ? { touchAction: "pan-y" } : undefined}
      >
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
          <div
            ref={textLayerRef}
            className="absolute inset-0"
            style={{
              lineHeight: 1,
              WebkitUserSelect: onSelection ? "text" : "none",
              userSelect: onSelection ? "text" : "none",
              WebkitTouchCallout: onSelection ? "default" : "none",
            }}
          >
            {onSelection &&
              textSpans.map((s, i) => (
                <span
                  key={i}
                  onClick={tapMode ? () => handleSpanTap(i) : undefined}
                  style={{
                    position: "absolute",
                    left: s.left,
                    top: s.top,
                    width: s.width,
                    height: s.height,
                    fontSize: s.height,
                    color: "transparent",
                    whiteSpace: "pre",
                    cursor: tapMode ? "pointer" : "text",
                    WebkitUserSelect: tapMode ? "none" : "text",
                    userSelect: tapMode ? "none" : "text",
                  }}
                >
                  {s.text}
                </span>
              ))}
          </div>
          {coverageRects.map((c, i) =>
            onCoverageClick ? (
              <button
                key={i}
                type="button"
                onClick={() => onCoverageClick(c.entry)}
                className={`absolute cursor-pointer rounded-sm transition-colors hover:brightness-90 ${
                  c.entry.kind === "block" ? "bg-success/30 ring-1 ring-success/60" : "bg-primary/25 ring-1 ring-primary/60"
                }`}
                style={{ left: c.rect.left, top: c.rect.top, width: c.rect.width, height: c.rect.height }}
                title={c.entry.kind === "block" ? "Voir la fiche correspondante" : "Voir la flashcard correspondante"}
              />
            ) : (
              <div
                key={i}
                className={`pointer-events-none absolute rounded-sm ${c.entry.kind === "block" ? "bg-success/30 ring-1 ring-success/60" : "bg-primary/25 ring-1 ring-primary/60"}`}
                style={{ left: c.rect.left, top: c.rect.top, width: c.rect.width, height: c.rect.height }}
              />
            )
          )}
          {rects.map((r, i) => (
            <div
              key={i}
              className="pointer-events-none absolute rounded-sm bg-accent/30 ring-2 ring-accent/60"
              style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
            />
          ))}
          {tapRects.map((r, i) => (
            <div
              key={i}
              className="pointer-events-none absolute rounded-sm bg-primary/30 ring-2 ring-primary/70"
              style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
            />
          ))}
          {captureMode && (
            <div
              className="absolute inset-0 cursor-crosshair"
              style={{ touchAction: "none" }}
              onPointerDown={handleCapturePointerDown}
              onPointerMove={handleCapturePointerMove}
              onPointerUp={handleCapturePointerUp}
            />
          )}
          {captureRect && (
            <div
              className="pointer-events-none absolute rounded-sm border-2 border-primary bg-primary/15"
              style={{ left: captureRect.left, top: captureRect.top, width: captureRect.width, height: captureRect.height }}
            />
          )}
        </div>
        {!loading && !error && highlight && highlight.page === pageNum && rects.length === 0 && (
          <p className="mt-2 text-center text-xs text-foreground-subtle">
            Passage non surligné automatiquement (page probablement scannée) — vous êtes sur la bonne page.
          </p>
        )}
      </div>

      {onSelection && activeSelection && (
        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
          <p className="line-clamp-1 text-xs text-foreground-muted">« {activeSelection} »</p>
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

      {captureMode && captureRect && captureRect.width >= 4 && captureRect.height >= 4 && (
        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
          <p className="text-xs text-foreground-muted">Zone sélectionnée</p>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setCaptureRect(null)}>
              Annuler
            </Button>
            <Button size="sm" onClick={handleUseCaptureRect}>
              Utiliser cette zone
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
