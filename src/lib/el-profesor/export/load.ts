import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Database } from "@/lib/supabase/types";
import type { BlockContent, BlockType, Citation } from "../types";
import type { ExportBlock, ExportFiche, ExportImage, ExportPart, ExportVolume } from "./model";
import { chapterPages, planVolumes, type VolumePlan } from "./volumes";

type Admin = SupabaseClient<Database>;

const ID_CHUNK = 100;
const PAGE = 1000;
/** Illustrations are downsized to this width (px) for print: sharp enough at the column's width, light enough for a 500-page file. */
const IMAGE_MAX_WIDTH = 1400;

/** Every row of a query, page by page (PostgREST returns at most 1,000 at a time). */
type Rows = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

async function allRows<T>(run: (from: number, to: number) => Rows): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw new Error(`Lecture du livre impossible : ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < PAGE) return out;
  }
}

async function byChunks<T>(ids: string[], run: (part: string[], from: number, to: number) => Rows): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const part = ids.slice(i, i + ID_CHUNK);
    out.push(...(await allRows<T>((from, to) => run(part, from, to))));
  }
  return out;
}

type ChapterRow = { id: string; title: string; part_title: string | null; sub_part_title: string | null; order_index: number };

async function bookOutline(supabase: Admin, bookId: string) {
  const { data: book, error } = await supabase.from("el_profesor_books").select("title").eq("id", bookId).maybeSingle();
  if (error || !book) throw new Error("Livre introuvable.");
  const chapters = await allRows<ChapterRow>((from, to) =>
    supabase.from("el_profesor_chapters").select("id, title, part_title, sub_part_title, order_index").eq("book_id", bookId).order("order_index").order("id").range(from, to)
  );
  const sizes = await chapterSizes(supabase, bookId, chapters.map((c) => c.id));
  const withFiches = chapters.filter((c) => sizes.get(c.id)?.fiches);
  const plans = planVolumes(
    withFiches.map((c) => {
      const size = sizes.get(c.id)!;
      return { id: c.id, partTitle: c.part_title, subPartTitle: c.sub_part_title, ficheCount: size.fiches, pages: chapterPages(size.chars, size.fiches) };
    })
  );
  return { bookTitle: book.title, chapters: withFiches, plans };
}

/** Published fiches and amount of text per chapter (migration 105); before it's applied, fiche counts only. */
async function chapterSizes(supabase: Admin, bookId: string, chapterIds: string[]): Promise<Map<string, { fiches: number; chars: number | null }>> {
  const rpc = supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => PromiseLike<{ data: { chapter_id: string; fiches: number; chars: number }[] | null; error: { message: string } | null }>;
  const { data, error } = await rpc.call(supabase, "el_profesor_chapter_text_sizes", { p_book_id: bookId });
  if (!error && data) return new Map(data.map((r) => [r.chapter_id, { fiches: r.fiches, chars: Number(r.chars) }]));
  const subEntities = await byChunks<{ id: string; chapter_id: string }>(chapterIds, (part, from, to) =>
    supabase.from("el_profesor_sub_entities").select("id, chapter_id").in("chapter_id", part).order("id").range(from, to)
  );
  const sizes = new Map<string, { fiches: number; chars: number | null }>();
  for (const s of subEntities) sizes.set(s.chapter_id, { fiches: (sizes.get(s.chapter_id)?.fiches ?? 0) + 1, chars: null });
  return sizes;
}

/** The volumes a book is exported as (cheap: titles and fiche counts only). */
export async function listExportVolumes(supabase: Admin, bookId: string): Promise<{ bookTitle: string; volumes: VolumePlan[] }> {
  const { bookTitle, plans } = await bookOutline(supabase, bookId);
  return { bookTitle, volumes: plans };
}

/** One volume, ready to lay out: published content only, illustrations fetched and downsized. */
export async function loadExportVolume(supabase: Admin, bookId: string, volumeNumber: number): Promise<ExportVolume> {
  const { bookTitle, chapters, plans } = await bookOutline(supabase, bookId);
  const plan = plans.find((p) => p.number === volumeNumber);
  if (!plan) throw new Error(`Tome ${volumeNumber} introuvable.`);
  const wanted = new Set(plan.chapterIds);
  const volumeChapters = chapters.filter((c) => wanted.has(c.id));

  const subEntities = await byChunks<{ id: string; chapter_id: string; name: string; summary: string | null; order_index: number }>(plan.chapterIds, (part, from, to) =>
    supabase.from("el_profesor_sub_entities").select("id, chapter_id, name, summary, order_index").in("chapter_id", part).order("id").range(from, to)
  );
  const fiches = await byChunks<{ id: string; sub_entity_id: string }>(subEntities.map((s) => s.id), (part, from, to) =>
    supabase.from("el_profesor_fiches").select("id, sub_entity_id").in("sub_entity_id", part).eq("status", "published").order("id").range(from, to)
  );
  const blocks = await byChunks<{ fiche_id: string; order_index: number; block_type: string; content: unknown; citations: unknown; image_url: string | null; image_alt: string | null }>(
    fiches.map((f) => f.id),
    (part, from, to) =>
      supabase
        .from("el_profesor_fiche_blocks")
        .select("fiche_id, order_index, block_type, content, citations, image_url, image_alt")
        .in("fiche_id", part)
        .eq("status", "published")
        .order("fiche_id")
        .order("order_index")
        .range(from, to)
  );

  const images = await loadImages([...new Set(blocks.map((b) => b.image_url).filter((u): u is string => Boolean(u)))]);
  const ficheBySubEntity = new Map(fiches.map((f) => [f.sub_entity_id, f.id]));
  const blocksByFiche = new Map<string, typeof blocks>();
  for (const b of blocks) {
    const list = blocksByFiche.get(b.fiche_id) ?? [];
    list.push(b);
    blocksByFiche.set(b.fiche_id, list);
  }

  const parts: ExportPart[] = [];
  for (const chapter of volumeChapters) {
    let part = parts.at(-1);
    if (!part || part.title !== chapter.part_title) parts.push((part = { title: chapter.part_title, subParts: [] }));
    let subPart = part.subParts.at(-1);
    if (!subPart || subPart.title !== chapter.sub_part_title) part.subParts.push((subPart = { title: chapter.sub_part_title, chapters: [] }));
    const exportFiches: ExportFiche[] = subEntities
      .filter((s) => s.chapter_id === chapter.id)
      .sort((a, b) => a.order_index - b.order_index || a.id.localeCompare(b.id))
      .flatMap((s) => {
        const ficheId = ficheBySubEntity.get(s.id);
        if (!ficheId) return [];
        const rows = (blocksByFiche.get(ficheId) ?? []).sort((a, b) => a.order_index - b.order_index);
        const exportBlocks: ExportBlock[] = rows.map((r) => {
          const image = r.image_url ? images.get(r.image_url) : undefined;
          return { type: r.block_type as BlockType, content: r.content as BlockContent, image: image ? { ...image, alt: r.image_alt } : null };
        });
        return [{ title: s.name, summary: s.summary?.trim() || null, blocks: exportBlocks, sources: sourcesOf(rows.flatMap((r) => (Array.isArray(r.citations) ? (r.citations as Citation[]) : []))) }];
      });
    if (exportFiches.length) subPart.chapters.push({ title: chapter.title, fiches: exportFiches });
  }

  return {
    bookTitle,
    number: plan.number,
    count: plans.length,
    title: plan.title,
    parts,
    date: new Date().toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Brussels" }),
  };
}

/** « Miller's anesthesia : p. 1234, 1240 » per source book, in order of first citation. */
export function sourcesOf(citations: Citation[]): string[] {
  const books = new Map<string, Set<number>>();
  for (const c of citations) {
    const book = c.bookTitle?.trim();
    if (!book) continue;
    const pages = books.get(book) ?? new Set<number>();
    if (!c.url && c.page > 0) pages.add(c.page);
    books.set(book, pages);
  }
  return [...books].map(([book, pages]) => (pages.size ? `${book} : p. ${[...pages].sort((a, b) => a - b).join(", ")}` : book));
}

async function loadImages(urls: string[]): Promise<Map<string, Omit<ExportImage, "alt">>> {
  const out = new Map<string, Omit<ExportImage, "alt">>();
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++];
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const input = Buffer.from(await res.arrayBuffer());
        // Any upload format (webp, heic, png with transparency…) becomes a flattened JPEG, the two formats PDF and Word both embed.
        const { data, info } = await sharp(input)
          .rotate()
          .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 82 })
          .toBuffer({ resolveWithObject: true });
        out.set(url, { data: new Uint8Array(data), format: "jpeg", width: info.width, height: info.height });
      } catch (err) {
        console.error("[el-profesor/export] illustration ignorée :", url, err);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}
