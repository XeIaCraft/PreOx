"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, Check, Undo2, TriangleAlert, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BlockBody, BLOCK_META } from "@/components/el-profesor/fiche-viewer";
import { generateNotionSynthesis, publishNotionSynthesis, unpublishNotionSynthesis } from "@/app/apps/el-profesor/actions/notions";
import { useToast } from "@/components/ui/toast";
import type { NotionSynthesis, NotionSynthesisBlock, NotionLinkedFiche, FicheBlock } from "@/lib/el-profesor/types";

/** One synthesized block, with a "sources" footer instead of FicheViewer's normal per-citation chips — a synthesis block can draw on several books' own PDFs at once, so there's no single page to jump to. */
function SynthesisBlockCard({ block }: { block: NotionSynthesisBlock }) {
  const meta = BLOCK_META[block.blockType];
  const Icon = meta.icon;
  // FicheViewer's BlockBody only ever reads blockType/content — the rest of this shape is irrelevant here.
  const asFicheBlock = {
    id: block.id,
    ficheId: "",
    orderIndex: block.orderIndex,
    blockType: block.blockType,
    content: block.content,
    citations: [],
    needsReview: false,
    status: "published" as const,
    isEmergency: false,
  } satisfies FicheBlock;

  const sources = [...new Map(block.citations.map((c) => [`${c.chapterId}`, c])).values()];

  return (
    <div className="rounded-[var(--radius-md)] border border-border p-4">
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
        <Icon className="h-3.5 w-3.5" /> {meta.label}
      </span>
      <div className="mt-2">
        <BlockBody block={asFicheBlock} fontScale="md" />
      </div>
      {sources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
          {sources.map((s) => (
            <Link
              key={s.chapterId}
              href={`/apps/el-profesor/chapters/${s.chapterId}`}
              className="rounded-full border border-border-strong px-2.5 py-1 text-xs text-foreground-subtle hover:border-primary/40 hover:text-primary-strong"
              title={`p. ${s.page} — « ${s.quote} »`}
            >
              {s.bookTitle}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function NotionSynthesisView({
  notionId,
  notionName,
  synthesis,
  fiches,
  isAdmin,
}: {
  notionId: string;
  notionName: string;
  synthesis: NotionSynthesis | null;
  fiches: NotionLinkedFiche[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function refresh() {
    startTransition(() => router.refresh());
  }

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateNotionSynthesis(notionId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Synthèse générée.", { variant: "success" });
        router.refresh();
      }
    });
  }

  function handlePublish() {
    startTransition(async () => {
      const result = await publishNotionSynthesis(notionId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Publiée.", { variant: "success" });
        refresh();
      }
    });
  }

  function handleUnpublish() {
    startTransition(async () => {
      const result = await unpublishNotionSynthesis(notionId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Repassée en brouillon.", { variant: "success" });
        refresh();
      }
    });
  }

  const distinctBooks = new Set(fiches.map((f) => f.bookId)).size;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/apps/el-profesor/glossary" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground-subtle hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour au glossaire
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif-display text-2xl font-medium text-foreground">{notionName}</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {fiches.length} fiche{fiches.length > 1 ? "s" : ""} liée{fiches.length > 1 ? "s" : ""}
            {distinctBooks > 1 ? ` · ${distinctBooks} livres` : ""}
          </p>
        </div>
        {synthesis && (
          <Badge variant={synthesis.status === "published" ? "success" : "accent"}>{synthesis.status === "published" ? "Synthèse publiée" : "Brouillon"}</Badge>
        )}
      </div>

      {isAdmin && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-muted p-3">
          <Button size="sm" onClick={handleGenerate} disabled={isPending}>
            <Sparkles className="h-3.5 w-3.5" /> {synthesis ? "Régénérer la synthèse" : "Générer la synthèse"}
          </Button>
          {synthesis && synthesis.status === "draft" && (
            <Button variant="secondary" size="sm" onClick={handlePublish} disabled={isPending}>
              <Check className="h-3.5 w-3.5" /> Publier
            </Button>
          )}
          {synthesis && synthesis.status === "published" && (
            <Button variant="ghost" size="sm" onClick={handleUnpublish} disabled={isPending}>
              <Undo2 className="h-3.5 w-3.5" /> Repasser en brouillon
            </Button>
          )}
          <span className="text-xs text-foreground-subtle">
            Relit tout le contenu publié de cette notion et le réécrit en une seule fiche dédupliquée — coûte un appel IA.
          </span>
        </div>
      )}

      {synthesis?.isStale && (
        <p className="mt-3 flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-accent/40 bg-accent-tint px-3 py-2 text-xs text-accent">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          Le contenu source a changé depuis cette génération (fiche ajoutée, retirée, ou fusionnée) — {isAdmin ? "régénérez pour la mettre à jour." : "elle peut être partiellement dépassée."}
        </p>
      )}

      {synthesis && synthesis.blocks.length > 0 ? (
        <div className="mt-5 space-y-3">
          {synthesis.blocks.map((block) => (
            <SynthesisBlockCard key={block.id} block={block} />
          ))}
        </div>
      ) : (
        <p className="mt-6 text-sm text-foreground-subtle">
          {isAdmin
            ? "Pas encore de synthèse pour cette notion — générez-la ci-dessus pour lire le sujet en une seule fois plutôt que livre par livre."
            : "Pas encore de synthèse disponible pour cette notion."}
        </p>
      )}

      <div className="mt-8 border-t border-border pt-4">
        <p className="mb-2 text-sm font-medium text-foreground">Sources ({fiches.length})</p>
        <ul className="space-y-1 text-xs text-foreground-subtle">
          {fiches.map((f) => (
            <li key={f.ficheId}>
              <Link href={`/apps/el-profesor/chapters/${f.chapterId}`} className="inline-flex items-center gap-1 hover:underline">
                <BookOpen className="h-3 w-3 shrink-0" />
                <span className="font-medium text-foreground">{f.ficheTitle}</span>
                <span>
                  — {f.bookTitle} / {f.chapterTitle}
                </span>
              </Link>
            </li>
          ))}
          {fiches.length === 0 && <li>Aucune fiche liée à cette notion.</li>}
        </ul>
      </div>
    </div>
  );
}
