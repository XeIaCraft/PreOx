"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

type Point = { x: number; y: number };

const EXPORT_WIDTH = 600;
const EXPORT_HEIGHT = 200;

/** Draws the strokes at the canvas's current CSS size (crisp on high-DPI screens). */
function paint(canvas: HTMLCanvasElement, strokes: Point[][]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = getComputedStyle(canvas).color;
  for (const stroke of strokes) {
    ctx.beginPath();
    stroke.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * rect.width, p.y * rect.height) : ctx.lineTo(p.x * rect.width, p.y * rect.height)));
    if (stroke.length === 1) ctx.lineTo(stroke[0].x * rect.width + 0.1, stroke[0].y * rect.height);
    ctx.stroke();
  }
}

/**
 * Touch/mouse/stylus signature capture. Strokes are kept as normalized
 * points (0..1) so the exported image doesn't depend on the screen it was
 * drawn on; exported as a transparent PNG (dark ink) sized for the
 * carnet's signature column.
 */
export function SignaturePad({ onChange }: { onChange: (pngDataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  function redraw() {
    if (canvasRef.current) paint(canvasRef.current, strokes.current);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    paint(canvas, strokes.current);
    const onResize = () => paint(canvas, strokes.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  }

  function exportPng(): string | null {
    if (strokes.current.length === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = EXPORT_WIDTH;
    canvas.height = EXPORT_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#10233f";
    for (const stroke of strokes.current) {
      ctx.beginPath();
      stroke.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * EXPORT_WIDTH, p.y * EXPORT_HEIGHT) : ctx.lineTo(p.x * EXPORT_WIDTH, p.y * EXPORT_HEIGHT)));
      if (stroke.length === 1) ctx.lineTo(stroke[0].x * EXPORT_WIDTH + 0.5, stroke[0].y * EXPORT_HEIGHT);
      ctx.stroke();
    }
    return canvas.toDataURL("image/png");
  }

  function finishStroke() {
    if (!drawing.current) return;
    drawing.current = false;
    setHasInk(strokes.current.length > 0);
    onChange(exportPng());
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-[var(--radius-md)] border-2 border-dashed border-border-strong bg-white">
        <canvas
          ref={canvasRef}
          className="block h-44 w-full touch-none text-[#10233f] sm:h-52"
          aria-label="Zone de signature"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            strokes.current.push([point(e)]);
            redraw();
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            strokes.current[strokes.current.length - 1].push(point(e));
            redraw();
          }}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        />
        {!hasInk && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">Signez ici</p>}
        <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-slate-300" />
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            strokes.current = [];
            setHasInk(false);
            redraw();
            onChange(null);
          }}
        >
          <Eraser className="h-4 w-4" /> Effacer
        </Button>
      </div>
    </div>
  );
}
