"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/** Shared "title + start/end page" editable row, used by SplitBookDialog and SplitChapterDialog. */
export function RangeRow({
  title,
  startPage,
  endPage,
  onChange,
  onRemove,
}: {
  title: string;
  startPage: string;
  endPage: string;
  onChange: (patch: { title?: string; startPage?: string; endPage?: string }) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-end gap-2 rounded-[var(--radius-sm)] border border-border p-2">
      <div className="flex-1 space-y-1">
        <Label>Titre</Label>
        <Input value={title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Titre" />
      </div>
      <div className="w-20 space-y-1">
        <Label>Page début</Label>
        <Input type="number" min={1} value={startPage} onChange={(e) => onChange({ startPage: e.target.value })} />
      </div>
      <div className="w-20 space-y-1">
        <Label>Page fin</Label>
        <Input type="number" min={1} value={endPage} onChange={(e) => onChange({ endPage: e.target.value })} />
      </div>
      <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Retirer cette partie">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
