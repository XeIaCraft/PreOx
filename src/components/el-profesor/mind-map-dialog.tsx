"use client";

import { useEffect, useState } from "react";
import { Brain } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { getChapterMindMap } from "@/app/apps/el-profesor/actions/study-tools";
import type { MindMap } from "@/lib/el-profesor/gemini";

const BRANCH_COLORS = ["border-primary/40 bg-primary-tint/40", "border-accent/40 bg-accent-tint/40", "border-success/40 bg-success-tint/40", "border-danger/40 bg-danger-tint/40"];

/** On-demand chapter mind map (item 2) — a fixed two-level tree rendered as a central topic with surrounding branch cards, ephemeral (regenerated each open, never persisted). */
export function MindMapDialog({ chapterId, onClose }: { chapterId: string; onClose: () => void }) {
  const [state, setState] = useState<{ loading: boolean; mindMap: MindMap | null; error: string | null }>({
    loading: true,
    mindMap: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    getChapterMindMap(chapterId).then((result) => {
      if (cancelled) return;
      if ("error" in result) setState({ loading: false, mindMap: null, error: result.error });
      else setState({ loading: false, mindMap: result.mindMap, error: null });
    });
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  return (
    <Modal title="Carte mentale" description="Générée par IA à partir du contenu déjà rédigé — pas enregistrée." onClose={onClose} size="xl">
      {state.loading ? (
        <p className="py-8 text-center text-sm text-foreground-subtle">Génération en cours…</p>
      ) : state.error ? (
        <p className="py-8 text-center text-sm text-danger">{state.error}</p>
      ) : state.mindMap ? (
        <div>
          <div className="mx-auto mb-6 w-fit rounded-full border-2 border-primary bg-primary-tint px-5 py-2.5 text-center">
            <p className="flex items-center gap-1.5 font-serif-display text-lg font-medium text-primary-strong">
              <Brain className="h-4 w-4" /> {state.mindMap.central}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {state.mindMap.branches.map((branch, i) => (
              <div key={i} className={`rounded-[var(--radius-md)] border p-3 ${BRANCH_COLORS[i % BRANCH_COLORS.length]}`}>
                <p className="font-medium text-foreground">{branch.label}</p>
                <ul className="mt-1.5 space-y-1 text-sm text-foreground-muted">
                  {branch.children.map((child, j) => (
                    <li key={j} className="flex gap-1.5">
                      <span className="text-foreground-subtle">–</span> {child}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
