"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { getFicheRelatedLinks } from "@/app/apps/el-profesor/actions/related";
import type { NotionLinkedFiche } from "@/lib/el-profesor/types";

/** Inline "voir aussi" links to other published fiches sharing a notion with this one — item 4 of the backlog. */
export function RelatedFiches({ ficheId }: { ficheId: string }) {
  const [related, setRelated] = useState<NotionLinkedFiche[] | null>(null);

  // Remounted on ficheId change (chapter-view.tsx keys this component by
  // fiche id), so `related` naturally starts at null again — no reset needed.
  useEffect(() => {
    let cancelled = false;
    getFicheRelatedLinks(ficheId).then((r) => {
      if (!cancelled) setRelated(r);
    });
    return () => {
      cancelled = true;
    };
  }, [ficheId]);

  if (!related || related.length === 0) return null;

  return (
    <div className="mt-6 border-t border-border pt-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
        <Link2 className="h-3.5 w-3.5" /> Voir aussi
      </p>
      <ul className="mt-2 space-y-1">
        {related.map((f) => (
          <li key={f.ficheId}>
            <Link href={`/apps/el-profesor/chapters/${f.chapterId}`} className="text-sm hover:underline">
              <span className="font-medium text-foreground">{f.ficheTitle}</span>{" "}
              <span className="text-foreground-subtle">
                — {f.bookTitle} / {f.chapterTitle}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
