"use server";

import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";

export interface SearchResult {
  chapterId: string;
  chapterTitle: string;
  bookTitle: string;
  subEntityId: string;
  subEntityName: string;
  ficheTitle: string;
}

/**
 * Searches published sub-entity names, fiche titles, and — added 2026-08-24
 * ("le socle", rang 1 des pistes d'amélioration) — the actual text of
 * published blocks and flashcards, via the `search_vector` tsvector
 * maintained by a DB trigger (see migration 20260101000059). Before this,
 * a term present only inside a block/flashcard and absent from every title
 * was simply unfindable. Across the whole library, or scoped to one book.
 */
export async function searchLibrary(query: string, bookId?: string): Promise<SearchResult[]> {
  await requireElProfesorAccess();
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const supabase = await createClient();

  const [fichesByTitleRes, subEntitiesByNameRes, blocksByContentRes, flashcardsByContentRes] = await Promise.all([
    supabase.from("el_profesor_fiches").select("id, title, sub_entity_id").eq("status", "published").ilike("title", `%${trimmed}%`).limit(15),
    supabase.from("el_profesor_sub_entities").select("id, name, chapter_id").ilike("name", `%${trimmed}%`).limit(15),
    supabase
      .from("el_profesor_fiche_blocks")
      .select("fiche_id")
      .eq("status", "published")
      .textSearch("search_vector", trimmed, { type: "websearch", config: "french" })
      .limit(15),
    supabase
      .from("el_profesor_flashcards")
      .select("fiche_id")
      .eq("status", "published")
      .textSearch("search_vector", trimmed, { type: "websearch", config: "french" })
      .limit(15),
  ]);

  const ficheBySubEntity = new Map<string, { id: string; title: string }>();
  for (const f of fichesByTitleRes.data ?? []) ficheBySubEntity.set(f.sub_entity_id, { id: f.id, title: f.title });

  const subEntityIdsFromNameMatch = (subEntitiesByNameRes.data ?? []).map((s) => s.id);
  if (subEntityIdsFromNameMatch.length > 0) {
    const { data } = await supabase
      .from("el_profesor_fiches")
      .select("id, title, sub_entity_id")
      .eq("status", "published")
      .in("sub_entity_id", subEntityIdsFromNameMatch);
    for (const f of data ?? []) {
      if (!ficheBySubEntity.has(f.sub_entity_id)) ficheBySubEntity.set(f.sub_entity_id, { id: f.id, title: f.title });
    }
  }

  const contentMatchFicheIds = [
    ...new Set([...(blocksByContentRes.data ?? []).map((b) => b.fiche_id), ...(flashcardsByContentRes.data ?? []).map((c) => c.fiche_id)]),
  ];
  if (contentMatchFicheIds.length > 0) {
    const { data } = await supabase.from("el_profesor_fiches").select("id, title, sub_entity_id").eq("status", "published").in("id", contentMatchFicheIds);
    for (const f of data ?? []) {
      if (!ficheBySubEntity.has(f.sub_entity_id)) ficheBySubEntity.set(f.sub_entity_id, { id: f.id, title: f.title });
    }
  }

  const subEntityIds = [...ficheBySubEntity.keys()];
  if (subEntityIds.length === 0) return [];

  const { data: subEntities } = await supabase.from("el_profesor_sub_entities").select("id, name, chapter_id").in("id", subEntityIds);
  const chapterIds = [...new Set((subEntities ?? []).map((s) => s.chapter_id))];
  if (chapterIds.length === 0) return [];

  let chaptersQuery = supabase.from("el_profesor_chapters").select("id, title, book_id").in("id", chapterIds).eq("status", "published");
  if (bookId) chaptersQuery = chaptersQuery.eq("book_id", bookId);
  const { data: chapters } = await chaptersQuery;
  const chapterById = new Map((chapters ?? []).map((c) => [c.id, c]));

  const bookIds = [...new Set((chapters ?? []).map((c) => c.book_id))];
  const { data: books } = bookIds.length > 0 ? await supabase.from("el_profesor_books").select("id, title").in("id", bookIds) : { data: [] };
  const bookTitleById = new Map((books ?? []).map((b) => [b.id, b.title]));

  const results: SearchResult[] = [];
  for (const sub of subEntities ?? []) {
    const chapter = chapterById.get(sub.chapter_id);
    const fiche = ficheBySubEntity.get(sub.id);
    if (!chapter || !fiche) continue; // chapter not published, or no published fiche for this sub-entity
    results.push({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      bookTitle: bookTitleById.get(chapter.book_id) ?? "",
      subEntityId: sub.id,
      subEntityName: sub.name,
      ficheTitle: fiche.title,
    });
  }
  return results.slice(0, 20);
}
