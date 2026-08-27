"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, Check, Undo2, TriangleAlert, BookOpen, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BlockBody, BLOCK_META } from "@/components/el-profesor/fiche-viewer";
import { TableEditor, ProtocolEditor, IS_TEXT_BLOCK } from "@/components/el-profesor/block-editor";
import {
  generateNotionSynthesis,
  publishNotionSynthesis,
  unpublishNotionSynthesis,
  updateNotionSynthesisBlockContent,
  moveNotionSynthesisBlock,
  deleteNotionSynthesisBlock,
} from "@/app/apps/el-profesor/actions/notions";
import { useToast } from "@/components/ui/toast";
import type {
  NotionSynthesis,
  NotionSynthesisBlock,
  NotionLinkedFiche,
  FicheBlock,
  TableBlockContent,
  ProtocolBlockContent,
  TextBlockContent,
} from "@/lib/el-profesor/types";

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
    imageUrl: block.imageUrl,
    imageAlt: block.imageAlt,
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
      {block.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- reused verbatim from a source fiche block's own upload (Supabase Storage public URL), not a Next-optimizable asset.
        <img
          src={block.imageUrl}
          alt={block.imageAlt ?? ""}
          className="mt-2 max-h-96 w-auto max-w-full rounded-[var(--radius-sm)] border border-border object-contain"
        />
      )}
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

/**
 * Admin-only editable variant of a synthesis block (requested 2026-08-27 —
 * regenerating the whole synthesis to fix one wording, or to drop one
 * redundant block, wastes an AI call once the structure is otherwise
 * right). Reuses the same TableEditor/ProtocolEditor/textarea as the fiche
 * block editor, but never exposes citations for editing — they stay
 * exactly as resolved from the real source blocks (see
 * generateNotionSynthesis's doc comment) — and there's no needs_review/
 * flags/emergency-toggle/mnemonic-suggestion, none of which apply to a
 * synthesis block. Reordering is scoped to the block's own section
 * (moveNotionSynthesisBlock), so it can never cross into another subject's
 * section by accident.
 */
function SynthesisBlockEditor({
  block,
  isFirst,
  isLast,
  onChanged,
}: {
  block: NotionSynthesisBlock;
  isFirst: boolean;
  isLast: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState(block.content);
  const meta = BLOCK_META[block.blockType];
  const Icon = meta.icon;
  const sources = [...new Map(block.citations.map((c) => [`${c.chapterId}`, c])).values()];

  function handleSave() {
    startTransition(async () => {
      const result = await updateNotionSynthesisBlockContent(block.id, content);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Bloc mis à jour.", { variant: "success" });
        onChanged();
      }
    });
  }

  function handleMove(direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveNotionSynthesisBlock(block.id, direction);
      if (result.error) toast(result.error, { variant: "error" });
      else onChanged();
    });
  }

  function handleDelete() {
    if (!confirm("Supprimer ce bloc de synthèse ? Il ne sera pas régénéré automatiquement — relancez « Régénérer la synthèse » si besoin.")) return;
    startTransition(async () => {
      const result = await deleteNotionSynthesisBlock(block.id);
      if (result.error) toast(result.error, { variant: "error" });
      else onChanged();
    });
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1">
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => handleMove("up")}
              disabled={isFirst || isPending}
              aria-label="Monter ce bloc"
              className="text-foreground-subtle hover:text-foreground disabled:opacity-30"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleMove("down")}
              disabled={isLast || isPending}
              aria-label="Descendre ce bloc"
              className="text-foreground-subtle hover:text-foreground disabled:opacity-30"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
            <Icon className="h-3.5 w-3.5" /> {meta.label}
          </span>
        </div>
        <button type="button" onClick={handleDelete} disabled={isPending} className="text-foreground-subtle hover:text-danger" aria-label="Supprimer ce bloc">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2">
        {block.blockType === "tableau_comparatif" && (
          <TableEditor content={content as TableBlockContent} onChange={(c) => setContent(c)} />
        )}
        {block.blockType === "protocole_paliers" && (
          <ProtocolEditor content={content as ProtocolBlockContent} onChange={(c) => setContent(c)} />
        )}
        {IS_TEXT_BLOCK.has(block.blockType) && (
          <textarea
            value={(content as TextBlockContent).text ?? ""}
            onChange={(e) => setContent({ text: e.target.value })}
            rows={4}
            className="w-full rounded-[var(--radius-sm)] border border-border bg-surface p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        )}
      </div>

      {block.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- reused verbatim from a source fiche block's own upload (Supabase Storage public URL), not a Next-optimizable asset.
        <img
          src={block.imageUrl}
          alt={block.imageAlt ?? ""}
          className="mt-2 max-h-96 w-auto max-w-full rounded-[var(--radius-sm)] border border-border object-contain"
        />
      )}

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

      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          Enregistrer
        </Button>
      </div>
    </div>
  );
}

/** Groups synthesis blocks under their section headings, preserving orderIndex — blocks keep the section boundaries the generation call assigned rather than being re-sorted alphabetically. */
function groupBlocksBySection(blocks: NotionSynthesisBlock[]): { title: string; blocks: NotionSynthesisBlock[] }[] {
  const sections: { title: string; blocks: NotionSynthesisBlock[] }[] = [];
  for (const block of blocks) {
    const title = block.sectionTitle || "Autres éléments";
    const last = sections[sections.length - 1];
    if (last && last.title === title) last.blocks.push(block);
    else sections.push({ title, blocks: [block] });
  }
  return sections;
}

/** Every distinct book/chapter a section's blocks actually cite, for the "Sources de cette section" footer requested 2026-08-27 — beyond the per-block chips, a reader wants to know at a glance which books fed a whole section. */
function sectionSources(blocks: NotionSynthesisBlock[]): { chapterId: string; bookTitle: string; chapterTitle: string }[] {
  const byChapter = new Map<string, { chapterId: string; bookTitle: string; chapterTitle: string }>();
  for (const block of blocks) {
    for (const c of block.citations) {
      if (!byChapter.has(c.chapterId)) byChapter.set(c.chapterId, { chapterId: c.chapterId, bookTitle: c.bookTitle, chapterTitle: c.chapterTitle });
    }
  }
  return [...byChapter.values()];
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

      {isAdmin && synthesis && synthesis.uncoveredSources.length > 0 && (
        <div className="mt-3 rounded-[var(--radius-sm)] border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          <p className="flex items-center gap-1.5 font-medium">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
            {synthesis.uncoveredSources.length} source{synthesis.uncoveredSources.length > 1 ? "s" : ""} non reprise
            {synthesis.uncoveredSources.length > 1 ? "s" : ""} dans la synthèse — à vérifier avant publication (perte d&apos;information possible) :
          </p>
          <ul className="mt-1.5 space-y-0.5 pl-5">
            {synthesis.uncoveredSources.map((s, i) => (
              <li key={i} className="list-disc">
                {s.ficheTitle} — {s.bookTitle} / {s.chapterTitle}
              </li>
            ))}
          </ul>
        </div>
      )}

      {synthesis && synthesis.blocks.length > 0 ? (
        <div className="mt-5 space-y-6">
          {groupBlocksBySection(synthesis.blocks).map(({ title, blocks }) => {
            const sources = sectionSources(blocks);
            return (
              <div key={title}>
                <h2 className="font-serif-display text-lg font-medium text-foreground">{title}</h2>
                <div className="mt-2 space-y-3">
                  {blocks.map((block, i) =>
                    isAdmin ? (
                      <SynthesisBlockEditor
                        key={block.id}
                        block={block}
                        isFirst={i === 0}
                        isLast={i === blocks.length - 1}
                        onChanged={refresh}
                      />
                    ) : (
                      <SynthesisBlockCard key={block.id} block={block} />
                    )
                  )}
                </div>
                {sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-foreground-subtle">
                    <span>Sources de cette section :</span>
                    {sources.map((s, i) => (
                      <span key={s.chapterId}>
                        <Link href={`/apps/el-profesor/chapters/${s.chapterId}`} className="hover:text-primary-strong hover:underline">
                          {s.bookTitle} — {s.chapterTitle}
                        </Link>
                        {i < sources.length - 1 ? "," : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
