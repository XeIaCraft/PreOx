"use client";

import { useState, useTransition } from "react";
import { Merge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { markFicheSuperseded } from "@/app/apps/el-profesor/actions/notions";
import { useToast } from "@/components/ui/toast";

/**
 * Shared "fusionner deux fiches" control (extracted 2026-08-26 so the same
 * merge UI can appear both on the admin /notions page and directly in every
 * notion-grouped fiche listing — requested so admins don't have to leave
 * the view they're already looking at to merge an obvious duplicate).
 * Reuses markFicheSuperseded (reason "duplicate") — a reversible soft
 * merge (see clearFicheSuperseded) rather than an irreversible content
 * merge, consistent with how this module already treats every other
 * fusion/obsolescence decision.
 */
export function MergeFichesForm({ fiches, onChanged }: { fiches: { ficheId: string; ficheTitle: string; bookTitle?: string }[]; onChanged: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [duplicateId, setDuplicateId] = useState(fiches[0]?.ficheId ?? "");
  const [canonicalId, setCanonicalId] = useState(fiches[1]?.ficheId ?? "");

  function handleMerge() {
    if (!duplicateId || !canonicalId || duplicateId === canonicalId) return;
    startTransition(async () => {
      const result = await markFicheSuperseded(duplicateId, canonicalId, "duplicate", "");
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onChanged();
      }
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs">
      <Merge className="h-3.5 w-3.5 shrink-0 text-foreground-subtle" />
      <span className="text-foreground-subtle">Fusionner</span>
      <Select value={duplicateId} onChange={(e) => setDuplicateId(e.target.value)} className="max-w-[220px] text-xs">
        {fiches.map((f) => (
          <option key={f.ficheId} value={f.ficheId}>
            {f.ficheTitle}
            {f.bookTitle ? ` (${f.bookTitle})` : ""}
          </option>
        ))}
      </Select>
      <span className="text-foreground-subtle">dans</span>
      <Select value={canonicalId} onChange={(e) => setCanonicalId(e.target.value)} className="max-w-[220px] text-xs">
        {fiches.map((f) => (
          <option key={f.ficheId} value={f.ficheId}>
            {f.ficheTitle}
            {f.bookTitle ? ` (${f.bookTitle})` : ""}
          </option>
        ))}
      </Select>
      <Button variant="ghost" size="sm" onClick={handleMerge} disabled={isPending || duplicateId === canonicalId}>
        Fusionner
      </Button>
    </div>
  );
}
