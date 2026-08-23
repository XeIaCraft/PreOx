"use client";

import { useState } from "react";
import {
  BookMarked,
  Gauge,
  Table2,
  ListOrdered,
  Lightbulb,
  Sparkles,
  ShieldAlert,
  Sigma,
  FileText,
  Copy,
  Check,
  Volume2,
  VolumeX,
  ThumbsUp,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FlagButton } from "@/components/el-profesor/flag-button";
import { markBlockReviewed } from "@/app/apps/el-profesor/actions/block-review";
import type { BlockReviewState } from "@/lib/el-profesor/dal";
import type { BlockType, Citation, FicheBlock, ProtocolBlockContent, TableBlockContent, TextBlockContent } from "@/lib/el-profesor/types";

/**
 * Spaced repetition per block (item 16 of the backlog) — a self-contained
 * "still remember it" / "need to revisit" pair, separate from the
 * flashcard FSRS engine. Optimistically updates its own local state after
 * the server action resolves rather than round-tripping through the
 * parent, since nothing else on the page depends on this block's schedule.
 */
function BlockRereadControl({ blockId, initialState }: { blockId: string; initialState?: BlockReviewState }) {
  const [state, setState] = useState(initialState ?? null);
  const [pending, setPending] = useState(false);

  function handleRate(remembered: boolean) {
    setPending(true);
    markBlockReviewed(blockId, remembered)
      .then((result) => {
        if (result.nextDueAt && result.intervalDays !== undefined) setState({ nextDueAt: result.nextDueAt, intervalDays: result.intervalDays });
      })
      .finally(() => setPending(false));
  }

  return (
    <div className="flex items-center gap-1.5">
      {state && (
        <span className="text-[11px] text-foreground-subtle">
          Prochaine relecture dans {state.intervalDays} j{state.intervalDays > 1 ? "ours" : "our"}
        </span>
      )}
      <button
        type="button"
        onClick={() => handleRate(false)}
        disabled={pending}
        title="À revoir bientôt"
        aria-label="À revoir bientôt"
        className="rounded-full p-1 text-foreground-subtle hover:bg-danger-tint hover:text-danger disabled:opacity-50"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => handleRate(true)}
        disabled={pending}
        title="Je m'en souviens encore"
        aria-label="Je m'en souviens encore"
        className="rounded-full p-1 text-foreground-subtle hover:bg-success-tint hover:text-success disabled:opacity-50"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const BLOCK_META: Record<BlockType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  definition_mecanisme: { label: "Définition / mécanisme", icon: BookMarked },
  valeurs_seuils: { label: "Valeurs & seuils", icon: Gauge },
  tableau_comparatif: { label: "Tableau comparatif", icon: Table2 },
  protocole_paliers: { label: "Protocole", icon: ListOrdered },
  mnemotechnique: { label: "Mnémotechnique", icon: Lightbulb },
  perle_clinique: { label: "Perle clinique", icon: Sparkles },
  piege_erreur: { label: "Piège fréquent", icon: ShieldAlert },
  formule: { label: "Formule", icon: Sigma },
  texte_libre: { label: "Note", icon: FileText },
};

export type FontScale = "sm" | "md" | "lg";

const BODY_TEXT_SIZE: Record<FontScale, string> = {
  sm: "text-[13px]",
  md: "text-[15px]",
  lg: "text-[17px]",
};

const SUMMARY_TEXT_SIZE: Record<FontScale, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

function getBlockPlainText(block: FicheBlock): string {
  if (block.blockType === "tableau_comparatif") {
    const content = block.content as TableBlockContent;
    const headers = (content.headers ?? []).join(" | ");
    const rows = (content.rows ?? []).map((r) => r.join(" | ")).join("\n");
    return [headers, rows].filter(Boolean).join("\n");
  }
  if (block.blockType === "protocole_paliers") {
    const content = block.content as ProtocolBlockContent;
    return (content.steps ?? [])
      .map((s, i) => `${i + 1}. ${s.label} — ${s.detail}${s.condition ? ` (si : ${s.condition})` : ""}`)
      .join("\n");
  }
  return (block.content as TextBlockContent).text ?? "";
}

function CopyBlockButton({ block }: { block: FicheBlock }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard
      .writeText(getBlockPlainText(block))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-foreground-subtle hover:text-primary-strong"
      aria-label="Copier le texte de ce bloc"
      title="Copier le texte"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function CitationChips({ citations, onClick }: { citations: Citation[]; onClick?: (c: Citation) => void }) {
  if (citations.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {citations.map((c, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onClick?.(c)}
          className="rounded-full border border-border-strong px-2.5 py-1 text-xs text-foreground-subtle hover:border-primary/40 hover:text-primary-strong"
        >
          p. {c.page}
        </button>
      ))}
    </div>
  );
}

function BlockBody({ block, fontScale }: { block: FicheBlock; fontScale: FontScale }) {
  if (block.blockType === "tableau_comparatif") {
    const content = block.content as TableBlockContent;
    const headers = content.headers ?? [];
    const rows = content.rows ?? [];
    return (
      <div>
        {/* Below sm: one card per row with each cell stacked under its
            header — a multi-column grid table is unreadable on a phone
            even scrolled horizontally. */}
        <div className="space-y-3 sm:hidden">
          {rows.map((row, ri) => (
            <div key={ri} className="rounded-[var(--radius-sm)] border border-border p-3">
              {row.map((cell, ci) => (
                <div key={ci} className="border-b border-border/60 py-1.5 last:border-b-0">
                  {headers[ci] && (
                    <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">{headers[ci]}</p>
                  )}
                  <p className="text-sm text-foreground-muted">{cell}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="border-b border-border px-3 py-2 text-left font-medium text-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="odd:bg-surface-muted/50">
                  {row.map((cell, ci) => (
                    <td key={ci} className="border-b border-border px-3 py-2 text-foreground-muted">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (block.blockType === "protocole_paliers") {
    const content = block.content as ProtocolBlockContent;
    return (
      <ol className="space-y-2">
        {content.steps?.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-tint text-[11px] font-medium text-primary-strong">
              {i + 1}
            </span>
            <div>
              <p className="font-medium text-foreground">{step.label}</p>
              <p className="text-sm text-foreground-muted">{step.detail}</p>
              {step.condition && <p className="text-xs text-foreground-subtle">Si : {step.condition}</p>}
            </div>
          </li>
        ))}
      </ol>
    );
  }

  const content = block.content as TextBlockContent;
  return <p className={`whitespace-pre-wrap leading-relaxed text-foreground-muted ${BODY_TEXT_SIZE[fontScale]}`}>{content.text}</p>;
}

// Quick jump bar to the first block of each distinct type — only worth
// showing once a fiche has enough blocks that scrolling to find one is a
// real chore.
function BlockNav({ blocks }: { blocks: FicheBlock[] }) {
  if (blocks.length < 6) return null;
  const seen = new Set<BlockType>();
  const entries: { type: BlockType; blockId: string }[] = [];
  for (const b of blocks) {
    if (!seen.has(b.blockType)) {
      seen.add(b.blockType);
      entries.push({ type: b.blockType, blockId: b.id });
    }
  }
  if (entries.length < 2) return null;

  return (
    <div className="sticky top-0 z-10 -mx-1 mb-3 flex gap-1 overflow-x-auto bg-surface px-1 py-1.5">
      {entries.map(({ type, blockId }) => {
        const meta = BLOCK_META[type];
        const Icon = meta.icon;
        return (
          <button
            key={type}
            type="button"
            onClick={() =>
              document.getElementById(`fiche-block-${blockId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            title={meta.label}
            aria-label={`Aller à : ${meta.label}`}
            className="flex shrink-0 items-center justify-center rounded-full border border-border bg-surface p-1.5 text-foreground-subtle hover:border-primary/40 hover:text-primary-strong"
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

function CopyFicheButton({ title, summary, blocks }: { title: string; summary?: string; blocks: FicheBlock[] }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const parts = [title, summary, ...blocks.map((b) => `${BLOCK_META[b.blockType].label}\n${getBlockPlainText(b)}`)];
    navigator.clipboard
      .writeText(parts.filter(Boolean).join("\n\n"))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex shrink-0 items-center gap-1 text-xs text-foreground-subtle hover:text-primary-strong"
      aria-label="Copier le texte de la fiche"
      title="Copier tout le texte de la fiche"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copié" : "Copier la fiche"}
    </button>
  );
}

/** Text-to-speech read-aloud via the browser's SpeechSynthesis API — no backend involved, purely a client-side accessibility aid. */
function SpeakFicheButton({ title, summary, blocks }: { title: string; summary?: string; blocks: FicheBlock[] }) {
  const [speaking, setSpeaking] = useState(false);

  function handleToggle() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const text = [title, summary, ...blocks.map((b) => getBlockPlainText(b))].filter(Boolean).join(". ");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="flex shrink-0 items-center gap-1 text-xs text-foreground-subtle hover:text-primary-strong"
      aria-label={speaking ? "Arrêter la lecture" : "Lire la fiche à voix haute"}
      title={speaking ? "Arrêter la lecture" : "Lire la fiche à voix haute"}
    >
      {speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      {speaking ? "Arrêter" : "Écouter"}
    </button>
  );
}

export function FicheViewer({
  title,
  summary,
  blocks,
  onCitationClick,
  fontScale = "md",
  superseded,
  blockReviewStates,
}: {
  title: string;
  summary?: string;
  blocks: FicheBlock[];
  onCitationClick?: (c: Citation) => void;
  fontScale?: FontScale;
  /** Set when this fiche was merged/replaced (items 52/56) — shows a warning banner instead of hiding the content outright. */
  superseded?: { reason: "duplicate" | "outdated"; note: string };
  /** Per-block spaced-repetition state (item 16) — omitted in read-only contexts (print, share links, admin review) where there's no signed-in reader to track. */
  blockReviewStates?: Record<string, BlockReviewState>;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-serif-display text-xl font-medium text-foreground">{title}</h3>
        <div className="flex shrink-0 items-center gap-3">
          <SpeakFicheButton title={title} summary={summary} blocks={blocks} />
          <CopyFicheButton title={title} summary={summary} blocks={blocks} />
        </div>
      </div>
      {superseded && (
        <div className="mt-2 rounded-[var(--radius-sm)] border border-accent/40 bg-accent-tint px-3 py-2 text-xs text-accent">
          {superseded.reason === "duplicate"
            ? "Cette fiche fait doublon avec une autre et a été fusionnée — son contenu ne fait plus partie de la révision."
            : "Cette fiche a été marquée obsolète, remplacée par une recommandation plus récente — elle ne fait plus partie de la révision."}
          {superseded.note && ` ${superseded.note}`}
        </div>
      )}
      {summary && <p className={`mt-1 text-foreground-subtle ${SUMMARY_TEXT_SIZE[fontScale]}`}>{summary}</p>}
      <BlockNav blocks={blocks} />
      <div className="mt-4 space-y-4">
        {blocks.map((block) => {
          const meta = BLOCK_META[block.blockType];
          const Icon = meta.icon;
          return (
            <div key={block.id} id={`fiche-block-${block.id}`} className="scroll-mt-14 rounded-[var(--radius-md)] border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
                  <Icon className="h-3.5 w-3.5" /> {meta.label}
                </span>
                <div className="flex items-center gap-2">
                  {block.needsReview && <Badge variant="accent">À vérifier</Badge>}
                  <CopyBlockButton block={block} />
                  <FlagButton targetType="block" targetId={block.id} />
                </div>
              </div>
              <div className="mt-2">
                <BlockBody block={block} fontScale={fontScale} />
              </div>
              <CitationChips citations={block.citations} onClick={onCitationClick} />
              {blockReviewStates && (
                <div className="mt-2 flex justify-end border-t border-border pt-2">
                  <BlockRereadControl blockId={block.id} initialState={blockReviewStates[block.id]} />
                </div>
              )}
            </div>
          );
        })}
        {blocks.length === 0 && <p className="text-sm text-foreground-subtle">Aucun contenu pour cette fiche.</p>}
      </div>
    </div>
  );
}
