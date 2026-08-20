"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

const VIEWPORT = 240;
const EXPORT_SIZE = 480;

interface AvatarCropDialogProps {
  file: File;
  onCancel: () => void;
  onConfirm: (base64: string, mimeType: string) => void;
}

/** Minimal pan/zoom crop: drag to reposition, slider to zoom, exports the visible circle as a square JPEG. No cropping library — plain canvas + pointer events. */
export function AvatarCropDialog({ file, onCancel, onConfirm }: AvatarCropDialogProps) {
  const imageUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const dragState = useRef<{ startX: number; startY: number; origin: { x: number; y: number } } | null>(null);

  useEffect(() => () => URL.revokeObjectURL(imageUrl), [imageUrl]);

  function handlePointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, origin: offset };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset({ x: dragState.current.origin.x + dx, y: dragState.current.origin.y + dy });
  }

  function handlePointerUp() {
    dragState.current = null;
  }

  function handleConfirm() {
    const img = imgRef.current;
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = EXPORT_SIZE;
    canvas.height = EXPORT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scale = EXPORT_SIZE / VIEWPORT;
    const naturalToDisplay = Math.max(VIEWPORT / img.naturalWidth, VIEWPORT / img.naturalHeight) * zoom;
    const displayW = img.naturalWidth * naturalToDisplay;
    const displayH = img.naturalHeight * naturalToDisplay;
    const drawX = (VIEWPORT / 2 - displayW / 2 + offset.x) * scale;
    const drawY = (VIEWPORT / 2 - displayH / 2 + offset.y) * scale;

    ctx.drawImage(img, drawX, drawY, displayW * scale, displayH * scale);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          onConfirm(result.split(",")[1], "image/jpeg");
        };
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      0.9
    );
  }

  return (
    <Modal title="Recadrer la photo" onClose={onCancel} size="sm">
      <div className="flex flex-col items-center gap-4">
        <div
          className="relative overflow-hidden rounded-full border border-border bg-surface-muted"
          style={{ width: VIEWPORT, height: VIEWPORT, touchAction: "none", cursor: "grab" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- freeform pan/zoom on an arbitrary local file, not an optimizable remote asset
            <img
              ref={imgRef}
              src={imageUrl}
              alt=""
              draggable={false}
              className="pointer-events-none absolute select-none"
              style={{
                left: "50%",
                top: "50%",
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                minWidth: "100%",
                minHeight: "100%",
              }}
            />
          )}
        </div>

        <div className="flex w-full items-center gap-3">
          <span className="text-xs text-foreground-subtle">Zoom</span>
          <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1" />
        </div>

        <div className="flex w-full justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Annuler
          </Button>
          <Button onClick={handleConfirm}>Utiliser cette photo</Button>
        </div>
      </div>
    </Modal>
  );
}
