"use client";

import { useState, useTransition, useRef, useEffect, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Check,
  Undo2,
  TriangleAlert,
  BookOpen,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Trash2,
  SlidersHorizontal,
  Minus,
  Plus,
  AlignJustify,
  Sun,
  SpellCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { BlockBody, BLOCK_META } from "@/components/el-profesor/fiche-viewer";
import { TableEditor, ProtocolEditor, IS_TEXT_BLOCK } from "@/components/el-profesor/block-editor";
import { OptionToggleRow } from "@/components/el-profesor/chapter-view";
import {
  generateNotionSynthesis,
  publishNotionSynthesis,
  unpublishNotionSynthesis,
  updateNotionSynthesisBlockContent,
  moveNotionSynthesisBlock,
  deleteNotionSynthesisBlock,
  deleteNotionSynthesis,
} from "@/app/apps/el-profesor/actions/notions";
import { useToast } from "@/components/ui/toast";
import {
  getFontScale,
  setFontScale,
  getTextJustify,
  setTextJustify,
  getReadingComfort,
  setReadingComfort,
  getDyslexicFont,
  setDyslexicFont,
  type FontScale,
} from "@/lib/el-profesor/local-prefs";
import type { AdjacentNotionEntry } from "@/lib/el-profesor/dal";
import type {
  NotionSynthesis,
  NotionSynthesisBlock,
  NotionLinkedFiche,
  FicheBlock,
  TableBlockContent,
  ProtocolBlockContent,
  TextBlockContent,
} from "@/lib/el-profesor/types";

/**
 * One synthesized block, in the same flowing "livre" reading style as
 * FicheViewer's own book layout (requested 2026-08-29 — the boxed-card
 * look used before "ne correspond pas du tout" to that style). No
 * per-block source chips here — a reader only ever sees sources once, at
 * the end of the section (see sectionSources below).
 */
function SynthesisBlockCard({ block, fontScale, justify }: { block: NotionSynthesisBlock; fontScale: FontScale; justify: boolean }) {
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
  const isPearl = block.blockType === "perle_clinique";

  return (
    <div className={`py-3.5 first:pt-0 ${isPearl ? "border-l-2 border-accent pl-4" : ""}`}>
      <span className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${isPearl ? "text-accent" : "text-foreground-subtle"}`}>
        <Icon className="h-3.5 w-3.5" /> {meta.label}
      </span>
      <div className={`mt-2 ${isPearl ? "italic" : ""}`}>
        <BlockBody block={asFicheBlock} fontScale={fontScale} serif justify={justify} />
      </div>
      {block.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- reused verbatim from a source fiche block's own upload (Supabase Storage public URL), not a Next-optimizable asset.
        <img
          src={block.imageUrl}
          alt={block.imageAlt ?? ""}
          className={`mt-2 max-h-96 w-auto max-w-full rounded-[var(--radius-sm)] border border-border object-contain ${justify ? "mx-auto block" : ""}`}
        />
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
 * section by accident. Stays a boxed, form-like control (unlike the
 * flowing read view) since editing needs clear per-block boundaries.
 */
function SynthesisBlockEditor({
  block,
  isFirst,
  isLast,
  onChanged,
  justify,
}: {
  block: NotionSynthesisBlock;
  isFirst: boolean;
  isLast: boolean;
  onChanged: () => void;
  justify: boolean;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState(block.content);
  const meta = BLOCK_META[block.blockType];
  const Icon = meta.icon;

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
          className={`mt-2 max-h-96 w-auto max-w-full rounded-[var(--radius-sm)] border border-border object-contain ${justify ? "mx-auto block" : ""}`}
        />
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

/** Every distinct book/chapter a section's blocks actually cite, for the section's own (sole) sources footer — a reader wants to know at a glance which books fed a whole section, without a chip repeated under every single block. */
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
  prevNotion = null,
  nextNotion = null,
}: {
  notionId: string;
  notionName: string;
  synthesis: NotionSynthesis | null;
  fiches: NotionLinkedFiche[];
  isAdmin: boolean;
  prevNotion?: AdjacentNotionEntry | null;
  nextNotion?: AdjacentNotionEntry | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [fontScale, setFontScaleState] = useState<FontScale>(() => getFontScale() ?? "md");
  const [textJustify, setTextJustifyState] = useState(() => getTextJustify());
  const [readingComfort, setReadingComfortState] = useState(() => getReadingComfort());
  const [dyslexicFont, setDyslexicFontState] = useState(() => getDyslexicFont());
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const distinctBooks = new Set(fiches.map((f) => f.bookId)).size;
  const sections = synthesis ? groupBlocksBySection(synthesis.blocks) : [];

  // Scroll-spy for the sticky section-shortcut strip (requested 2026-08-29
  // — "la sous partie s'actualise avec la sous partie en cours") — the
  // active chip is whichever section heading has most recently scrolled
  // past the sticky bar, not just whatever's nearest the viewport center.
  useEffect(() => {
    if (sections.length === 0) return;
    // HubHeader's own sticky bar (64px, top-16) plus this page's sticky
    // running-header box (context line + title + chip row) — both pinned
    // at once, so "passed" means past the combined height, not just ours.
    const STICKY_OFFSET = 190;
    function handleScroll() {
      let current = 0;
      for (let i = 0; i < sectionRefs.current.length; i++) {
        const el = sectionRefs.current[i];
        if (el && el.getBoundingClientRect().top - STICKY_OFFSET <= 0) current = i;
      }
      setActiveSection(current);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sections.length]);

  useEffect(() => {
    chipRefs.current[activeSection]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeSection]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  const FONT_SCALE_ORDER: FontScale[] = ["sm", "md", "lg"];
  function adjustFontScale(direction: 1 | -1) {
    const nextIndex = Math.min(FONT_SCALE_ORDER.length - 1, Math.max(0, FONT_SCALE_ORDER.indexOf(fontScale) + direction));
    const next = FONT_SCALE_ORDER[nextIndex];
    setFontScaleState(next);
    setFontScale(next);
  }

  function toggleTextJustify() {
    setTextJustifyState((prev) => {
      const next = !prev;
      setTextJustify(next);
      return next;
    });
  }

  function toggleReadingComfort() {
    setReadingComfortState((prev) => {
      const next = !prev;
      setReadingComfort(next);
      return next;
    });
  }

  function toggleDyslexicFont() {
    setDyslexicFontState((prev) => {
      const next = !prev;
      setDyslexicFont(next);
      return next;
    });
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

  function handleDelete() {
    if (!confirm("Supprimer définitivement cette synthèse ? Elle pourra être régénérée depuis zéro ensuite.")) return;
    startTransition(async () => {
      const result = await deleteNotionSynthesis(notionId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "Synthèse supprimée.", { variant: "success" });
        router.refresh();
      }
    });
  }

  function goToNotion(direction: 1 | -1) {
    const target = direction === 1 ? nextNotion : prevNotion;
    if (target) router.push(`/apps/el-profesor/notions/${target.notionId}`);
  }

  // A plain `<a href="#...">` chip pushes a browser-history entry on every
  // click — "back" would then cycle through past sections instead of
  // leaving the page. scrollIntoView jumps just as well without touching
  // history or the URL hash.
  function scrollToSection(index: number) {
    sectionRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {(prevNotion || nextNotion) && (
        // Small floating round nav buttons (requested 2026-08-29), same
        // shape and placement as the fiche reader's own chapter-nav
        // buttons — moves through the same category→notion reading order
        // as NotionList (glossary-view.tsx), not just alphabetical.
        <>
          <button
            type="button"
            onClick={() => goToNotion(-1)}
            disabled={!prevNotion}
            aria-label="Notion précédente"
            title={prevNotion ? `Précédent : ${prevNotion.notionName}` : "Notion précédente"}
            className="fixed bottom-4 left-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface/90 text-foreground-subtle shadow-md backdrop-blur transition-opacity disabled:opacity-0"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => goToNotion(1)}
            disabled={!nextNotion}
            aria-label="Notion suivante"
            title={nextNotion ? `Suivant : ${nextNotion.notionName}` : "Notion suivante"}
            className="fixed bottom-4 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface/90 text-foreground-subtle shadow-md backdrop-blur transition-opacity disabled:opacity-0"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
      <Link href="/apps/el-profesor" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground-subtle hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour à la bibliothèque
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif-display text-2xl font-medium text-foreground">{notionName}</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {fiches.length} fiche{fiches.length > 1 ? "s" : ""} liée{fiches.length > 1 ? "s" : ""}
            {distinctBooks > 1 ? ` · ${distinctBooks} livres` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {synthesis && (
            <Badge variant={synthesis.status === "published" ? "success" : "accent"}>{synthesis.status === "published" ? "Synthèse publiée" : "Brouillon"}</Badge>
          )}
          {synthesis && synthesis.blocks.length > 0 && (
            <Button variant="ghost" size="icon" onClick={() => setOptionsMenuOpen(true)} aria-label="Options de lecture" title="Options de lecture">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          )}
        </div>
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
          {synthesis && (
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={isPending}>
              <Trash2 className="h-3.5 w-3.5" /> Supprimer la synthèse
            </Button>
          )}
          <span className="text-xs text-foreground-subtle">
            Relit tout le contenu publié de cette notion et le réécrit en une seule fiche dédupliquée — coûte un appel IA.
          </span>
        </div>
      )}

      {optionsMenuOpen && (
        <Modal title="Options de lecture" onClose={() => setOptionsMenuOpen(false)} size="sm">
          <div className="-m-4 flex flex-col gap-0.5 p-2">
            <div className="flex items-center justify-between px-3 py-2 text-sm text-foreground">
              <span>Taille du texte</span>
              <div className="flex items-center gap-0.5 rounded-full border border-border">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => adjustFontScale(-1)}
                  disabled={fontScale === "sm"}
                  aria-label="Réduire le texte"
                  title="Réduire le texte"
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="text-[10px] font-medium text-foreground-subtle">Aa</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => adjustFontScale(1)}
                  disabled={fontScale === "lg"}
                  aria-label="Agrandir le texte"
                  title="Agrandir le texte"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <OptionToggleRow icon={AlignJustify} label="Texte justifié" active={textJustify} onClick={toggleTextJustify} />
            <OptionToggleRow icon={Sun} label="Lecture confort (sépia)" active={readingComfort} onClick={toggleReadingComfort} />
            <OptionToggleRow icon={SpellCheck} label="Police adaptée dyslexie" active={dyslexicFont} onClick={toggleDyslexicFont} />
          </div>
        </Modal>
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
        <div className="mt-5">
          {/* Sticky running header (requested 2026-08-29 — "le titre reste
              en haut sur la fiche, ça c'est le mode livre") — mirrors
              ImmersiveFicheReader's own "livre" header exactly: a small
              caps context line (there: chapterTitle · ficheIndex/Count;
              here: notionName · section index/count), then the CURRENT
              unit's title pinned large in serif underneath. For a fiche
              that's the fiche title as you swipe between fiches; here it's
              the active section's title, tracked by the same scroll-spy
              that drives the chip strip below it.
              top-16 (not top-0!) — unlike the fiche's ImmersiveFicheReader,
              which is a fixed full-viewport overlay that covers the hub's
              own header entirely, this page stays in normal flow under
              HubHeader's own `sticky top-0 z-30` (hub-header.tsx). At
              top-0 the two sticky elements shared the same origin and the
              hub header (higher z-index) painted over ours, hiding this
              bar's top two lines — only the chip row (lower in the box)
              peeked out below it. */}
          <div className="sticky top-16 z-10 -mx-4 mb-4 bg-background/95 px-4 pb-3 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">
              {notionName} · {activeSection + 1}/{sections.length}
            </p>
            <h2 className="mt-1.5 truncate text-balance font-serif-display text-[20px] font-medium leading-tight text-foreground">
              {sections[activeSection]?.title}
            </h2>
            {sections.length > 1 && (
              <div className="mt-2.5 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {sections.map((section, i) => (
                  <button
                    type="button"
                    key={`${section.title}-${i}`}
                    ref={(el) => {
                      chipRefs.current[i] = el;
                    }}
                    onClick={() => scrollToSection(i)}
                    className={`max-w-[45vw] shrink-0 truncate rounded-full border px-3 py-1 text-xs font-medium transition-colors sm:max-w-[220px] ${
                      activeSection === i
                        ? "border-primary bg-primary-tint text-primary-strong"
                        : "border-border bg-surface text-foreground-subtle hover:border-primary/40 hover:text-primary-strong"
                    }`}
                  >
                    {section.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            className="space-y-8"
            style={
              {
                ...(readingComfort
                  ? {
                      "--background": "#f4ecd8",
                      "--surface": "#f4ecd8",
                      "--surface-muted": "#ece0c6",
                      "--foreground": "#3b3226",
                      "--foreground-muted": "#5a4d3a",
                      "--foreground-subtle": "#7a6c54",
                      "--border": "#ddceac",
                    }
                  : {}),
                ...(dyslexicFont ? { fontFamily: "var(--font-dyslexic)" } : {}),
              } as CSSProperties
            }
          >
            {sections.map(({ title, blocks }, sectionIndex) => {
              const sources = sectionSources(blocks);
              return (
                <div
                  key={title}
                  id={`synthesis-section-${sectionIndex}`}
                  ref={(el) => {
                    sectionRefs.current[sectionIndex] = el;
                  }}
                  className="scroll-mt-48"
                >
                  <h2 className="font-serif-display text-lg font-medium text-foreground">{title}</h2>
                  <div className={isAdmin ? "mt-2 space-y-3" : "mt-2 divide-y divide-border"}>
                    {blocks.map((block, i) =>
                      isAdmin ? (
                        <SynthesisBlockEditor
                          key={block.id}
                          block={block}
                          isFirst={i === 0}
                          isLast={i === blocks.length - 1}
                          onChanged={refresh}
                          justify={textJustify}
                        />
                      ) : (
                        <SynthesisBlockCard key={block.id} block={block} fontScale={fontScale} justify={textJustify} />
                      )
                    )}
                  </div>
                  {sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] text-foreground-subtle/80">
                      <span>Sources :</span>
                      {sources.map((s, i) => (
                        <span key={s.chapterId}>
                          <Link href={`/apps/el-profesor/chapters/${s.chapterId}`} className="hover:text-primary-strong hover:underline">
                            {s.bookTitle}
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
